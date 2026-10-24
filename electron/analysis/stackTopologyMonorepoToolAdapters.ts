/**
 * Topology adapters for the Bazel and Pants monorepo tools: workspace files, BUILD files and the
 * source and dependency targets that BUILD files reference.
 */
import * as path from 'path';
import {
  createRelationship,
  escapeRegExp,
  FileContentEntry,
  StackAdapterContext,
  toRelativeList,
} from './stackTopologySupport';
import { configFilesNamed, filesWithBasename, readRelativeEntries } from './stackTopologySources';
import { defineAdapter } from './stackTopologyAdapterFactory';
import { fanOutLinks } from './stackTopologyLinks';

const extractQuotedValues = (text: string) =>
  Array.from(text.matchAll(/["']([^"'\\]+)["']/g))
    .map((match) => match[1])
    .filter((value): value is string => Boolean(value));

const extractNamedListValues = (text: string, fieldNames: string[]) =>
  fieldNames.flatMap((fieldName) =>
    Array.from(
      text.matchAll(new RegExp(`\\b${escapeRegExp(fieldName)}\\s*=\\s*\\[([\\s\\S]*?)\\]`, 'g'))
    ).flatMap((match) => extractQuotedValues(match[1] || ''))
  );

const extractBazelSrcs = (text: string) => extractNamedListValues(text, ['srcs', 'outs', 'hdrs']);
const extractBazelDeps = (text: string) =>
  extractNamedListValues(text, ['deps', 'exports', 'runtime_deps']);
const extractPantsSources = (text: string) => extractNamedListValues(text, ['sources']);
const extractPantsDependencies = (text: string) => extractNamedListValues(text, ['dependencies']);

/** What a label or address points at: a source file, or the BUILD file of a package. */
type ResolvedTarget = { descriptor?: string; file?: string } | null;

type TargetResolver = (
  context: StackAdapterContext,
  sourceRelativePath: string,
  rawReference: string
) => ResolvedTarget;

/** The first BUILD file among `names` that exists in the package directory. */
const resolveBuildDescriptor = (
  context: StackAdapterContext,
  packagePath: string,
  names: string[]
) => {
  const normalizedPackage = packagePath.replace(/^\/+|\/+$/g, '');
  return (
    names
      .map((name) => (normalizedPackage ? `${normalizedPackage}/${name}` : name))
      .find((candidate) => context.hasRelativePath(candidate)) || null
  );
};

/** A target named like a file (`lib.ts`, `src/a.py`) that exists in its package. */
const findTargetFile = (context: StackAdapterContext, packagePath: string, target: string) => {
  if (!target || !/[./]/.test(target)) return null;
  const fileCandidate = path.posix.normalize(path.posix.join(packagePath, target));
  return context.hasRelativePath(fileCandidate) ? fileCandidate : null;
};

/** A plain reference names a file next to the one that mentions it. */
const resolveSiblingFile = (
  context: StackAdapterContext,
  sourceRelativePath: string,
  reference: string
): ResolvedTarget => {
  const fileCandidate = path.posix.normalize(
    path.posix.join(path.posix.dirname(sourceRelativePath), reference)
  );
  return context.hasRelativePath(fileCandidate) ? { file: fileCandidate } : null;
};

/** A target inside a package: its source file when it names one, else the package's BUILD file. */
const resolveInPackage = (
  context: StackAdapterContext,
  packagePath: string,
  target: string,
  descriptorNames: string[]
): ResolvedTarget => {
  const targetFile = findTargetFile(context, packagePath, target);
  if (targetFile) return { file: targetFile };

  const descriptor = resolveBuildDescriptor(context, packagePath, descriptorNames);
  return descriptor ? { descriptor } : null;
};

/** `//pkg:name` or `:name` into the package directory and the target name. */
const splitBazelLabel = (label: string, sourceDir: string) => {
  if (label.startsWith('//')) {
    const [, body] = label.split('//');
    const [pkg, targetName = ''] = (body || '').split(':');
    return { packagePath: pkg || '', target: targetName };
  }
  return { packagePath: sourceDir === '.' ? '' : sourceDir, target: label.slice(1) };
};

/**
 * Resolves a Bazel label (`//pkg:name`, `:name` or a plain file name) found in a BUILD file to a
 * source file or the BUILD file of the target package. External (`@repo`) labels are not resolved.
 */
const resolveBazelLabel: TargetResolver = (context, sourceRelativePath, rawLabel) => {
  const label = rawLabel.trim();
  if (!label || label.startsWith('@')) {
    return null;
  }

  if (!label.startsWith('//') && !label.startsWith(':')) {
    return resolveSiblingFile(context, sourceRelativePath, label);
  }

  const { packagePath, target } = splitBazelLabel(label, path.posix.dirname(sourceRelativePath));
  return resolveInPackage(context, packagePath, target, ['BUILD.bazel', 'BUILD']);
};

/**
 * Resolves a Pants address (`path:name` or a plain file name) found in a BUILD file to a source
 * file or the BUILD file of the target package. `//` and `@` addresses are not resolved.
 */
const resolvePantsAddress: TargetResolver = (context, sourceRelativePath, rawAddress) => {
  const address = rawAddress.trim();
  if (!address || address.startsWith('//') || address.includes('@')) {
    return null;
  }

  if (!address.includes(':')) {
    return resolveSiblingFile(context, sourceRelativePath, address);
  }

  const sourceDir = path.posix.dirname(sourceRelativePath);
  const [maybePath, target = ''] = address.split(':');
  const packagePath = maybePath ? maybePath : sourceDir === '.' ? '' : sourceDir;
  return resolveInPackage(context, packagePath, target, ['BUILD', 'BUILD.pants']);
};

interface BuildFileAdapterSpec {
  id: string;
  displayName: string;
  stackId: string;
  /** How the summary names the tool, e.g. `Bazel`. */
  label: string;
  /** Prefix of the relationship reasons, e.g. `bazel` -> `bazel_target_source`. */
  prefix: string;
  /** Workspace files at the project root; each one links to every BUILD file. */
  configNames: string[];
  buildNames: string[];
  extractSources: (text: string) => string[];
  extractDependencies: (text: string) => string[];
  resolve: TargetResolver;
}

/** Links from each BUILD file to the source files and the other packages its targets name. */
const buildTargetLinks = (
  context: StackAdapterContext,
  entries: FileContentEntry[],
  spec: BuildFileAdapterSpec
) =>
  entries.flatMap((entry) => [
    ...spec.extractSources(entry.text).flatMap((reference) => {
      const resolved = spec.resolve(context, entry.filePath, reference);
      return resolved?.file
        ? [
            createRelationship(
              entry.filePath,
              resolved.file,
              'build',
              `${spec.prefix}_target_source`
            ),
          ]
        : [];
    }),
    ...spec.extractDependencies(entry.text).flatMap((reference) => {
      const resolved = spec.resolve(context, entry.filePath, reference);
      const target =
        resolved?.descriptor && resolved.descriptor !== entry.filePath
          ? resolved.descriptor
          : resolved?.file;
      return target
        ? [createRelationship(entry.filePath, target, 'build', `${spec.prefix}_target_dependency`)]
        : [];
    }),
  ]);

/** Bazel and Pants: workspace files, BUILD files and the targets that refer to each other. */
const defineBuildFileAdapter = (spec: BuildFileAdapterSpec) =>
  defineAdapter({
    id: spec.id,
    displayName: spec.displayName,
    category: 'build',
    stackId: spec.stackId,
    find: async (context) => {
      const configFiles = configFilesNamed(context, spec.configNames);
      const buildFiles = filesWithBasename(context, spec.buildNames);
      const entries = await readRelativeEntries(context, buildFiles);
      const relationships = [
        ...fanOutLinks(
          toRelativeList(context, configFiles),
          entries.map((entry) => entry.filePath),
          `${spec.prefix}_workspace_package`
        ),
        ...buildTargetLinks(context, entries, spec),
      ];

      return {
        summary: `Detected ${buildFiles.length} ${spec.label} BUILD descriptors and ${relationships.length} workspace/dependency/source relationships.`,
        details: {
          entryFiles: toRelativeList(context, configFiles),
          configFiles: toRelativeList(context, [...configFiles, ...buildFiles]),
          modules: entries.map((entry) => entry.filePath),
          relationships,
        },
      };
    },
  });

export const bazelAdapter = defineBuildFileAdapter({
  id: 'bazel-build-topology',
  displayName: 'Bazel Build Topology',
  stackId: 'bazel',
  label: 'Bazel',
  prefix: 'bazel',
  configNames: ['WORKSPACE', 'WORKSPACE.bazel', 'MODULE.bazel'],
  buildNames: ['BUILD', 'BUILD.bazel'],
  extractSources: extractBazelSrcs,
  extractDependencies: extractBazelDeps,
  resolve: resolveBazelLabel,
});

export const pantsAdapter = defineBuildFileAdapter({
  id: 'pants-build-topology',
  displayName: 'Pants Build Topology',
  stackId: 'pants',
  label: 'Pants',
  prefix: 'pants',
  configNames: ['pants.toml', 'BUILDROOT', 'pyproject.toml'],
  buildNames: ['BUILD', 'BUILD.pants'],
  extractSources: extractPantsSources,
  extractDependencies: extractPantsDependencies,
  resolve: resolvePantsAddress,
});

import * as path from 'path';
import {
  createInsight,
  createRelationship,
  escapeRegExp,
  StackAdapter,
  StackAdapterContext,
  StackStructuralRelationship,
  toRelativeList,
} from './stackTopologySupport';

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

const resolveBazelBuildFile = (context: StackAdapterContext, packagePath: string) => {
  const normalizedPackage = packagePath.replace(/^\/+|\/+$/g, '');
  const candidates = [
    normalizedPackage ? `${normalizedPackage}/BUILD.bazel` : 'BUILD.bazel',
    normalizedPackage ? `${normalizedPackage}/BUILD` : 'BUILD',
  ];

  return candidates.find((candidate) => context.hasRelativePath(candidate)) || null;
};

const resolveBazelLabel = (
  context: StackAdapterContext,
  sourceRelativePath: string,
  rawLabel: string
): { descriptor?: string; file?: string } | null => {
  const label = rawLabel.trim();
  if (!label || label.startsWith('@')) {
    return null;
  }

  const sourceDir = path.posix.dirname(sourceRelativePath);

  if (!label.startsWith('//') && !label.startsWith(':')) {
    const fileCandidate = path.posix.normalize(path.posix.join(sourceDir, label));
    return context.hasRelativePath(fileCandidate) ? { file: fileCandidate } : null;
  }

  let packagePath: string;
  let target: string;

  if (label.startsWith('//')) {
    const [, body] = label.split('//');
    const [pkg, targetName = ''] = (body || '').split(':');
    packagePath = pkg || '';
    target = targetName;
  } else {
    packagePath = sourceDir === '.' ? '' : sourceDir;
    target = label.slice(1);
  }

  if (target && /[./]/.test(target)) {
    const fileCandidate = path.posix.normalize(path.posix.join(packagePath, target));
    if (context.hasRelativePath(fileCandidate)) {
      return { file: fileCandidate };
    }
  }

  const descriptor = resolveBazelBuildFile(context, packagePath);
  return descriptor ? { descriptor } : null;
};

const extractPantsSources = (text: string) => extractNamedListValues(text, ['sources']);
const extractPantsDependencies = (text: string) => extractNamedListValues(text, ['dependencies']);

const resolvePantsBuildFile = (context: StackAdapterContext, packagePath: string) => {
  const normalizedPackage = packagePath.replace(/^\/+|\/+$/g, '');
  const candidates = [
    normalizedPackage ? `${normalizedPackage}/BUILD` : 'BUILD',
    normalizedPackage ? `${normalizedPackage}/BUILD.pants` : 'BUILD.pants',
  ];

  return candidates.find((candidate) => context.hasRelativePath(candidate)) || null;
};

const resolvePantsAddress = (
  context: StackAdapterContext,
  sourceRelativePath: string,
  rawAddress: string
): { descriptor?: string; file?: string } | null => {
  const address = rawAddress.trim();
  if (!address || address.startsWith('//') || address.includes('@')) {
    return null;
  }

  const sourceDir = path.posix.dirname(sourceRelativePath);

  if (!address.includes(':')) {
    const fileCandidate = path.posix.normalize(path.posix.join(sourceDir, address));
    return context.hasRelativePath(fileCandidate) ? { file: fileCandidate } : null;
  }

  const [maybePath, target = ''] = address.split(':');
  const packagePath = maybePath ? maybePath : sourceDir === '.' ? '' : sourceDir;

  if (target && /[./]/.test(target)) {
    const fileCandidate = path.posix.normalize(path.posix.join(packagePath, target));
    if (context.hasRelativePath(fileCandidate)) {
      return { file: fileCandidate };
    }
  }

  const descriptor = resolvePantsBuildFile(context, packagePath);
  return descriptor ? { descriptor } : null;
};

export const bazelAdapter: StackAdapter = {
  id: 'bazel-build-topology',
  displayName: 'Bazel Build Topology',
  category: 'build',
  supports: (context) => !!context.getDetectedStack('bazel'),
  analyze: async (context) => {
    const configFiles = context
      .getAllFilePaths()
      .filter((filePath) =>
        ['WORKSPACE', 'WORKSPACE.bazel', 'MODULE.bazel'].includes(
          context.getProjectRelativePath(filePath)
        )
      );
    const buildFiles = context
      .getAllFilePaths()
      .filter((filePath) =>
        ['BUILD', 'BUILD.bazel'].includes(
          path.posix.basename(context.getProjectRelativePath(filePath))
        )
      );
    const buildContents = await context.readTexts(buildFiles);
    const relativeEntries = buildContents.map((entry) => ({
      filePath: context.getProjectRelativePath(entry.filePath),
      text: entry.text,
    }));

    const relationships: StackStructuralRelationship[] = [
      ...configFiles.flatMap((configFile) =>
        relativeEntries.map((entry) =>
          createRelationship(
            context.getProjectRelativePath(configFile),
            entry.filePath,
            'build',
            'bazel_workspace_package'
          )
        )
      ),
      ...relativeEntries.flatMap((entry) =>
        extractBazelSrcs(entry.text).flatMap((sourceValue) => {
          const resolved = resolveBazelLabel(context, entry.filePath, sourceValue);
          return resolved?.file
            ? [createRelationship(entry.filePath, resolved.file, 'build', 'bazel_target_source')]
            : [];
        })
      ),
      ...relativeEntries.flatMap((entry) =>
        extractBazelDeps(entry.text).flatMap((dependencyLabel) => {
          const resolved = resolveBazelLabel(context, entry.filePath, dependencyLabel);
          if (resolved?.descriptor && resolved.descriptor !== entry.filePath) {
            return [
              createRelationship(
                entry.filePath,
                resolved.descriptor,
                'build',
                'bazel_target_dependency'
              ),
            ];
          }
          return resolved?.file
            ? [
                createRelationship(
                  entry.filePath,
                  resolved.file,
                  'build',
                  'bazel_target_dependency'
                ),
              ]
            : [];
        })
      ),
    ];

    return createInsight(
      bazelAdapter.id,
      bazelAdapter.displayName,
      bazelAdapter.category,
      `Detected ${buildFiles.length} Bazel BUILD descriptors and ${relationships.length} workspace/dependency/source relationships.`,
      {
        evidence: context.getDetectedStack('bazel')?.evidence || [],
        entryFiles: toRelativeList(context, configFiles),
        configFiles: toRelativeList(context, [...configFiles, ...buildFiles]),
        modules: relativeEntries.map((entry) => entry.filePath),
        relationships,
      }
    );
  },
};

export const pantsAdapter: StackAdapter = {
  id: 'pants-build-topology',
  displayName: 'Pants Build Topology',
  category: 'build',
  supports: (context) => !!context.getDetectedStack('pants'),
  analyze: async (context) => {
    const configFiles = context
      .getAllFilePaths()
      .filter((filePath) =>
        ['pants.toml', 'BUILDROOT', 'pyproject.toml'].includes(
          context.getProjectRelativePath(filePath)
        )
      );
    const buildFiles = context
      .getAllFilePaths()
      .filter((filePath) =>
        ['BUILD', 'BUILD.pants'].includes(
          path.posix.basename(context.getProjectRelativePath(filePath))
        )
      );
    const buildContents = await context.readTexts(buildFiles);
    const relativeEntries = buildContents.map((entry) => ({
      filePath: context.getProjectRelativePath(entry.filePath),
      text: entry.text,
    }));

    const relationships: StackStructuralRelationship[] = [
      ...configFiles.flatMap((configFile) =>
        relativeEntries.map((entry) =>
          createRelationship(
            context.getProjectRelativePath(configFile),
            entry.filePath,
            'build',
            'pants_workspace_package'
          )
        )
      ),
      ...relativeEntries.flatMap((entry) =>
        extractPantsSources(entry.text).flatMap((sourceValue) => {
          const resolved = resolvePantsAddress(context, entry.filePath, sourceValue);
          return resolved?.file
            ? [createRelationship(entry.filePath, resolved.file, 'build', 'pants_target_source')]
            : [];
        })
      ),
      ...relativeEntries.flatMap((entry) =>
        extractPantsDependencies(entry.text).flatMap((dependencyAddress) => {
          const resolved = resolvePantsAddress(context, entry.filePath, dependencyAddress);
          if (resolved?.descriptor && resolved.descriptor !== entry.filePath) {
            return [
              createRelationship(
                entry.filePath,
                resolved.descriptor,
                'build',
                'pants_target_dependency'
              ),
            ];
          }
          return resolved?.file
            ? [
                createRelationship(
                  entry.filePath,
                  resolved.file,
                  'build',
                  'pants_target_dependency'
                ),
              ]
            : [];
        })
      ),
    ];

    return createInsight(
      pantsAdapter.id,
      pantsAdapter.displayName,
      pantsAdapter.category,
      `Detected ${buildFiles.length} Pants BUILD descriptors and ${relationships.length} workspace/dependency/source relationships.`,
      {
        evidence: context.getDetectedStack('pants')?.evidence || [],
        entryFiles: toRelativeList(context, configFiles),
        configFiles: toRelativeList(context, [...configFiles, ...buildFiles]),
        modules: relativeEntries.map((entry) => entry.filePath),
        relationships,
      }
    );
  },
};

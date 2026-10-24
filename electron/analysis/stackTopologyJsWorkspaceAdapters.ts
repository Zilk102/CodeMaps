/**
 * Topology adapters for JavaScript build tooling: Vite entries and config, and the pnpm, Nx and
 * Turborepo workspaces with their packages and package-to-package dependencies.
 */
import * as path from 'path';
import {
  createRelationship,
  escapeRegExp,
  FileContentEntry,
  StackAdapterContext,
  toRelativeList,
} from './stackTopologySupport';
import { configFilesNamed, findFileNamed, readRelativeEntries } from './stackTopologySources';
import { defineAdapter } from './stackTopologyAdapterFactory';
import { fanOutLinks } from './stackTopologyLinks';

export const viteAdapter = defineAdapter({
  id: 'vite-build-topology',
  displayName: 'Vite Build Topology',
  category: 'build',
  stackId: 'vite',
  find: (context) => {
    const configFiles = configFilesNamed(context, [
      'vite.config.ts',
      'vite.config.js',
      'vite.config.mjs',
    ]);
    const entryFiles = configFilesNamed(context, [
      'index.html',
      'src/main.ts',
      'src/main.tsx',
      'src/main.js',
      'src/main.jsx',
    ]);
    const modules = context
      .getAllFilePaths()
      .filter(
        (filePath) =>
          context.getProjectRelativePath(filePath).startsWith('src/') &&
          /\.(ts|tsx|js|jsx)$/.test(filePath)
      )
      .slice(0, 25)
      .map((filePath) => context.getProjectRelativePath(filePath));

    return {
      summary: `Detected ${configFiles.length} Vite config files and ${entryFiles.length} likely web entrypoints.`,
      details: {
        entryFiles: toRelativeList(context, entryFiles),
        configFiles: toRelativeList(context, configFiles),
        modules,
        relationships: fanOutLinks(
          toRelativeList(context, configFiles),
          toRelativeList(context, entryFiles),
          'vite_config_entry'
        ),
      },
    };
  },
});

type ParsedJsonValue = Record<string, unknown> | null;
type WorkspacePackageManifest = {
  filePath: string;
  name: string;
  dependencies: string[];
  scripts: string[];
};

/** Parses text as a JSON object; null for invalid JSON, arrays and scalars. */
const parseJsonObject = (text: string): ParsedJsonValue => {
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

const getObjectRecord = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const getStringArray = (value: unknown) =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

/**
 * Glob patterns that a root package.json declares for its workspace packages, written either as
 * `workspaces: [...]` or as `workspaces: { packages: [...] }`. Empty for invalid JSON.
 */
const extractPackageJsonWorkspacePatterns = (text: string) => {
  const parsed = parseJsonObject(text);
  if (!parsed) {
    return [];
  }

  const workspaces = parsed.workspaces;
  if (Array.isArray(workspaces)) {
    return getStringArray(workspaces);
  }

  const workspaceRecord = getObjectRecord(workspaces);
  return workspaceRecord ? getStringArray(workspaceRecord.packages) : [];
};

/**
 * Package globs from the `packages:` list of pnpm-workspace.yaml. A minimal line scanner, not a YAML
 * parser: it reads `- pattern` items until the next unindented line.
 */
const extractPnpmWorkspacePatterns = (text: string) => {
  const lines = text.split(/\r?\n/);
  const patterns: string[] = [];
  let inPackagesBlock = false;

  for (const line of lines) {
    if (/^\s*packages\s*:\s*$/.test(line)) {
      inPackagesBlock = true;
      continue;
    }

    if (inPackagesBlock) {
      const match = line.match(/^\s*-\s*['"]?([^'"]+)['"]?\s*$/);
      if (match?.[1]) {
        patterns.push(match[1].trim());
        continue;
      }

      if (line.trim() && !/^\s/.test(line)) {
        break;
      }
    }
  }

  return patterns;
};

const workspacePatternToRegExp = (pattern: string) => {
  const normalized = pattern.replace(/\\/g, '/').replace(/\/package\.json$/i, '');
  const escaped = escapeRegExp(normalized)
    .replace(/\\\*\\\*/g, '.*')
    .replace(/\\\*/g, '[^/]+');
  return new RegExp(`^${escaped}$`);
};

const matchesWorkspacePattern = (relativePackageJsonPath: string, pattern: string) => {
  const normalizedPath = relativePackageJsonPath.replace(/\\/g, '/');
  const packageDirectory = path.posix.dirname(normalizedPath);
  const matcher = workspacePatternToRegExp(pattern);
  return matcher.test(packageDirectory) || matcher.test(normalizedPath);
};

/**
 * Reads every nested package.json that matches a workspace pattern (the root manifest is skipped) and
 * returns the manifests (name, dependency names, script names), a name lookup and the raw entries read.
 * The name falls back to the package directory name.
 */
const collectWorkspacePackageManifests = async (
  context: StackAdapterContext,
  workspacePatterns: string[]
): Promise<{
  manifests: WorkspacePackageManifest[];
  byName: Map<string, WorkspacePackageManifest>;
  relativeEntries: FileContentEntry[];
}> => {
  const packageFiles = context.findBySuffix('package.json');
  const relativeEntries = await readRelativeEntries(context, packageFiles);

  const manifests = relativeEntries
    .filter((entry) => entry.filePath !== 'package.json')
    .filter((entry) =>
      workspacePatterns.some((pattern) => matchesWorkspacePattern(entry.filePath, pattern))
    )
    .map((entry) => {
      const parsed = parseJsonObject(entry.text);
      const dependencies = [
        ...Object.keys(getObjectRecord(parsed?.dependencies) || {}),
        ...Object.keys(getObjectRecord(parsed?.devDependencies) || {}),
        ...Object.keys(getObjectRecord(parsed?.peerDependencies) || {}),
      ];
      const scripts = Object.keys(getObjectRecord(parsed?.scripts) || {});
      return {
        filePath: entry.filePath,
        name:
          typeof parsed?.name === 'string'
            ? parsed.name
            : path.posix.basename(path.posix.dirname(entry.filePath)),
        dependencies,
        scripts,
      };
    });

  const byName = new Map(manifests.map((manifest) => [manifest.name, manifest]));
  return { manifests, byName, relativeEntries };
};

/** Each package links to the workspace packages it depends on. */
const workspaceDependencyLinks = (
  manifests: WorkspacePackageManifest[],
  byName: Map<string, WorkspacePackageManifest>,
  reason: string
) =>
  manifests.flatMap((manifest) =>
    manifest.dependencies.flatMap((dependencyName) => {
      const target = byName.get(dependencyName);
      return !target || target.filePath === manifest.filePath
        ? []
        : [createRelationship(manifest.filePath, target.filePath, 'build', reason)];
    })
  );

const manifestPaths = (manifests: WorkspacePackageManifest[]) =>
  manifests.map((manifest) => manifest.filePath);

/** The root links to each of its packages, and each package to the packages it depends on. */
const workspacePackageLinks = (
  root: string,
  packages: {
    manifests: WorkspacePackageManifest[];
    byName: Map<string, WorkspacePackageManifest>;
  },
  reasons: { member: string; dependency: string }
) => [
  ...packages.manifests.map((manifest) =>
    createRelationship(root, manifest.filePath, 'build', reasons.member)
  ),
  ...workspaceDependencyLinks(packages.manifests, packages.byName, reasons.dependency),
];

export const pnpmWorkspaceAdapter = defineAdapter({
  id: 'pnpm-workspace-topology',
  displayName: 'pnpm Workspace Topology',
  category: 'build',
  stackId: 'pnpm-workspace',
  alsoEvidence: ['pnpm'],
  supports: (context) =>
    !!context.getDetectedStack('pnpm-workspace') ||
    (!!context.getDetectedStack('pnpm') && context.hasRelativePath('pnpm-workspace.yaml')),
  find: async (context) => {
    const configFiles = configFilesNamed(context, [
      'pnpm-workspace.yaml',
      'package.json',
      'pnpm-lock.yaml',
    ]);
    const workspaceYaml = findFileNamed(context, 'pnpm-workspace.yaml');
    const rootPackageJson = findFileNamed(context, 'package.json');
    const workspacePatterns = new Set<string>();
    const workspaceRootDescriptor = workspaceYaml ? 'pnpm-workspace.yaml' : 'package.json';

    if (workspaceYaml) {
      const text = await context.readText(workspaceYaml);
      for (const pattern of extractPnpmWorkspacePatterns(text || '')) {
        workspacePatterns.add(pattern);
      }
    }

    if (rootPackageJson) {
      const text = await context.readText(rootPackageJson);
      for (const pattern of extractPackageJsonWorkspacePatterns(text || '')) {
        workspacePatterns.add(pattern);
      }
    }

    const { manifests, byName } = await collectWorkspacePackageManifests(
      context,
      Array.from(workspacePatterns)
    );
    const relationships = workspacePackageLinks(
      workspaceRootDescriptor,
      { manifests, byName },
      { member: 'pnpm_workspace_package', dependency: 'pnpm_workspace_dependency' }
    );

    return {
      summary: `Detected ${manifests.length} workspace packages and ${relationships.length} pnpm workspace relationships.`,
      details: {
        entryFiles: [workspaceRootDescriptor],
        configFiles: toRelativeList(context, configFiles),
        modules: manifestPaths(manifests),
        relationships,
      },
    };
  },
});

const extractNxImplicitDependencies = (text: string) => {
  const parsed = parseJsonObject(text);
  return getStringArray(parsed?.implicitDependencies);
};

export const nxWorkspaceAdapter = defineAdapter({
  id: 'nx-workspace-topology',
  displayName: 'Nx Workspace Topology',
  category: 'build',
  stackId: 'nx',
  find: async (context) => {
    if (!findFileNamed(context, 'nx.json')) {
      return null;
    }

    const projectJsonFiles = context
      .getAllFilePaths()
      .filter((filePath) =>
        /(?:^|\/)project\.json$/i.test(context.getProjectRelativePath(filePath))
      );
    const relativeProjectEntries = await readRelativeEntries(context, projectJsonFiles);
    const projectByName = new Map<string, string>();
    for (const entry of relativeProjectEntries) {
      const parsed = parseJsonObject(entry.text);
      const explicitName = typeof parsed?.name === 'string' ? parsed.name : null;
      const inferredName = path.posix.basename(path.posix.dirname(entry.filePath));
      projectByName.set(explicitName || inferredName, entry.filePath);
    }

    const relationships = [
      ...relativeProjectEntries.map((entry) =>
        createRelationship('nx.json', entry.filePath, 'build', 'nx_workspace_project')
      ),
      ...relativeProjectEntries.flatMap((entry) =>
        extractNxImplicitDependencies(entry.text).flatMap((dependencyName) => {
          const target = projectByName.get(dependencyName);
          if (!target || target === entry.filePath) {
            return [];
          }
          return [createRelationship(entry.filePath, target, 'build', 'nx_implicit_dependency')];
        })
      ),
      ...relativeProjectEntries.flatMap((entry) => {
        const packageJsonCandidate = path.posix.join(
          path.posix.dirname(entry.filePath),
          'package.json'
        );
        return context.hasRelativePath(packageJsonCandidate)
          ? [
              createRelationship(
                entry.filePath,
                packageJsonCandidate,
                'build',
                'nx_project_package'
              ),
            ]
          : [];
      }),
    ];

    return {
      summary: `Detected ${relativeProjectEntries.length} Nx projects and ${relationships.length} workspace relationships.`,
      details: {
        entryFiles: ['nx.json'],
        configFiles: ['nx.json'],
        modules: relativeProjectEntries.map((entry) => entry.filePath),
        relationships,
      },
    };
  },
});

const extractTurboTaskNames = (text: string) => {
  const parsed = parseJsonObject(text);
  const taskRecord = getObjectRecord(parsed?.tasks) || getObjectRecord(parsed?.pipeline);
  return taskRecord ? Object.keys(taskRecord) : [];
};

export const turborepoAdapter = defineAdapter({
  id: 'turborepo-build-topology',
  displayName: 'Turborepo Build Topology',
  category: 'build',
  stackId: 'turborepo',
  find: async (context) => {
    const turboJson = findFileNamed(context, 'turbo.json');
    const rootPackageJson = findFileNamed(context, 'package.json');
    if (!turboJson || !rootPackageJson) {
      return null;
    }

    const turboText = (await context.readText(turboJson)) || '';
    const packageText = (await context.readText(rootPackageJson)) || '';
    const taskNames = extractTurboTaskNames(turboText);
    const workspacePatterns = extractPackageJsonWorkspacePatterns(packageText);
    const { manifests, byName } = await collectWorkspacePackageManifests(
      context,
      workspacePatterns
    );
    const taskAwarePackages = manifests.filter((manifest) =>
      taskNames.length === 0 ? true : manifest.scripts.some((script) => taskNames.includes(script))
    );

    const relationships = workspacePackageLinks(
      'turbo.json',
      { manifests: taskAwarePackages, byName },
      { member: 'turbo_pipeline_package', dependency: 'turbo_workspace_dependency' }
    );

    return {
      summary: `Detected ${taskAwarePackages.length} Turborepo packages participating in the pipeline and ${relationships.length} related build links.`,
      details: {
        entryFiles: ['turbo.json'],
        configFiles: ['turbo.json', 'package.json'],
        modules: manifestPaths(taskAwarePackages),
        relationships,
      },
    };
  },
});

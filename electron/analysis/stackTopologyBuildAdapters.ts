import * as path from 'path';

export * from './stackTopologySupport';

import {
  buildGraphSymbolIndex,
  buildIdentifierVariants,
  containsIdentifierVariantInNormalizedText,
  createInsight,
  createRelationship,
  escapeRegExp,
  extractActixHandlerNames,
  extractAspNetRouteMethods,
  extractAxumHandlerNames,
  extractCSharpMethodNames,
  extractFastApiRouteFunctions,
  extractGoFunctionNames,
  extractGoRouteHandlers,
  extractJakartaRouteMethods,
  extractJvmFunctionNames,
  extractKtorRouteFunctions,
  extractMicronautRouteMethods,
  extractPhpMethodNames,
  extractPythonFunctionNames,
  extractRubyMethodNames,
  extractRustFunctionNames,
  extractSpringRouteMethods,
  FileContentEntry,
  findContainingIdentifierSymbols,
  findMatchingIdentifierSymbols,
  inferClassSymbolsForFile,
  inferSymbolsForFile,
  matchesIdentifierVariantInText,
  resolveSymbolEndpoint,
  StackAdapter,
  StackAdapterContext,
  StackStructuralRelationship,
  toRelativeList
} from './stackTopologySupport';

const viteAdapter: StackAdapter = {
  id: 'vite-build-topology',
  displayName: 'Vite Build Topology',
  category: 'build',
  supports: (context) => !!context.getDetectedStack('vite'),
  analyze: async (context) => {
    const configFiles = context
      .getAllFilePaths()
      .filter((filePath) =>
        ['vite.config.ts', 'vite.config.js', 'vite.config.mjs'].includes(
          context.getProjectRelativePath(filePath)
        )
      );
    const entryFiles = context
      .getAllFilePaths()
      .filter((filePath) =>
        ['index.html', 'src/main.ts', 'src/main.tsx', 'src/main.js', 'src/main.jsx'].includes(
          context.getProjectRelativePath(filePath)
        )
      );
    const modules = context
      .getAllFilePaths()
      .filter((filePath) =>
        context.getProjectRelativePath(filePath).startsWith('src/') &&
        /\.(ts|tsx|js|jsx)$/.test(filePath)
      )
      .slice(0, 25)
      .map((filePath) => context.getProjectRelativePath(filePath));

    return createInsight(
      viteAdapter.id,
      viteAdapter.displayName,
      viteAdapter.category,
      `Detected ${configFiles.length} Vite config files and ${entryFiles.length} likely web entrypoints.`,
      {
        evidence: context.getDetectedStack('vite')?.evidence || [],
        entryFiles: toRelativeList(context, entryFiles),
        configFiles: toRelativeList(context, configFiles),
        modules,
        relationships: [
          ...configFiles.flatMap((configFile) =>
            entryFiles.map((entryFile) => ({
              source: context.getProjectRelativePath(configFile),
              target: context.getProjectRelativePath(entryFile),
              type: 'build' as const,
              reason: 'vite_config_entry',
            }))
          ),
        ],
      }
    );
  },
};

type ParsedJsonValue = Record<string, unknown> | null;
type WorkspacePackageManifest = {
  filePath: string;
  name: string;
  dependencies: string[];
  scripts: string[];
};

const parseJsonObject = (text: string): ParsedJsonValue => {
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const getObjectRecord = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const getStringArray = (value: unknown) =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

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

const collectWorkspacePackageManifests = async (
  context: StackAdapterContext,
  workspacePatterns: string[]
): Promise<{
  manifests: WorkspacePackageManifest[];
  byName: Map<string, WorkspacePackageManifest>;
  relativeEntries: FileContentEntry[];
}> => {
  const packageFiles = context.findBySuffix('package.json');
  const packageContents = await context.readTexts(packageFiles);
  const relativeEntries = packageContents.map((entry) => ({
    filePath: context.getProjectRelativePath(entry.filePath),
    text: entry.text,
  }));

  const manifests = relativeEntries
    .filter((entry) => entry.filePath !== 'package.json')
    .filter((entry) => workspacePatterns.some((pattern) => matchesWorkspacePattern(entry.filePath, pattern)))
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
        name: typeof parsed?.name === 'string' ? parsed.name : path.posix.basename(path.posix.dirname(entry.filePath)),
        dependencies,
        scripts,
      };
    });

  const byName = new Map(manifests.map((manifest) => [manifest.name, manifest]));
  return { manifests, byName, relativeEntries };
};

const pnpmWorkspaceAdapter: StackAdapter = {
  id: 'pnpm-workspace-topology',
  displayName: 'pnpm Workspace Topology',
  category: 'build',
  supports: (context) =>
    !!context.getDetectedStack('pnpm-workspace') ||
    (!!context.getDetectedStack('pnpm') && context.hasRelativePath('pnpm-workspace.yaml')),
  analyze: async (context) => {
    const configFiles = context
      .getAllFilePaths()
      .filter((filePath) =>
        ['pnpm-workspace.yaml', 'package.json', 'pnpm-lock.yaml'].includes(
          context.getProjectRelativePath(filePath)
        )
      );
    const workspaceYaml = context
      .getAllFilePaths()
      .find((filePath) => context.getProjectRelativePath(filePath) === 'pnpm-workspace.yaml');
    const rootPackageJson = context
      .getAllFilePaths()
      .find((filePath) => context.getProjectRelativePath(filePath) === 'package.json');
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

    const { manifests, byName } = await collectWorkspacePackageManifests(context, Array.from(workspacePatterns));
    const relationships = [
      ...manifests.map((manifest) =>
        createRelationship(workspaceRootDescriptor, manifest.filePath, 'build', 'pnpm_workspace_package')
      ),
      ...manifests.flatMap((manifest) =>
        manifest.dependencies.flatMap((dependencyName) => {
          const target = byName.get(dependencyName);
          if (!target || target.filePath === manifest.filePath) {
            return [];
          }
          return [
            createRelationship(
              manifest.filePath,
              target.filePath,
              'build',
              'pnpm_workspace_dependency'
            ),
          ];
        })
      ),
    ];

    return createInsight(
      pnpmWorkspaceAdapter.id,
      pnpmWorkspaceAdapter.displayName,
      pnpmWorkspaceAdapter.category,
      `Detected ${manifests.length} workspace packages and ${relationships.length} pnpm workspace relationships.`,
      {
        evidence: [
          ...(context.getDetectedStack('pnpm-workspace')?.evidence || []),
          ...(context.getDetectedStack('pnpm')?.evidence || []),
        ],
        entryFiles: [workspaceRootDescriptor],
        configFiles: toRelativeList(context, configFiles),
        modules: manifests.map((manifest) => manifest.filePath),
        relationships,
      }
    );
  },
};

const extractNxImplicitDependencies = (text: string) => {
  const parsed = parseJsonObject(text);
  return getStringArray(parsed?.implicitDependencies);
};

const nxWorkspaceAdapter: StackAdapter = {
  id: 'nx-workspace-topology',
  displayName: 'Nx Workspace Topology',
  category: 'build',
  supports: (context) => !!context.getDetectedStack('nx'),
  analyze: async (context) => {
    const nxJson = context
      .getAllFilePaths()
      .find((filePath) => context.getProjectRelativePath(filePath) === 'nx.json');
    if (!nxJson) {
      return null;
    }

    const projectJsonFiles = context
      .getAllFilePaths()
      .filter((filePath) => /(?:^|\/)project\.json$/i.test(context.getProjectRelativePath(filePath)));
    const projectContents = await context.readTexts(projectJsonFiles);
    const relativeProjectEntries = projectContents.map((entry) => ({
      filePath: context.getProjectRelativePath(entry.filePath),
      text: entry.text,
    }));
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
          return [
            createRelationship(entry.filePath, target, 'build', 'nx_implicit_dependency'),
          ];
        })
      ),
      ...relativeProjectEntries.flatMap((entry) => {
        const packageJsonCandidate = path.posix.join(path.posix.dirname(entry.filePath), 'package.json');
        return context.hasRelativePath(packageJsonCandidate)
          ? [createRelationship(entry.filePath, packageJsonCandidate, 'build', 'nx_project_package')]
          : [];
      }),
    ];

    return createInsight(
      nxWorkspaceAdapter.id,
      nxWorkspaceAdapter.displayName,
      nxWorkspaceAdapter.category,
      `Detected ${relativeProjectEntries.length} Nx projects and ${relationships.length} workspace relationships.`,
      {
        evidence: context.getDetectedStack('nx')?.evidence || [],
        entryFiles: ['nx.json'],
        configFiles: ['nx.json'],
        modules: relativeProjectEntries.map((entry) => entry.filePath),
        relationships,
      }
    );
  },
};

const extractTurboTaskNames = (text: string) => {
  const parsed = parseJsonObject(text);
  const taskRecord = getObjectRecord(parsed?.tasks) || getObjectRecord(parsed?.pipeline);
  return taskRecord ? Object.keys(taskRecord) : [];
};

const turborepoAdapter: StackAdapter = {
  id: 'turborepo-build-topology',
  displayName: 'Turborepo Build Topology',
  category: 'build',
  supports: (context) => !!context.getDetectedStack('turborepo'),
  analyze: async (context) => {
    const turboJson = context
      .getAllFilePaths()
      .find((filePath) => context.getProjectRelativePath(filePath) === 'turbo.json');
    const rootPackageJson = context
      .getAllFilePaths()
      .find((filePath) => context.getProjectRelativePath(filePath) === 'package.json');
    if (!turboJson || !rootPackageJson) {
      return null;
    }

    const turboText = (await context.readText(turboJson)) || '';
    const packageText = (await context.readText(rootPackageJson)) || '';
    const taskNames = extractTurboTaskNames(turboText);
    const workspacePatterns = extractPackageJsonWorkspacePatterns(packageText);
    const { manifests, byName } = await collectWorkspacePackageManifests(context, workspacePatterns);
    const taskAwarePackages = manifests.filter((manifest) =>
      taskNames.length === 0 ? true : manifest.scripts.some((script) => taskNames.includes(script))
    );

    const relationships = [
      ...taskAwarePackages.map((manifest) =>
        createRelationship('turbo.json', manifest.filePath, 'build', 'turbo_pipeline_package')
      ),
      ...taskAwarePackages.flatMap((manifest) =>
        manifest.dependencies.flatMap((dependencyName) => {
          const target = byName.get(dependencyName);
          if (!target || target.filePath === manifest.filePath) {
            return [];
          }
          return [
            createRelationship(
              manifest.filePath,
              target.filePath,
              'build',
              'turbo_workspace_dependency'
            ),
          ];
        })
      ),
    ];

    return createInsight(
      turborepoAdapter.id,
      turborepoAdapter.displayName,
      turborepoAdapter.category,
      `Detected ${taskAwarePackages.length} Turborepo packages participating in the pipeline and ${relationships.length} related build links.`,
      {
        evidence: context.getDetectedStack('turborepo')?.evidence || [],
        entryFiles: ['turbo.json'],
        configFiles: ['turbo.json', 'package.json'],
        modules: taskAwarePackages.map((manifest) => manifest.filePath),
        relationships,
      }
    );
  },
};

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
const extractBazelDeps = (text: string) => extractNamedListValues(text, ['deps', 'exports', 'runtime_deps']);

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

  let packagePath = '';
  let target = '';

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

const bazelAdapter: StackAdapter = {
  id: 'bazel-build-topology',
  displayName: 'Bazel Build Topology',
  category: 'build',
  supports: (context) => !!context.getDetectedStack('bazel'),
  analyze: async (context) => {
    const configFiles = context
      .getAllFilePaths()
      .filter((filePath) =>
        ['WORKSPACE', 'WORKSPACE.bazel', 'MODULE.bazel'].includes(context.getProjectRelativePath(filePath))
      );
    const buildFiles = context
      .getAllFilePaths()
      .filter((filePath) =>
        ['BUILD', 'BUILD.bazel'].includes(path.posix.basename(context.getProjectRelativePath(filePath)))
      );
    const buildContents = await context.readTexts(buildFiles);
    const relativeEntries = buildContents.map((entry) => ({
      filePath: context.getProjectRelativePath(entry.filePath),
      text: entry.text,
    }));

    const relationships: StackStructuralRelationship[] = [
      ...configFiles.flatMap((configFile) =>
        relativeEntries.map((entry) =>
          createRelationship(context.getProjectRelativePath(configFile), entry.filePath, 'build', 'bazel_workspace_package')
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
              createRelationship(entry.filePath, resolved.descriptor, 'build', 'bazel_target_dependency'),
            ];
          }
          return resolved?.file
            ? [createRelationship(entry.filePath, resolved.file, 'build', 'bazel_target_dependency')]
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

const pantsAdapter: StackAdapter = {
  id: 'pants-build-topology',
  displayName: 'Pants Build Topology',
  category: 'build',
  supports: (context) => !!context.getDetectedStack('pants'),
  analyze: async (context) => {
    const configFiles = context
      .getAllFilePaths()
      .filter((filePath) =>
        ['pants.toml', 'BUILDROOT', 'pyproject.toml'].includes(context.getProjectRelativePath(filePath))
      );
    const buildFiles = context
      .getAllFilePaths()
      .filter((filePath) =>
        ['BUILD', 'BUILD.pants'].includes(path.posix.basename(context.getProjectRelativePath(filePath)))
      );
    const buildContents = await context.readTexts(buildFiles);
    const relativeEntries = buildContents.map((entry) => ({
      filePath: context.getProjectRelativePath(entry.filePath),
      text: entry.text,
    }));

    const relationships: StackStructuralRelationship[] = [
      ...configFiles.flatMap((configFile) =>
        relativeEntries.map((entry) =>
          createRelationship(context.getProjectRelativePath(configFile), entry.filePath, 'build', 'pants_workspace_package')
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
              createRelationship(entry.filePath, resolved.descriptor, 'build', 'pants_target_dependency'),
            ];
          }
          return resolved?.file
            ? [createRelationship(entry.filePath, resolved.file, 'build', 'pants_target_dependency')]
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

const OPENAPI_SPEC_BASENAMES = new Set([
  'openapi.yaml',
  'openapi.yml',
  'openapi.json',
  'swagger.yaml',
  'swagger.yml',
  'swagger.json',
]);

const OPENAPI_GENERATOR_CONFIG_BASENAMES = new Set([
  'openapi-generator-config.json',
  'openapi-generator-config.yaml',
  'openapi-generator-config.yml',
  'openapitools.json',
  'swagger-codegen-config.json',
  'swagger-codegen-config.yaml',
  'swagger-codegen-config.yml',
]);

const PROTOBUF_CONFIG_BASENAMES = new Set(['buf.yaml', 'buf.gen.yaml', 'buf.work.yaml']);

const isLikelyOpenApiSpec = (filePath: string, text: string) =>
  OPENAPI_SPEC_BASENAMES.has(path.posix.basename(filePath)) ||
  /\bopenapi:\s*["']?3\./.test(text) ||
  /"openapi"\s*:\s*"3\./.test(text) ||
  /\bswagger:\s*["']?2\./.test(text) ||
  /"swagger"\s*:\s*"2\./.test(text);

const extractOpenApiOperationIds = (text: string) =>
  Array.from(
    new Set([
      ...Array.from(text.matchAll(/\boperationId:\s*([A-Za-z_][A-Za-z0-9_]*)/g))
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value)),
      ...Array.from(text.matchAll(/"operationId"\s*:\s*"([^"]+)"/g))
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value)),
    ])
  );

const extractNamedJsTsSymbols = (text: string) =>
  Array.from(
    new Set([
      ...Array.from(
        text.matchAll(/\bexport\s+(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)
      )
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value)),
      ...Array.from(
        text.matchAll(/\b(?:export\s+)?const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/g)
      )
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value)),
      ...Array.from(
        text.matchAll(/\b(?:export\s+)?class\s+([A-Z][A-Za-z0-9_]*)\b/g)
      )
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value)),
    ])
  );

const extractConnectRuntimeSymbols = (text: string) =>
  Array.from(
    new Set([
      ...Array.from(
        text.matchAll(/\b(?:export\s+)?const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*createPromiseClient\s*\(/g)
      )
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value)),
      ...Array.from(text.matchAll(/\bcreatePromiseClient\s*\(\s*([A-Z][A-Za-z0-9_]*)\s*,/g))
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value)),
    ])
  );

const extractGrpcWebRuntimeSymbols = (text: string) =>
  Array.from(
    new Set([
      ...Array.from(
        text.matchAll(/\b(?:export\s+)?const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*new\s+[A-Z][A-Za-z0-9_]*Client\s*\(/g)
      )
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value)),
      ...Array.from(text.matchAll(/\bnew\s+([A-Z][A-Za-z0-9_]*Client)\s*\(/g))
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value)),
    ])
  );

const extractGrpcRuntimeSymbols = (text: string, serviceName: string) =>
  Array.from(
    new Set([
      ...Array.from(
        text.matchAll(
          new RegExp(
            `Register${escapeRegExp(serviceName)}Server\\s*\\(\\s*[^,]+,\\s*(?:&\\s*)?([A-Za-z_][A-Za-z0-9_]*)`,
            'g'
          )
        )
      )
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value)),
      ...Array.from(text.matchAll(/\bfunc\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g))
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value)),
    ])
  );

const extractOpenApiRuntimeSymbols = (filePath: string, text: string) => {
  const extension = path.posix.extname(filePath).toLowerCase();

  switch (extension) {
    case '.ts':
    case '.tsx':
    case '.js':
    case '.jsx':
      return extractNamedJsTsSymbols(text);
    case '.py':
      return Array.from(
        new Set([
          ...extractFastApiRouteFunctions(text),
          ...extractPythonFunctionNames(text),
          ...inferClassSymbolsForFile(text),
        ])
      );
    case '.java':
      return Array.from(
        new Set([
          ...extractSpringRouteMethods(text),
          ...extractMicronautRouteMethods(text),
          ...extractJakartaRouteMethods(text),
          ...extractJvmFunctionNames(text),
          ...inferClassSymbolsForFile(text),
        ])
      );
    case '.kt':
      return Array.from(
        new Set([
          ...extractKtorRouteFunctions(text),
          ...extractMicronautRouteMethods(text),
          ...extractJakartaRouteMethods(text),
          ...extractJvmFunctionNames(text),
          ...inferClassSymbolsForFile(text),
        ])
      );
    case '.cs':
      return Array.from(
        new Set([
          ...extractAspNetRouteMethods(text),
          ...extractCSharpMethodNames(text),
          ...inferClassSymbolsForFile(text),
        ])
      );
    case '.go':
      return Array.from(new Set([...extractGoRouteHandlers(text), ...extractGoFunctionNames(text)]));
    case '.rb':
      return Array.from(new Set([...extractRubyMethodNames(text), ...inferClassSymbolsForFile(text)]));
    case '.php':
      return Array.from(new Set([...extractPhpMethodNames(text), ...inferClassSymbolsForFile(text)]));
    case '.rs':
      return Array.from(
        new Set([
          ...extractAxumHandlerNames(text),
          ...extractActixHandlerNames(text),
          ...extractRustFunctionNames(text),
        ])
      );
    default:
      return inferSymbolsForFile(filePath, text);
  }
};

const matchesProtoRuntimeEntry = (text: string, serviceName: string) =>
  containsIdentifierVariantInNormalizedText(text, serviceName) &&
  [
    /Register[A-Z][A-Za-z0-9_]*Server\s*\(/,
    /New[A-Z][A-Za-z0-9_]*Client\s*\(/,
    /\b[A-Z][A-Za-z0-9_]*Client\b/,
    /\b[A-Z][A-Za-z0-9_]*Grpc\b/,
    /\bImplBase\b/,
    /\bBindService\s*\(/,
    /\bServicer\b/,
    /\badd_[A-Z][A-Za-z0-9_]*Servicer_to_server\b/,
    /\bgrpc\b/i,
  ].some((pattern) => pattern.test(text));

const extractProtoRuntimeSymbols = (filePath: string, text: string, serviceName: string) => {
  const extension = path.posix.extname(filePath).toLowerCase();
  const serviceLikeSymbols = findContainingIdentifierSymbols(
    [
      ...inferClassSymbolsForFile(text),
      ...extractGoFunctionNames(text),
      ...extractJvmFunctionNames(text),
      ...extractPythonFunctionNames(text),
      ...extractCSharpMethodNames(text),
      ...extractRustFunctionNames(text),
    ],
    serviceName
  );

  switch (extension) {
    case '.go':
      return Array.from(
        new Set([...extractGrpcRuntimeSymbols(text, serviceName), ...serviceLikeSymbols])
      );
    case '.java':
    case '.kt':
      return Array.from(
        new Set([
          ...serviceLikeSymbols,
          ...extractSpringRouteMethods(text),
          ...extractMicronautRouteMethods(text),
          ...extractJakartaRouteMethods(text),
          ...extractKtorRouteFunctions(text),
        ])
      );
    case '.py':
      return Array.from(
        new Set([...serviceLikeSymbols, ...extractFastApiRouteFunctions(text)])
      );
    case '.cs':
      return Array.from(
        new Set([...serviceLikeSymbols, ...extractAspNetRouteMethods(text)])
      );
    case '.rs':
      return Array.from(
        new Set([
          ...serviceLikeSymbols,
          ...extractAxumHandlerNames(text),
          ...extractActixHandlerNames(text),
        ])
      );
    default:
      return Array.from(new Set(serviceLikeSymbols));
  }
};

const isGeneratedOpenApiModule = (filePath: string, text: string) =>
  /(?:^|\/)(?:generated|gen|sdk|clients?|openapi)(?:\/|$)/i.test(filePath) ||
  /Generated by OpenAPI Generator|swagger-codegen|openapi-typescript-codegen|orval/i.test(text);

const extractProtoServiceNames = (text: string) =>
  Array.from(
    new Set(
      Array.from(text.matchAll(/^\s*service\s+([A-Z][A-Za-z0-9_]*)\s*\{/gm))
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value))
    )
  );

const extractBufOutputDirs = (text: string) =>
  Array.from(
    new Set(
      Array.from(text.matchAll(/^\s*out:\s*([^\s#]+)\s*$/gm))
        .map((match) => match[1]?.trim().replace(/^['"]|['"]$/g, ''))
        .filter((value): value is string => Boolean(value))
    )
  );

const normalizeProtoGeneratedStem = (filePath: string) =>
  path.posix
    .basename(filePath)
    .replace(/\.(ts|tsx|js|jsx|go|java|kt|cs|py|rb|php)$/i, '')
    .replace(/(?:\.connectweb|\.connect|\.grpc-web)$/i, '')
    .replace(/(?:\.connect)?(?:\.grpc)?\.pb$/i, '')
    .replace(/_pb2(?:_grpc)?$/i, '')
    .replace(/Grpc$/i, '')
    .replace(/Proto$/i, '');

const isGeneratedProtoModule = (filePath: string, text: string) =>
  /\.(?:connectweb|connect|grpc-web)\.(?:ts|js)$/i.test(filePath) ||
  /\.(?:connect\.)?(?:grpc\.)?pb\.(?:ts|js|go|java|kt|cs)$/i.test(filePath) ||
  /_pb2(?:_grpc)?\.py$/i.test(filePath) ||
  /Code generated by protoc|Generated by the protocol buffer compiler|protobufjs|minimal\.js/i.test(text);

const isConnectGeneratedModule = (filePath: string, text: string) =>
  /\.connect(?:web)?\.ts$/i.test(filePath) ||
  /@connectrpc\/connect|createPromiseClient|MethodKind/i.test(text);

const isGrpcWebGeneratedModule = (filePath: string, text: string) =>
  /\.grpc-web\.(?:ts|js)$/i.test(filePath) ||
  /grpc-web|GrpcWebImpl|PromiseClient|UnaryResponse/i.test(text);

const isConnectRuntimeEntry = (text: string) =>
  /createPromiseClient\s*\(|createConnectTransport\s*\(|connectNodeAdapter\s*\(/.test(text);

const isGrpcWebRuntimeEntry = (text: string) =>
  /GrpcWebFetchTransport\s*\(|grpc\.unary\s*\(|grpc\.invoke\s*\(|new\s+[A-Za-z0-9_]+Client\s*\(/.test(text);

const openApiAdapter: StackAdapter = {
  id: 'openapi-contract-topology',
  displayName: 'OpenAPI Contract Topology',
  category: 'build',
  supports: (context) => !!context.getDetectedStack('openapi'),
  analyze: async (context) => {
    const graphSymbolIndex = buildGraphSymbolIndex(context.graph);
    const candidateFiles = context.getAllFilePaths().filter((filePath) =>
      /\.(yaml|yml|json|ts|tsx|js|jsx|java|kt|go|py|cs)$/i.test(context.getProjectRelativePath(filePath))
    );
    const contents = await context.readTexts(candidateFiles);
    const relativeEntries = contents.map((entry) => ({
      filePath: context.getProjectRelativePath(entry.filePath),
      text: entry.text,
    }));
    const specEntries = relativeEntries.filter((entry) => isLikelyOpenApiSpec(entry.filePath, entry.text));
    const configFiles = relativeEntries
      .filter((entry) => OPENAPI_GENERATOR_CONFIG_BASENAMES.has(path.posix.basename(entry.filePath)))
      .map((entry) => entry.filePath);
    const generatedEntries = relativeEntries.filter(
      (entry) => !specEntries.some((spec) => spec.filePath === entry.filePath) && isGeneratedOpenApiModule(entry.filePath, entry.text)
    );
    const runtimeEntries = relativeEntries.filter(
      (entry) =>
        !specEntries.some((spec) => spec.filePath === entry.filePath) &&
        !generatedEntries.some((generatedEntry) => generatedEntry.filePath === entry.filePath) &&
        /\.(ts|tsx|js|jsx|java|kt|go|py|cs|rb|php|rs)$/i.test(entry.filePath)
    );

    const relationships: StackStructuralRelationship[] = [
      ...configFiles.flatMap((configFile) =>
        specEntries.map((specEntry) =>
          createRelationship(configFile, specEntry.filePath, 'build', 'openapi_codegen_spec')
        )
      ),
      ...specEntries.flatMap((specEntry) => {
        const operationIds = extractOpenApiOperationIds(specEntry.text);
        return generatedEntries.flatMap((generatedEntry) =>
          operationIds.flatMap((operationId) =>
            matchesIdentifierVariantInText(generatedEntry.text, operationId)
              ? [
                  createRelationship(
                    specEntry.filePath,
                    generatedEntry.filePath,
                    'build',
                    'openapi_generated_module'
                  ),
                  createRelationship(
                    specEntry.filePath,
                    resolveSymbolEndpoint(generatedEntry.filePath, graphSymbolIndex, {
                      preferredSymbols: buildIdentifierVariants(operationId),
                    }),
                    'build',
                    'openapi_operation_symbol'
                  ),
                ]
              : []
          )
        );
      }),
      ...specEntries.flatMap((specEntry) => {
        const operationIds = extractOpenApiOperationIds(specEntry.text);
        return runtimeEntries.flatMap((runtimeEntry) =>
          operationIds.flatMap((operationId) => {
            const runtimeSymbols = extractOpenApiRuntimeSymbols(
              runtimeEntry.filePath,
              runtimeEntry.text
            );
            const matchingSymbols = findMatchingIdentifierSymbols(runtimeSymbols, operationId);
            const matchesOperationId =
              matchesIdentifierVariantInText(runtimeEntry.text, operationId) ||
              matchingSymbols.length > 0;
            return matchesOperationId
              ? [
                  createRelationship(
                    specEntry.filePath,
                    resolveSymbolEndpoint(runtimeEntry.filePath, graphSymbolIndex, {
                      preferredSymbols: [...matchingSymbols, ...buildIdentifierVariants(operationId)],
                    }),
                    'framework',
                    'openapi_operation_runtime_binding'
                  ),
                ]
              : [];
          })
        );
      }),
    ];

    return createInsight(
      openApiAdapter.id,
      openApiAdapter.displayName,
      openApiAdapter.category,
      `Detected ${specEntries.length} OpenAPI specs, ${configFiles.length} codegen configs, and ${generatedEntries.length} generated contract-aware modules.`,
      {
        evidence: context.getDetectedStack('openapi')?.evidence || [],
        entryFiles: specEntries.map((entry) => entry.filePath),
        configFiles,
        modules: generatedEntries.map((entry) => entry.filePath),
        relationships,
      }
    );
  },
};

const protobufAdapter: StackAdapter = {
  id: 'protobuf-contract-topology',
  displayName: 'Protocol Buffers Contract Topology',
  category: 'build',
  supports: (context) => !!context.getDetectedStack('protobuf'),
  analyze: async (context) => {
    const graphSymbolIndex = buildGraphSymbolIndex(context.graph);
    const candidateFiles = context.getAllFilePaths().filter((filePath) =>
      /\.(proto|ts|tsx|js|jsx|go|java|kt|cs|py|yaml|yml)$/i.test(context.getProjectRelativePath(filePath))
    );
    const contents = await context.readTexts(candidateFiles);
    const relativeEntries = contents.map((entry) => ({
      filePath: context.getProjectRelativePath(entry.filePath),
      text: entry.text,
    }));
    const protoEntries = relativeEntries.filter((entry) => entry.filePath.endsWith('.proto'));
    const configFiles = relativeEntries
      .filter((entry) => PROTOBUF_CONFIG_BASENAMES.has(path.posix.basename(entry.filePath)))
      .map((entry) => entry.filePath);
    const bufOutputDirs = relativeEntries
      .filter((entry) => path.posix.basename(entry.filePath) === 'buf.gen.yaml')
      .flatMap((entry) => extractBufOutputDirs(entry.text));
    const generatedEntries = relativeEntries.filter(
      (entry) => !entry.filePath.endsWith('.proto') && isGeneratedProtoModule(entry.filePath, entry.text)
    );
    const connectGeneratedEntries = generatedEntries.filter((entry) =>
      isConnectGeneratedModule(entry.filePath, entry.text)
    );
    const grpcWebGeneratedEntries = generatedEntries.filter((entry) =>
      isGrpcWebGeneratedModule(entry.filePath, entry.text)
    );
    const runtimeEntries = relativeEntries.filter(
      (entry) =>
        !entry.filePath.endsWith('.proto') &&
        !generatedEntries.some((generatedEntry) => generatedEntry.filePath === entry.filePath)
    );
    const connectRuntimeEntries = runtimeEntries.filter((entry) => isConnectRuntimeEntry(entry.text));
    const grpcWebRuntimeEntries = runtimeEntries.filter((entry) => isGrpcWebRuntimeEntry(entry.text));

    const relationships: StackStructuralRelationship[] = [
      ...configFiles.flatMap((configFile) =>
        protoEntries.map((protoEntry) =>
          createRelationship(configFile, protoEntry.filePath, 'build', 'protobuf_config_schema')
        )
      ),
      ...configFiles.flatMap((configFile) =>
        bufOutputDirs.flatMap((outputDir) =>
          generatedEntries
            .filter((generatedEntry) => generatedEntry.filePath.startsWith(`${outputDir.replace(/\/+$/, '')}/`))
            .map((generatedEntry) =>
              createRelationship(configFile, generatedEntry.filePath, 'build', 'buf_codegen_output')
            )
        )
      ),
      ...protoEntries.flatMap((protoEntry) => {
        const protoStem = path.posix.basename(protoEntry.filePath, '.proto');
        return generatedEntries.flatMap((generatedEntry) =>
          normalizeProtoGeneratedStem(generatedEntry.filePath).toLowerCase() === protoStem.toLowerCase()
            ? [
                createRelationship(
                  protoEntry.filePath,
                  generatedEntry.filePath,
                  'build',
                  'protobuf_generated_module'
                ),
              ]
            : []
        );
      }),
      ...protoEntries.flatMap((protoEntry) => {
        const protoStem = path.posix.basename(protoEntry.filePath, '.proto').toLowerCase();
        return connectGeneratedEntries.flatMap((generatedEntry) =>
          normalizeProtoGeneratedStem(generatedEntry.filePath).toLowerCase() === protoStem
            ? [
                createRelationship(
                  protoEntry.filePath,
                  generatedEntry.filePath,
                  'build',
                  'connectrpc_generated_module'
                ),
              ]
            : []
        );
      }),
      ...protoEntries.flatMap((protoEntry) => {
        const protoStem = path.posix.basename(protoEntry.filePath, '.proto').toLowerCase();
        const serviceNames = extractProtoServiceNames(protoEntry.text);
        return grpcWebGeneratedEntries.flatMap((generatedEntry) =>
          serviceNames.flatMap((serviceName) =>
            normalizeProtoGeneratedStem(generatedEntry.filePath).toLowerCase() === protoStem
              ? [
                  createRelationship(
                    protoEntry.filePath,
                    generatedEntry.filePath,
                    'build',
                    'grpc_web_generated_module'
                  ),
                  createRelationship(
                    protoEntry.filePath,
                    resolveSymbolEndpoint(generatedEntry.filePath, graphSymbolIndex, {
                      preferredSymbols: [serviceName],
                    }),
                    'build',
                    'proto_service_symbol'
                  ),
                ]
              : []
          )
        );
      }),
      ...protoEntries.flatMap((protoEntry) => {
        const serviceNames = extractProtoServiceNames(protoEntry.text);
        return grpcWebGeneratedEntries.flatMap((generatedEntry) =>
          serviceNames.flatMap((serviceName) => {
            const matchesService =
              normalizeProtoGeneratedStem(generatedEntry.filePath).toLowerCase() ===
              path.posix.basename(protoEntry.filePath, '.proto').toLowerCase();
            return matchesService
              ? [
                  createRelationship(
                    protoEntry.filePath,
                    resolveSymbolEndpoint(generatedEntry.filePath, graphSymbolIndex, {
                      preferredSymbols: [`${serviceName}PromiseClient`, serviceName],
                    }),
                    'build',
                    'proto_client_symbol'
                  ),
                ]
              : [];
          })
        );
      }),
      ...protoEntries.flatMap((protoEntry) => {
        const serviceNames = extractProtoServiceNames(protoEntry.text);
        return runtimeEntries.flatMap((runtimeEntry) =>
          serviceNames.flatMap((serviceName) => {
            const runtimeSymbols = extractProtoRuntimeSymbols(
              runtimeEntry.filePath,
              runtimeEntry.text,
              serviceName
            );
            return matchesProtoRuntimeEntry(runtimeEntry.text, serviceName)
              ? [
                  createRelationship(
                    protoEntry.filePath,
                    runtimeEntry.filePath,
                    'framework',
                    'proto_service_runtime_binding'
                  ),
                  createRelationship(
                    protoEntry.filePath,
                    resolveSymbolEndpoint(runtimeEntry.filePath, graphSymbolIndex, {
                      preferredSymbols: [
                        ...runtimeSymbols,
                        ...buildIdentifierVariants(serviceName),
                      ],
                    }),
                    'framework',
                    'proto_server_symbol'
                  ),
                ]
              : [];
          })
        );
      }),
      ...protoEntries.flatMap((protoEntry) => {
        const serviceNames = extractProtoServiceNames(protoEntry.text);
        return connectRuntimeEntries.flatMap((runtimeEntry) =>
          serviceNames.flatMap((serviceName) =>
            containsIdentifierVariantInNormalizedText(runtimeEntry.text, serviceName) &&
            (runtimeEntry.text.includes('createPromiseClient(') ||
              runtimeEntry.text.includes('createConnectTransport(') ||
              runtimeEntry.text.includes('connectNodeAdapter('))
              ? [
                  createRelationship(
                    protoEntry.filePath,
                    runtimeEntry.filePath,
                    'framework',
                    'connectrpc_runtime_binding'
                  ),
                  createRelationship(
                    protoEntry.filePath,
                    resolveSymbolEndpoint(runtimeEntry.filePath, graphSymbolIndex, {
                      preferredSymbols: extractConnectRuntimeSymbols(runtimeEntry.text),
                    }),
                    'framework',
                    'connectrpc_client_symbol'
                  ),
                ]
              : []
          )
        );
      }),
      ...protoEntries.flatMap((protoEntry) => {
        const serviceNames = extractProtoServiceNames(protoEntry.text);
        return grpcWebRuntimeEntries.flatMap((runtimeEntry) =>
          serviceNames.flatMap((serviceName) =>
            containsIdentifierVariantInNormalizedText(runtimeEntry.text, serviceName) &&
            (runtimeEntry.text.includes('GrpcWebFetchTransport(') ||
              runtimeEntry.text.includes('grpc.unary(') ||
              runtimeEntry.text.includes('grpc.invoke(') ||
              runtimeEntry.text.includes('Client('))
              ? [
                  createRelationship(
                    protoEntry.filePath,
                    runtimeEntry.filePath,
                    'framework',
                    'grpc_web_runtime_binding'
                  ),
                  createRelationship(
                    protoEntry.filePath,
                    resolveSymbolEndpoint(runtimeEntry.filePath, graphSymbolIndex, {
                      preferredSymbols: extractGrpcWebRuntimeSymbols(runtimeEntry.text),
                    }),
                    'framework',
                    'grpc_web_client_symbol'
                  ),
                ]
              : []
          )
        );
      }),
    ];

    return createInsight(
      protobufAdapter.id,
      protobufAdapter.displayName,
      protobufAdapter.category,
      `Detected ${protoEntries.length} proto schemas, ${generatedEntries.length} generated protobuf modules, ${bufOutputDirs.length} Buf output directories, and ${relationships.length} contract/runtime relationships.`,
      {
        evidence: context.getDetectedStack('protobuf')?.evidence || [],
        entryFiles: protoEntries.map((entry) => entry.filePath),
        configFiles,
        modules: generatedEntries.map((entry) => entry.filePath),
        relationships,
      }
    );
  },
};

const mavenAdapter: StackAdapter = {
  id: 'maven-build-topology',
  displayName: 'Maven Build Topology',
  category: 'build',
  supports: (context) => !!context.getDetectedStack('maven'),
  analyze: async (context) => {
    const pomFiles = context.findBySuffix('pom.xml');
    const pomContents = await context.readTexts(pomFiles);
    const relativeEntries = pomContents.map((entry) => ({
      filePath: context.getProjectRelativePath(entry.filePath),
      text: entry.text,
    }));
    const coordinatesToPom = new Map<string, string>();
    const relationships: StackStructuralRelationship[] = [];
    const modules: string[] = [];

    for (const entry of relativeEntries) {
      const coordinates = extractMavenCoordinates(entry.text);
      if (coordinates) {
        coordinatesToPom.set(`${coordinates.groupId}:${coordinates.artifactId}`, entry.filePath);
      }
    }

    for (const entry of relativeEntries) {
      for (const moduleName of extractMavenModules(entry.text)) {
        const targetPom = toMavenPomPath(entry.filePath, moduleName);
        if (!context.hasRelativePath(targetPom)) {
          continue;
        }
        modules.push(targetPom);
        relationships.push(
          createRelationship(entry.filePath, targetPom, 'build', 'maven_module_descriptor')
        );
      }

      for (const dependency of extractMavenDependencies(entry.text)) {
        const targetPom = coordinatesToPom.get(`${dependency.groupId}:${dependency.artifactId}`);
        if (!targetPom || targetPom === entry.filePath) {
          continue;
        }
        modules.push(targetPom);
        relationships.push(
          createRelationship(entry.filePath, targetPom, 'build', 'maven_module_dependency')
        );
      }
    }

    return createInsight(
      mavenAdapter.id,
      mavenAdapter.displayName,
      mavenAdapter.category,
      `Detected ${pomFiles.length} Maven descriptors and ${relationships.length} reactor/module dependency relationships.`,
      {
        evidence: context.getDetectedStack('maven')?.evidence || [],
        configFiles: toRelativeList(context, pomFiles),
        modules,
        relationships,
      }
    );
  },
};

const gradleBuildAdapter: StackAdapter = {
  id: 'gradle-build-topology',
  displayName: 'Gradle Build Topology',
  category: 'build',
  supports: (context) => !!context.getDetectedStack('gradle'),
  analyze: async (context) => {
    const buildFiles = context
      .getAllFilePaths()
      .filter((filePath) => /(?:^|\/)(?:build|settings)\.gradle(?:\.kts)?$/i.test(context.getProjectRelativePath(filePath)));
    const buildContents = await context.readTexts(buildFiles);
    const relativeEntries = buildContents.map((entry) => ({
      filePath: context.getProjectRelativePath(entry.filePath),
      text: entry.text,
    }));
    const settingsEntries = relativeEntries.filter((entry) => /(?:^|\/)settings\.gradle(?:\.kts)?$/i.test(entry.filePath));
    const relationships: StackStructuralRelationship[] = [];
    const modules: string[] = [];

    for (const settingsEntry of settingsEntries) {
      for (const includeNotation of extractGradleIncludes(settingsEntry.text)) {
        const targetDescriptor = resolveGradleModuleDescriptor(context, settingsEntry.filePath, includeNotation);
        if (!targetDescriptor) {
          continue;
        }
        modules.push(targetDescriptor);
        relationships.push(
          createRelationship(settingsEntry.filePath, targetDescriptor, 'build', 'gradle_settings_module')
        );
      }
    }

    for (const entry of relativeEntries.filter((item) => /(?:^|\/)build\.gradle(?:\.kts)?$/i.test(item.filePath))) {
      for (const dependencyNotation of extractGradleProjectDependencies(entry.text)) {
        const targetDescriptor =
          settingsEntries
            .map((settingsEntry) => resolveGradleModuleDescriptor(context, settingsEntry.filePath, dependencyNotation))
            .find((candidate): candidate is string => Boolean(candidate)) || null;
        if (!targetDescriptor || targetDescriptor === entry.filePath) {
          continue;
        }
        modules.push(targetDescriptor);
        relationships.push(
          createRelationship(entry.filePath, targetDescriptor, 'build', 'gradle_project_dependency')
        );
      }
    }

    return createInsight(
      gradleBuildAdapter.id,
      gradleBuildAdapter.displayName,
      gradleBuildAdapter.category,
      `Detected ${buildFiles.length} Gradle descriptors and ${relationships.length} multi-module build relationships.`,
      {
        evidence: context.getDetectedStack('gradle')?.evidence || [],
        configFiles: toRelativeList(context, buildFiles),
        entryFiles: settingsEntries.map((entry) => entry.filePath),
        modules,
        relationships,
      }
    );
  },
};

const toCargoManifestPath = (sourceRelativePath: string, targetPath: string) => {
  const normalizedTarget = path.posix.normalize(
    path.posix.join(path.posix.dirname(sourceRelativePath), targetPath)
  );
  return normalizedTarget.endsWith('Cargo.toml') ? normalizedTarget : `${normalizedTarget}/Cargo.toml`;
};

const extractCargoWorkspaceMembers = (text: string) =>
  Array.from(
    (text.match(/\[workspace\][\s\S]*?members\s*=\s*\[([\s\S]*?)\]/)?.[1] || '').matchAll(/"([^"]+)"/g)
  )
    .map((match) => match[1])
    .filter((value): value is string => Boolean(value));

const extractCargoPathDependencies = (text: string) =>
  Array.from(text.matchAll(/[A-Za-z0-9_-]+\s*=\s*\{[^}]*path\s*=\s*"([^"]+)"[^}]*\}/g))
    .map((match) => match[1])
    .filter((value): value is string => Boolean(value));

const extractCargoBinPaths = (text: string) =>
  Array.from(text.matchAll(/\[\[bin\]\][\s\S]*?path\s*=\s*"([^"]+)"/g))
    .map((match) => match[1])
    .filter((value): value is string => Boolean(value));

const extractMavenModules = (text: string) =>
  Array.from(text.matchAll(/<module>([^<]+)<\/module>/g))
    .map((match) => match[1].trim())
    .filter((value): value is string => Boolean(value));

const extractMavenTagValue = (text: string, tag: string) =>
  text.match(new RegExp(`<${tag}>([^<]+)<\\/${tag}>`))?.[1]?.trim() || '';

const extractMavenCoordinates = (text: string) => {
  const artifactId = extractMavenTagValue(text, 'artifactId');
  const directGroupId = extractMavenTagValue(text, 'groupId');
  const parentGroupIdMatch = text.match(/<parent>[\s\S]*?<groupId>([^<]+)<\/groupId>/);
  const groupId = directGroupId || parentGroupIdMatch?.[1]?.trim() || '';

  if (!artifactId) {
    return null;
  }

  return { groupId, artifactId };
};

const extractMavenDependencies = (text: string) =>
  Array.from(
    text.matchAll(
      /<dependency>[\s\S]*?<groupId>([^<]+)<\/groupId>[\s\S]*?<artifactId>([^<]+)<\/artifactId>[\s\S]*?<\/dependency>/g
    )
  ).map((match) => ({
    groupId: match[1]?.trim() || '',
    artifactId: match[2]?.trim() || '',
  }));

const toMavenPomPath = (sourceRelativePath: string, modulePath: string) =>
  path.posix.normalize(path.posix.join(path.posix.dirname(sourceRelativePath), modulePath, 'pom.xml'));

const extractGradleIncludes = (text: string) => {
  const matches = Array.from(
    text.matchAll(/\binclude\s*\(([\s\S]*?)\)|\binclude\s+((?::[A-Za-z0-9_-]+(?:[:][A-Za-z0-9_-]+)*)+)/g)
  );
  const modules = new Set<string>();

  for (const match of matches) {
    const grouped = match[1] || match[2] || '';
    for (const candidate of grouped.matchAll(/['"](:[A-Za-z0-9_-]+(?::[A-Za-z0-9_-]+)*)['"]/g)) {
      if (candidate[1]) {
        modules.add(candidate[1]);
      }
    }
    if (match[2]) {
      modules.add(match[2]);
    }
  }

  return Array.from(modules);
};

const extractGradleProjectDependencies = (text: string) =>
  Array.from(text.matchAll(/project\s*\(\s*['"](:[A-Za-z0-9_-]+(?::[A-Za-z0-9_-]+)*)['"]\s*\)/g))
    .map((match) => match[1])
    .filter((value): value is string => Boolean(value));

const gradleModuleNotationToPath = (moduleNotation: string) => moduleNotation.replace(/^:/, '').replace(/:/g, '/');

const resolveGradleModuleDescriptor = (
  context: StackAdapterContext,
  settingsRelativePath: string,
  moduleNotation: string
) => {
  const modulePath = gradleModuleNotationToPath(moduleNotation);
  const baseDir = path.posix.dirname(settingsRelativePath);
  const candidates = [
    path.posix.normalize(path.posix.join(baseDir, modulePath, 'build.gradle.kts')),
    path.posix.normalize(path.posix.join(baseDir, modulePath, 'build.gradle')),
  ];

  return candidates.find((candidate) => context.hasRelativePath(candidate)) || null;
};

const cargoBuildAdapter: StackAdapter = {
  id: 'cargo-build-topology',
  displayName: 'Cargo Build Topology',
  category: 'build',
  supports: (context) => !!context.getDetectedStack('cargo'),
  analyze: async (context) => {
    const cargoFiles = context.findBySuffix('Cargo.toml');
    const contents = await context.readTexts(cargoFiles);
    const relativeContentEntries = contents.map((entry) => ({
      filePath: context.getProjectRelativePath(entry.filePath),
      text: entry.text,
    }));
    const workspaceRoot = relativeContentEntries.find((entry) => /\[workspace\]/.test(entry.text));
    const relationships: StackStructuralRelationship[] = [];
    const modules: string[] = [];
    const configFiles = toRelativeList(context, cargoFiles);

    for (const entry of relativeContentEntries) {
      for (const member of extractCargoWorkspaceMembers(entry.text)) {
        if (member.includes('*')) {
          continue;
        }
        const targetManifest = toCargoManifestPath(entry.filePath, member);
        if (!context.hasRelativePath(targetManifest)) {
          continue;
        }
        modules.push(targetManifest);
        relationships.push(
          createRelationship(entry.filePath, targetManifest, 'build', 'cargo_workspace_member')
        );
      }

      for (const dependencyPath of extractCargoPathDependencies(entry.text)) {
        const targetManifest = toCargoManifestPath(entry.filePath, dependencyPath);
        if (!context.hasRelativePath(targetManifest)) {
          continue;
        }
        modules.push(targetManifest);
        relationships.push(
          createRelationship(entry.filePath, targetManifest, 'build', 'cargo_path_dependency')
        );
      }

      for (const binPath of extractCargoBinPaths(entry.text)) {
        const targetFile = path.posix.normalize(path.posix.join(path.posix.dirname(entry.filePath), binPath));
        if (!context.hasRelativePath(targetFile)) {
          continue;
        }
        modules.push(targetFile);
        relationships.push(createRelationship(entry.filePath, targetFile, 'build', 'cargo_bin_target'));
      }
    }

    return createInsight(
      cargoBuildAdapter.id,
      cargoBuildAdapter.displayName,
      cargoBuildAdapter.category,
      `Detected ${cargoFiles.length} Cargo manifests and ${relationships.length} workspace/path/bin build relationships.`,
      {
        evidence: context.getDetectedStack('cargo')?.evidence || [],
        configFiles,
        entryFiles: workspaceRoot ? [workspaceRoot.filePath] : [],
        modules,
        relationships,
      }
    );
  },
};

const dotnetAdapter: StackAdapter = {
  id: 'dotnet-build-topology',
  displayName: '.NET Build Topology',
  category: 'build',
  supports: (context) => !!context.getDetectedStack('dotnet'),
  analyze: async (context) => {
    const projectFiles = context
      .getAllFilePaths()
      .filter((filePath) => /\.(csproj|fsproj|vbproj|sln)$/i.test(filePath));
    const projectContents = await context.readTexts(
      projectFiles.filter((filePath) => /\.(csproj|fsproj|vbproj)$/i.test(filePath))
    );
    const projectReferences = projectContents.flatMap(({ filePath, text }) =>
      Array.from(text.matchAll(/<ProjectReference\s+Include="([^"]+)"/g)).map(
        (match) => `${context.getProjectRelativePath(filePath)} -> ${match[1]}`
      )
    );

    return createInsight(
      dotnetAdapter.id,
      dotnetAdapter.displayName,
      dotnetAdapter.category,
      `Detected ${projectFiles.length} .NET project descriptors and ${projectReferences.length} explicit project references.`,
      {
        evidence: context.getDetectedStack('dotnet')?.evidence || [],
        configFiles: toRelativeList(context, projectFiles),
        modules: projectReferences,
        relationships: projectReferences.reduce<StackStructuralRelationship[]>((acc, reference) => {
          const [source, target] = reference.split(' -> ');
          if (!source || !target) {
            return acc;
          }

          acc.push({
            source,
            target,
            type: 'build',
            reason: 'dotnet_project_reference',
          });
          return acc;
        }, []),
      }
    );
  },
};


export const BUILD_STACK_ADAPTERS: StackAdapter[] = [
  viteAdapter,
  pnpmWorkspaceAdapter,
  nxWorkspaceAdapter,
  turborepoAdapter,
  bazelAdapter,
  pantsAdapter,
  openApiAdapter,
  protobufAdapter,
  cargoBuildAdapter,
  mavenAdapter,
  gradleBuildAdapter,
  dotnetAdapter,
];

import * as path from 'path';
import {
  createRelationship,
  FileContentEntry,
  StackAdapterContext,
  StackStructuralRelationship,
  toRelativeList,
} from './stackTopologySupport';
import { defineAdapter, readRelativeEntries } from './stackTopologyAdapterKit';

/** Collects the links an adapter finds: each one is a relationship and a module of the build. */
const createLinkCollector = () => {
  const modules: string[] = [];
  const relationships: StackStructuralRelationship[] = [];
  return {
    modules,
    relationships,
    link: (source: string, target: string, reason: string) => {
      modules.push(target);
      relationships.push(createRelationship(source, target, 'build', reason));
    },
  };
};

export const mavenAdapter = defineAdapter({
  id: 'maven-build-topology',
  displayName: 'Maven Build Topology',
  category: 'build',
  stackId: 'maven',
  find: async (context) => {
    const pomFiles = context.findBySuffix('pom.xml');
    const relativeEntries = await readRelativeEntries(context, pomFiles);
    const coordinatesToPom = new Map<string, string>();
    const { modules, relationships, link } = createLinkCollector();

    for (const entry of relativeEntries) {
      const coordinates = extractMavenCoordinates(entry.text);
      if (coordinates) {
        coordinatesToPom.set(`${coordinates.groupId}:${coordinates.artifactId}`, entry.filePath);
      }
    }

    for (const entry of relativeEntries) {
      for (const moduleName of extractMavenModules(entry.text)) {
        const targetPom = toMavenPomPath(entry.filePath, moduleName);
        if (context.hasRelativePath(targetPom)) {
          link(entry.filePath, targetPom, 'maven_module_descriptor');
        }
      }

      for (const dependency of extractMavenDependencies(entry.text)) {
        const targetPom = coordinatesToPom.get(`${dependency.groupId}:${dependency.artifactId}`);
        if (targetPom && targetPom !== entry.filePath) {
          link(entry.filePath, targetPom, 'maven_module_dependency');
        }
      }
    }

    return {
      summary: `Detected ${pomFiles.length} Maven descriptors and ${relationships.length} reactor/module dependency relationships.`,
      details: { configFiles: toRelativeList(context, pomFiles), modules, relationships },
    };
  },
});

export const gradleBuildAdapter = defineAdapter({
  id: 'gradle-build-topology',
  displayName: 'Gradle Build Topology',
  category: 'build',
  stackId: 'gradle',
  find: async (context) => {
    const buildFiles = context
      .getAllFilePaths()
      .filter((filePath) =>
        /(?:^|\/)(?:build|settings)\.gradle(?:\.kts)?$/i.test(
          context.getProjectRelativePath(filePath)
        )
      );
    const relativeEntries = await readRelativeEntries(context, buildFiles);
    const settingsEntries = relativeEntries.filter((entry) =>
      /(?:^|\/)settings\.gradle(?:\.kts)?$/i.test(entry.filePath)
    );
    const { modules, relationships, link } = createLinkCollector();

    for (const settingsEntry of settingsEntries) {
      for (const includeNotation of extractGradleIncludes(settingsEntry.text)) {
        const targetDescriptor = resolveGradleModuleDescriptor(
          context,
          settingsEntry.filePath,
          includeNotation
        );
        if (targetDescriptor) {
          link(settingsEntry.filePath, targetDescriptor, 'gradle_settings_module');
        }
      }
    }

    for (const entry of relativeEntries.filter((item) =>
      /(?:^|\/)build\.gradle(?:\.kts)?$/i.test(item.filePath)
    )) {
      for (const dependencyNotation of extractGradleProjectDependencies(entry.text)) {
        const targetDescriptor =
          settingsEntries
            .map((settingsEntry) =>
              resolveGradleModuleDescriptor(context, settingsEntry.filePath, dependencyNotation)
            )
            .find((candidate): candidate is string => Boolean(candidate)) || null;
        if (targetDescriptor && targetDescriptor !== entry.filePath) {
          link(entry.filePath, targetDescriptor, 'gradle_project_dependency');
        }
      }
    }

    return {
      summary: `Detected ${buildFiles.length} Gradle descriptors and ${relationships.length} multi-module build relationships.`,
      details: {
        configFiles: toRelativeList(context, buildFiles),
        entryFiles: settingsEntries.map((entry) => entry.filePath),
        modules,
        relationships,
      },
    };
  },
});

const toCargoManifestPath = (sourceRelativePath: string, targetPath: string) => {
  const normalizedTarget = path.posix.normalize(
    path.posix.join(path.posix.dirname(sourceRelativePath), targetPath)
  );
  return normalizedTarget.endsWith('Cargo.toml')
    ? normalizedTarget
    : `${normalizedTarget}/Cargo.toml`;
};

const extractCargoWorkspaceMembers = (text: string) =>
  Array.from(
    (text.match(/\[workspace\][\s\S]*?members\s*=\s*\[([\s\S]*?)\]/)?.[1] || '').matchAll(
      /"([^"]+)"/g
    )
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
  path.posix.normalize(
    path.posix.join(path.posix.dirname(sourceRelativePath), modulePath, 'pom.xml')
  );

const extractGradleIncludes = (text: string) => {
  const matches = Array.from(
    text.matchAll(
      /\binclude\s*\(([\s\S]*?)\)|\binclude\s+((?::[A-Za-z0-9_-]+(?:[:][A-Za-z0-9_-]+)*)+)/g
    )
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

const gradleModuleNotationToPath = (moduleNotation: string) =>
  moduleNotation.replace(/^:/, '').replace(/:/g, '/');

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

/** Cargo links, in the order of the manifest: workspace members, path dependencies, bin targets. */
const cargoLinks = (context: StackAdapterContext, entries: FileContentEntry[]) => {
  const { modules, relationships, link } = createLinkCollector();
  const linkIfPresent = (source: string, target: string, reason: string) => {
    if (context.hasRelativePath(target)) link(source, target, reason);
  };

  for (const entry of entries) {
    for (const member of extractCargoWorkspaceMembers(entry.text)) {
      if (!member.includes('*')) {
        linkIfPresent(
          entry.filePath,
          toCargoManifestPath(entry.filePath, member),
          'cargo_workspace_member'
        );
      }
    }
    for (const dependencyPath of extractCargoPathDependencies(entry.text)) {
      const manifest = toCargoManifestPath(entry.filePath, dependencyPath);
      linkIfPresent(entry.filePath, manifest, 'cargo_path_dependency');
    }
    for (const binPath of extractCargoBinPaths(entry.text)) {
      const binFile = path.posix.join(path.posix.dirname(entry.filePath), binPath);
      linkIfPresent(entry.filePath, path.posix.normalize(binFile), 'cargo_bin_target');
    }
  }
  return { modules, relationships };
};

export const cargoBuildAdapter = defineAdapter({
  id: 'cargo-build-topology',
  displayName: 'Cargo Build Topology',
  category: 'build',
  stackId: 'cargo',
  find: async (context) => {
    const cargoFiles = context.findBySuffix('Cargo.toml');
    const entries = await readRelativeEntries(context, cargoFiles);
    const workspaceRoot = entries.find((entry) => /\[workspace\]/.test(entry.text));
    const { modules, relationships } = cargoLinks(context, entries);

    return {
      summary: `Detected ${cargoFiles.length} Cargo manifests and ${relationships.length} workspace/path/bin build relationships.`,
      details: {
        configFiles: toRelativeList(context, cargoFiles),
        entryFiles: workspaceRoot ? [workspaceRoot.filePath] : [],
        modules,
        relationships,
      },
    };
  },
});

export const dotnetAdapter = defineAdapter({
  id: 'dotnet-build-topology',
  displayName: '.NET Build Topology',
  category: 'build',
  stackId: 'dotnet',
  find: async (context) => {
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

    return {
      summary: `Detected ${projectFiles.length} .NET project descriptors and ${projectReferences.length} explicit project references.`,
      details: {
        configFiles: toRelativeList(context, projectFiles),
        modules: projectReferences,
        relationships: projectReferences.flatMap((reference) => {
          const [source, target] = reference.split(' -> ');
          return source && target
            ? [createRelationship(source, target, 'build', 'dotnet_project_reference')]
            : [];
        }),
      },
    };
  },
});

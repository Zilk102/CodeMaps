import * as path from 'path';
import {
  createInsight,
  createRelationship,
  StackAdapter,
  StackAdapterContext,
  StackStructuralRelationship,
  toRelativeList,
} from './stackTopologySupport';

export const mavenAdapter: StackAdapter = {
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

export const gradleBuildAdapter: StackAdapter = {
  id: 'gradle-build-topology',
  displayName: 'Gradle Build Topology',
  category: 'build',
  supports: (context) => !!context.getDetectedStack('gradle'),
  analyze: async (context) => {
    const buildFiles = context
      .getAllFilePaths()
      .filter((filePath) =>
        /(?:^|\/)(?:build|settings)\.gradle(?:\.kts)?$/i.test(
          context.getProjectRelativePath(filePath)
        )
      );
    const buildContents = await context.readTexts(buildFiles);
    const relativeEntries = buildContents.map((entry) => ({
      filePath: context.getProjectRelativePath(entry.filePath),
      text: entry.text,
    }));
    const settingsEntries = relativeEntries.filter((entry) =>
      /(?:^|\/)settings\.gradle(?:\.kts)?$/i.test(entry.filePath)
    );
    const relationships: StackStructuralRelationship[] = [];
    const modules: string[] = [];

    for (const settingsEntry of settingsEntries) {
      for (const includeNotation of extractGradleIncludes(settingsEntry.text)) {
        const targetDescriptor = resolveGradleModuleDescriptor(
          context,
          settingsEntry.filePath,
          includeNotation
        );
        if (!targetDescriptor) {
          continue;
        }
        modules.push(targetDescriptor);
        relationships.push(
          createRelationship(
            settingsEntry.filePath,
            targetDescriptor,
            'build',
            'gradle_settings_module'
          )
        );
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

export const cargoBuildAdapter: StackAdapter = {
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
        const targetFile = path.posix.normalize(
          path.posix.join(path.posix.dirname(entry.filePath), binPath)
        );
        if (!context.hasRelativePath(targetFile)) {
          continue;
        }
        modules.push(targetFile);
        relationships.push(
          createRelationship(entry.filePath, targetFile, 'build', 'cargo_bin_target')
        );
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

export const dotnetAdapter: StackAdapter = {
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

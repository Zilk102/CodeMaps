import {
  dirOf,
  entityTarget,
  hasEntity,
  joinPath,
  normalizeSegments,
  type FileEntry,
  type LanguageResolver,
  type ProjectIndex,
  type ResolvedEdge,
} from './types';

interface GoModule {
  dir: string;
  modulePath: string;
  /** `replace example.com/x => ./local` directives pointing inside the repository. */
  replacements: Array<{ from: string; dir: string }>;
}

const parseGoMod = (dir: string, text: string): GoModule | null => {
  const module = /^\s*module\s+("?)([^\s"]+)\1/m.exec(text);
  if (!module) return null;
  const replacements: GoModule['replacements'] = [];
  const replaceLine =
    /^\s*(?:replace\s+)?([^\s=]+)(?:\s+v[^\s]+)?\s*=>\s*(\.{1,2}\/[^\s]*|\.{1,2})\s*$/gm;
  for (const match of text.matchAll(replaceLine)) {
    replacements.push({ from: match[1], dir: normalizeSegments(joinPath(dir, match[2])) });
  }
  return { dir, modulePath: module[2], replacements };
};

const isTestFile = (path: string) => path.endsWith('_test.go');

/** `foo/v2` exposes package foo. */
const lastMeaningfulSegment = (importPath: string): string => {
  const segments = importPath.split('/');
  const last = segments[segments.length - 1] ?? '';
  return /^v\d+$/.test(last) && segments.length > 1 ? segments[segments.length - 2] : last;
};

export class GoResolver implements LanguageResolver {
  readonly languageId = 'go';
  private modules: GoModule[] = [];
  private index!: ProjectIndex;

  async prepare(index: ProjectIndex): Promise<void> {
    this.index = index;
    const modules: GoModule[] = [];
    for (const manifest of index.manifests.goMod) {
      const text = await index.readText(manifest);
      const parsed = text ? parseGoMod(dirOf(manifest), text) : null;
      if (parsed) modules.push(parsed);
    }
    // Longest module path wins so nested modules shadow their parent.
    this.modules = modules.sort((a, b) => b.modulePath.length - a.modulePath.length);
  }

  /** Directory inside the project that an import path points at, if any. */
  private directoryFor(importPath: string): string | null {
    for (const module of this.modules) {
      for (const replacement of module.replacements) {
        if (importPath === replacement.from) return replacement.dir;
        if (importPath.startsWith(`${replacement.from}/`)) {
          return joinPath(replacement.dir, importPath.slice(replacement.from.length + 1));
        }
      }
      if (importPath === module.modulePath) return module.dir;
      if (importPath.startsWith(`${module.modulePath}/`)) {
        return joinPath(module.dir, importPath.slice(module.modulePath.length + 1));
      }
    }
    return null;
  }

  private packageFiles(directory: string, importer: FileEntry): FileEntry[] {
    const includeTests = isTestFile(importer.path);
    return (this.index.filesByDir.get(directory) ?? [])
      .map((path) => this.index.files.get(path))
      .filter(
        (file): file is FileEntry =>
          !!file && file.language === 'go' && (includeTests || !isTestFile(file.path))
      );
  }

  /** The file that best stands for a package: `<dir>.go`, else the one declaring most symbols. */
  private primaryFile(directory: string, files: FileEntry[]): string {
    const named = files.find(
      (file) => file.path === `${directory}/${directory.split('/').pop()}.go`
    );
    if (named) return named.path;
    const size = (file: FileEntry) => this.index.entitiesByFile.get(file.path)?.size ?? 0;
    return [...files].sort((a, b) => size(b) - size(a) || a.path.localeCompare(b.path))[0].path;
  }

  private importEdges(file: FileEntry): ResolvedEdge[] {
    const edges: ResolvedEdge[] = [];
    for (const record of file.facts.imports) {
      const directory = this.directoryFor(record.path);
      if (!directory) continue;
      const files = this.packageFiles(directory, file);
      if (files.length === 0) continue;

      const declared = files.find((candidate) => candidate.facts.packageName)?.facts.packageName;
      const qualifier =
        record.alias && record.alias !== '.' && record.alias !== '_'
          ? record.alias
          : (declared ?? lastMeaningfulSegment(record.path));

      const names = new Set<string>();
      if (record.alias === '.') {
        // A dot import makes every exported name available unqualified.
        file.facts.usedNames.forEach((name) => names.add(name));
      }
      for (const use of file.facts.qualifiedUses) {
        if (use.qualifier === qualifier && record.alias !== '.') names.add(use.name);
      }

      let matched = 0;
      for (const name of names) {
        for (const candidate of files) {
          if (hasEntity(this.index, candidate.path, name)) {
            edges.push({
              target: entityTarget(candidate.path, name),
              value: 2,
              reason: 'go:import',
            });
            matched += 1;
          }
        }
      }
      // Constants, variables, side-effect imports: depend on the package as a whole.
      if (matched === 0) {
        edges.push({ target: this.primaryFile(directory, files), value: 1, reason: 'go:package' });
      }
    }
    return edges;
  }

  /** Files of one package see each other without imports. */
  private samePackageEdges(file: FileEntry): ResolvedEdge[] {
    const directory = dirOf(file.path);
    const edges: ResolvedEdge[] = [];
    const ownPackage = file.facts.packageName?.replace(/_test$/, '');
    const siblings = this.packageFiles(directory, file).filter(
      (candidate) =>
        candidate.path !== file.path &&
        (candidate.facts.packageName?.replace(/_test$/, '') ?? ownPackage) === ownPackage
    );
    if (siblings.length === 0) return edges;

    for (const name of file.facts.usedNames) {
      for (const sibling of siblings) {
        if (hasEntity(this.index, sibling.path, name)) {
          edges.push({
            target: entityTarget(sibling.path, name),
            value: 2,
            reason: 'go:same package',
          });
        }
      }
    }
    return edges;
  }

  resolve(file: FileEntry): ResolvedEdge[] {
    return [...this.importEdges(file), ...this.samePackageEdges(file)];
  }
}

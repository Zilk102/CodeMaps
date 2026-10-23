import type { ImportRecord } from '../parsing/types';
import {
  directoryForImport,
  isTestFile,
  lastMeaningfulSegment,
  parseGoMod,
  type GoModule,
} from './goModules';
import {
  dirOf,
  entityTarget,
  hasEntity,
  type FileEntry,
  type LanguageResolver,
  type ProjectIndex,
  type ResolvedEdge,
} from './types';

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

  /** The package name used to qualify names of an imported package. */
  private qualifierFor(record: ImportRecord, files: FileEntry[]): string {
    if (record.alias && record.alias !== '.' && record.alias !== '_') return record.alias;
    const declared = files.find((candidate) => candidate.facts.packageName)?.facts.packageName;
    return declared ?? lastMeaningfulSegment(record.path);
  }

  /** Names of the imported package that the importing file refers to. */
  private referencedNames(file: FileEntry, record: ImportRecord, qualifier: string): Set<string> {
    // A dot import makes every exported name available unqualified.
    if (record.alias === '.') return new Set(file.facts.usedNames);
    const names = new Set<string>();
    for (const use of file.facts.qualifiedUses) {
      if (use.qualifier === qualifier) names.add(use.name);
    }
    return names;
  }

  private edgesForImport(file: FileEntry, record: ImportRecord): ResolvedEdge[] {
    const directory = directoryForImport(this.modules, record.path);
    if (!directory) return [];
    const files = this.packageFiles(directory, file);
    if (files.length === 0) return [];

    const names = this.referencedNames(file, record, this.qualifierFor(record, files));
    const edges: ResolvedEdge[] = [];
    for (const name of names) {
      for (const candidate of files) {
        if (hasEntity(this.index, candidate.path, name)) {
          edges.push({ target: entityTarget(candidate.path, name), value: 2, reason: 'go:import' });
        }
      }
    }
    // Constants, variables, side-effect imports: depend on the package as a whole.
    if (edges.length === 0) {
      edges.push({ target: this.primaryFile(directory, files), value: 1, reason: 'go:package' });
    }
    return edges;
  }

  private importEdges(file: FileEntry): ResolvedEdge[] {
    return file.facts.imports.flatMap((record) => this.edgesForImport(file, record));
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

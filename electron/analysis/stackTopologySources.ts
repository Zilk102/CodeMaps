import * as path from 'path';
import {
  buildGraphSymbolIndex,
  buildSymbolToFileMap,
  getContentByRelativePath,
  type FileContentEntry,
  type GraphSymbolIndex,
  type StackAdapterContext,
} from './stackTopologySupport';

/** Build files that carry the configuration of a JVM project. */
export const JVM_BUILD_FILES = ['pom.xml', 'build.gradle', 'build.gradle.kts'];
export const SPRING_STYLE_CONFIG_FILES = [
  ...JVM_BUILD_FILES,
  'src/main/resources/application.yml',
  'src/main/resources/application.properties',
];

/** The source files of one language family, read once and indexed by project-relative path. */
export interface AdapterSources {
  context: StackAdapterContext;
  graphSymbolIndex: GraphSymbolIndex;
  entries: FileContentEntry[];
  contentByRelativePath: Map<string, string>;
}

/** Reads the given files and keys the texts by project-relative path. */
export const readRelativeEntries = async (
  context: StackAdapterContext,
  filePaths: string[]
): Promise<FileContentEntry[]> => {
  const contents = await context.readTexts(filePaths);
  return contents.map((entry) => ({
    filePath: context.getProjectRelativePath(entry.filePath),
    text: entry.text,
  }));
};

export const loadSources = async (
  context: StackAdapterContext,
  extensions: RegExp
): Promise<AdapterSources> => {
  const graphSymbolIndex = buildGraphSymbolIndex(context.graph);
  const candidateFiles = context
    .getAllFilePaths()
    .filter((filePath) => extensions.test(context.getProjectRelativePath(filePath)));
  const entries = await readRelativeEntries(context, candidateFiles);
  return {
    context,
    graphSymbolIndex,
    entries,
    contentByRelativePath: getContentByRelativePath(entries),
  };
};

export const textOf = (sources: AdapterSources, filePath: string) =>
  sources.contentByRelativePath.get(filePath) || '';

/** Relative paths of the source files whose text matches. */
export const filesMatching = (entries: FileContentEntry[], pattern: RegExp) =>
  entries.filter(({ text }) => pattern.test(text)).map(({ filePath }) => filePath);

/** Relative paths of the source files for which the predicate holds. */
export const filesWhere = (
  entries: FileContentEntry[],
  predicate: (entry: FileContentEntry) => boolean
) => entries.filter(predicate).map(({ filePath }) => filePath);

/** Relative paths of the source files whose file name is in the set. */
export const filesWithNameIn = (entries: FileContentEntry[], names: ReadonlySet<string>) =>
  filesWhere(entries, (entry) => names.has(path.posix.basename(entry.filePath)));

/** Project files (absolute paths) whose relative path is one of `names`. */
export const configFilesNamed = (context: StackAdapterContext, names: string[]) =>
  context
    .getAllFilePaths()
    .filter((filePath) => names.includes(context.getProjectRelativePath(filePath)));

/** The project file (absolute path) whose relative path is `name`. */
export const findFileNamed = (context: StackAdapterContext, name: string) =>
  context.getAllFilePaths().find((filePath) => context.getProjectRelativePath(filePath) === name);

/** Project files (absolute paths) whose file name is one of `names`, wherever they sit. */
export const filesWithBasename = (context: StackAdapterContext, names: string[]) =>
  context
    .getAllFilePaths()
    .filter((filePath) =>
      names.includes(path.posix.basename(context.getProjectRelativePath(filePath)))
    );

/** Symbols declared by the given files, mapped back to their file. */
export const symbolsOfFiles = (sources: AdapterSources, files: string[]) =>
  buildSymbolToFileMap(sources.entries.filter((entry) => files.includes(entry.filePath)));

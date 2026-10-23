import * as path from 'path';
import {
  buildGraphSymbolIndex,
  buildSymbolToFileMap,
  createInsight,
  createRelationship,
  findReferencedSymbolMatches,
  getContentByRelativePath,
  inferClassSymbolsForFile,
  resolveSymbolEndpoint,
  type FileContentEntry,
  type GraphSymbolIndex,
  type StackAdapter,
  type StackAdapterCategory,
  type StackAdapterContext,
  type StackRelationshipType,
  type StackStructuralInsight,
  type StackStructuralRelationship,
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

/** Relative paths of the source files whose file name is in the set. */
export const filesWithNameIn = (entries: FileContentEntry[], names: ReadonlySet<string>) =>
  filesWhere(entries, (entry) => names.has(path.posix.basename(entry.filePath)));

/** Relative paths of the source files for which the predicate holds. */
export const filesWhere = (
  entries: FileContentEntry[],
  predicate: (entry: FileContentEntry) => boolean
) => entries.filter(predicate).map(({ filePath }) => filePath);

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

/** Every source path links to every target path (both project-relative). */
export const fanOutLinks = (
  sourcePaths: string[],
  targetPaths: string[],
  reason: string,
  type: StackRelationshipType = 'build'
) =>
  sourcePaths.flatMap((source) =>
    targetPaths.map((target) => createRelationship(source, target, type, reason))
  );

/** Symbols declared by the given files, mapped back to their file. */
export const symbolsOfFiles = (sources: AdapterSources, files: string[]) =>
  buildSymbolToFileMap(sources.entries.filter((entry) => files.includes(entry.filePath)));

/** The file itself, or the classes it declares when the graph knows them. */
export const classEndpoint = (sources: AdapterSources, filePath: string) =>
  resolveSymbolEndpoint(filePath, sources.graphSymbolIndex, {
    preferredSymbols: inferClassSymbolsForFile(textOf(sources, filePath)),
  });

export const fileEndpoint = (sources: AdapterSources, filePath: string, symbol?: string) =>
  resolveSymbolEndpoint(
    filePath,
    sources.graphSymbolIndex,
    symbol === undefined ? {} : { preferredSymbols: [symbol] }
  );

type EndpointKind = 'file' | 'class';
const endpointOf = (sources: AdapterSources, filePath: string, kind: EndpointKind) =>
  kind === 'class' ? classEndpoint(sources, filePath) : fileEndpoint(sources, filePath);

/** One framework link per (file, target) pair; the target callback says what each file links to. */
const linksFromFiles = (
  files: string[],
  sourceOf: (file: string) => string,
  targetsOf: (file: string) => string[],
  reason: string
): StackStructuralRelationship[] =>
  files.flatMap((file) =>
    targetsOf(file).map((target) => createRelationship(sourceOf(file), target, 'framework', reason))
  );

/** A file mentions a symbol declared in another file of the symbol map: a framework link. */
export const referenceLinks = (
  sources: AdapterSources,
  fromFiles: string[],
  symbolMap: Map<string, string>,
  reason: string,
  fromKind: EndpointKind = 'class'
) =>
  linksFromFiles(
    fromFiles,
    (file) => endpointOf(sources, file, fromKind),
    (file) =>
      findReferencedSymbolMatches(textOf(sources, file), symbolMap, [file]).map(
        ({ filePath, symbol }) => fileEndpoint(sources, filePath, symbol)
      ),
    reason
  );

/**
 * A file names symbols (routes, views, methods); each name the file extracts links to the symbol
 * in the file `locate` finds for it, and is skipped when there is none.
 */
const namedSymbolLinks = (
  sources: AdapterSources,
  files: string[],
  fromKind: EndpointKind,
  extractNames: (text: string) => string[],
  locate: (file: string, name: string) => string | undefined,
  reason: string
) =>
  linksFromFiles(
    files,
    (file) => endpointOf(sources, file, fromKind),
    (file) =>
      extractNames(textOf(sources, file)).flatMap((name) => {
        const target = locate(file, name);
        return target === undefined ? [] : [fileEndpoint(sources, target, name)];
      }),
    reason
  );

/** A file names symbols (routes, views) that live in other files of the symbol map. */
export const targetLinks = (
  sources: AdapterSources,
  fromFiles: string[],
  extractTargets: (text: string) => string[],
  symbolMap: Map<string, string>,
  reason: string
) =>
  namedSymbolLinks(
    sources,
    fromFiles,
    'file',
    extractTargets,
    (_file, symbol) => symbolMap.get(symbol),
    reason
  );

/** A file links to the methods it declares (route handlers) that the extractor finds. */
export const methodLinks = (
  sources: AdapterSources,
  files: string[],
  extractMethods: (text: string) => string[],
  reason: string
) => namedSymbolLinks(sources, files, 'class', extractMethods, (file) => file, reason);

/** Every entry file links to every target file. */
export const entryLinks = (
  sources: AdapterSources,
  entryFiles: string[],
  targetFiles: string[],
  reason: string,
  kinds: { entry?: EndpointKind; target?: EndpointKind } = {}
) =>
  linksFromFiles(
    entryFiles,
    (file) => endpointOf(sources, file, kinds.entry ?? 'file'),
    () => targetFiles.map((file) => endpointOf(sources, file, kinds.target ?? 'file')),
    reason
  );

/** A route file links to a handler function, found in the function map or else in the route file. */
export const handlerLinks = (
  sources: AdapterSources,
  routeFiles: string[],
  extractHandlers: (text: string) => string[],
  functionSymbols: Map<string, string>,
  reason: string
) =>
  namedSymbolLinks(
    sources,
    routeFiles,
    'file',
    extractHandlers,
    (file, handler) => functionSymbols.get(handler) || file,
    reason
  );

/** Each config file builds each entry file. */
export const configEntryLinks = (
  sources: AdapterSources,
  configFiles: string[],
  entryFiles: string[],
  reason: string
): StackStructuralRelationship[] =>
  configFiles.flatMap((configFile) =>
    entryFiles.map((entryFile) => ({
      source: sources.context.getProjectRelativePath(configFile),
      target: fileEndpoint(sources, entryFile),
      type: 'build' as const,
      reason,
    }))
  );

type InsightDetails = Partial<
  Omit<StackStructuralInsight, 'adapterId' | 'displayName' | 'category' | 'summary'>
>;

export interface AdapterFindings {
  /** The summary line. */
  summary: string;
  /** The structure found (evidence is added by the adapter). */
  details: InsightDetails;
}

interface AdapterSpec {
  id: string;
  displayName: string;
  category: StackAdapterCategory;
  /** The detected stack the adapter belongs to; its evidence is reported. */
  stackId: string;
  /** Further detected stacks whose evidence is reported too. */
  alsoEvidence?: string[];
  /** Defaults to "the stack was detected". */
  supports?: StackAdapter['supports'];
  find: (context: StackAdapterContext) => Promise<AdapterFindings | null> | AdapterFindings | null;
}

/** An adapter states what it finds; the stack check, the evidence and the insight are shared. */
export const defineAdapter = (spec: AdapterSpec): StackAdapter => ({
  id: spec.id,
  displayName: spec.displayName,
  category: spec.category,
  supports: spec.supports ?? ((context) => !!context.getDetectedStack(spec.stackId)),
  analyze: async (context) => {
    const found = await spec.find(context);
    if (!found) return null;
    const evidence = [spec.stackId, ...(spec.alsoEvidence ?? [])].flatMap(
      (stackId) => context.getDetectedStack(stackId)?.evidence || []
    );
    return createInsight(spec.id, spec.displayName, spec.category, found.summary, {
      evidence,
      ...found.details,
    });
  },
});

interface SourceAdapterSpec {
  id: string;
  displayName: string;
  stackId: string;
  /** Source files the adapter reads. */
  extensions: RegExp;
  /** File names of the tool's configuration; the matching sources are handed to `describe`. */
  configBasenames?: ReadonlySet<string>;
  describe: (sources: AdapterSources, configFiles: string[]) => AdapterFindings;
}

/** An adapter that reads the project files with the given extensions and describes them. */
export const defineSourceAdapter = (category: StackAdapterCategory, spec: SourceAdapterSpec) =>
  defineAdapter({
    id: spec.id,
    displayName: spec.displayName,
    category,
    stackId: spec.stackId,
    find: async (context) => {
      const sources = await loadSources(context, spec.extensions);
      const configFiles = filesWithNameIn(sources.entries, spec.configBasenames ?? new Set());
      return spec.describe(sources, configFiles);
    },
  });

/** A framework adapter reads the sources and describes the structure found in them. */
export const defineFrameworkAdapter = (spec: SourceAdapterSpec): StackAdapter =>
  defineSourceAdapter('framework', spec);

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
  type StackAdapterContext,
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

export const loadSources = async (
  context: StackAdapterContext,
  extensions: RegExp
): Promise<AdapterSources> => {
  const graphSymbolIndex = buildGraphSymbolIndex(context.graph);
  const candidateFiles = context
    .getAllFilePaths()
    .filter((filePath) => extensions.test(context.getProjectRelativePath(filePath)));
  const contents = await context.readTexts(candidateFiles);
  const entries = contents.map((entry) => ({
    filePath: context.getProjectRelativePath(entry.filePath),
    text: entry.text,
  }));
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

/** Project files (absolute paths) whose relative path is one of `names`. */
export const configFilesNamed = (context: StackAdapterContext, names: string[]) =>
  context
    .getAllFilePaths()
    .filter((filePath) => names.includes(context.getProjectRelativePath(filePath)));

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

/** A file names symbols (routes, views) that live in other files of the symbol map. */
export const targetLinks = (
  sources: AdapterSources,
  fromFiles: string[],
  extractTargets: (text: string) => string[],
  symbolMap: Map<string, string>,
  reason: string
) =>
  linksFromFiles(
    fromFiles,
    (file) => fileEndpoint(sources, file),
    (file) =>
      extractTargets(textOf(sources, file)).flatMap((symbol) => {
        const filePath = symbolMap.get(symbol);
        return filePath === undefined ? [] : [fileEndpoint(sources, filePath, symbol)];
      }),
    reason
  );

/** A file links to the methods it declares (route handlers) that the extractor finds. */
export const methodLinks = (
  sources: AdapterSources,
  files: string[],
  extractMethods: (text: string) => string[],
  reason: string
) =>
  linksFromFiles(
    files,
    (file) => classEndpoint(sources, file),
    (file) =>
      extractMethods(textOf(sources, file)).map((method) => fileEndpoint(sources, file, method)),
    reason
  );

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
  linksFromFiles(
    routeFiles,
    (file) => fileEndpoint(sources, file),
    (file) =>
      extractHandlers(textOf(sources, file)).map((handler) =>
        fileEndpoint(sources, functionSymbols.get(handler) || file, handler)
      ),
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

interface FrameworkAdapterSpec {
  id: string;
  displayName: string;
  stackId: string;
  /** Source files the adapter reads. */
  extensions: RegExp;
  /** The summary line and the structure found in the sources (evidence is added here). */
  describe: (sources: AdapterSources) => { summary: string; details: InsightDetails };
}

/** A framework adapter states what it finds; reading the sources and wrapping the insight is shared. */
export const defineFrameworkAdapter = (spec: FrameworkAdapterSpec): StackAdapter => ({
  id: spec.id,
  displayName: spec.displayName,
  category: 'framework',
  supports: (context) => !!context.getDetectedStack(spec.stackId),
  analyze: async (context) => {
    const sources = await loadSources(context, spec.extensions);
    const { summary, details } = spec.describe(sources);
    return createInsight(spec.id, spec.displayName, 'framework', summary, {
      evidence: context.getDetectedStack(spec.stackId)?.evidence || [],
      ...details,
    });
  },
});

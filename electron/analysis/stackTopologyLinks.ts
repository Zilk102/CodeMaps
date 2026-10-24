/**
 * Builders of stack relationships (links between files and symbols) that adapters share: fan-out
 * links, reference links, handler links and config-to-entry links.
 */
import {
  createRelationship,
  findReferencedSymbolMatches,
  inferClassSymbolsForFile,
  resolveSymbolEndpoint,
  type StackRelationshipType,
  type StackStructuralRelationship,
} from './stackTopologySupport';
import { symbolsOfFiles, textOf, type AdapterSources } from './stackTopologySources';

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

/** The file itself, or the classes it declares when the graph knows them. */
export const classEndpoint = (sources: AdapterSources, filePath: string) =>
  resolveSymbolEndpoint(filePath, sources.graphSymbolIndex, {
    preferredSymbols: inferClassSymbolsForFile(textOf(sources, filePath)),
  });

/** Graph endpoint for a file, or for `symbol` inside it when the graph has such a symbol. */
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

/** Files that use the symbols of the model files (views, controllers) link to them as files. */
export const modelUseLinks = (
  sources: AdapterSources,
  userFiles: string[],
  modelFiles: string[],
  reason: string
) => referenceLinks(sources, userFiles, symbolsOfFiles(sources, modelFiles), reason, 'file');

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

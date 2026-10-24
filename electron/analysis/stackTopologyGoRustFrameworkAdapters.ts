/**
 * Topology adapters for Go (Gin, Fiber, Echo, Chi, gRPC-Go) and Rust (Axum, Actix Web) web frameworks:
 * entry files, route-bearing modules and the handlers they register.
 */
import {
  buildNamedSymbolToFileMap,
  buildSymbolToFileMap,
  createRelationship,
  extractActixHandlerNames,
  extractAxumHandlerNames,
  extractGoFunctionNames,
  extractGoRouteHandlers,
  extractGrpcRegistrationTargets,
  extractRustFunctionNames,
  toRelativeList,
} from './stackTopologySupport';
import { configEntryLinks, entryLinks, fileEndpoint, handlerLinks } from './stackTopologyLinks';
import { configFilesNamed, filesMatching, textOf } from './stackTopologySources';
import { defineFrameworkAdapter } from './stackTopologyAdapterFactory';

interface RouterAdapterOptions {
  stackId: string;
  adapterId: string;
  displayName: string;
  /** How the entry and route counts are named in the summary. */
  label: string;
  extensions: RegExp;
  manifest: string;
  entryPattern: RegExp;
  routePattern: RegExp;
  extractHandlers: (text: string) => string[];
  extractFunctionNames: (text: string) => string[];
  entryReason: string;
  handlerReason: string;
  configReason: string;
}

/** An adapter for a router-style web framework: entry files, route files and their handlers. */
const createRouterAdapter = (options: RouterAdapterOptions) =>
  defineFrameworkAdapter({
    id: options.adapterId,
    displayName: options.displayName,
    stackId: options.stackId,
    extensions: options.extensions,
    describe: (sources) => {
      const { context, entries } = sources;
      const configFiles = configFilesNamed(context, [options.manifest]);
      const entryFiles = filesMatching(entries, options.entryPattern);
      const routeFiles = filesMatching(entries, options.routePattern);
      const functionSymbols = buildNamedSymbolToFileMap(entries, options.extractFunctionNames);

      return {
        summary: `Detected ${entryFiles.length} ${options.label} entry files and ${routeFiles.length} route-bearing modules.`,
        details: {
          entryFiles,
          configFiles: toRelativeList(context, configFiles),
          routes: routeFiles,
          relationships: [
            ...entryLinks(sources, entryFiles, routeFiles, options.entryReason),
            ...handlerLinks(
              sources,
              routeFiles,
              options.extractHandlers,
              functionSymbols,
              options.handlerReason
            ),
            ...configEntryLinks(sources, configFiles, entryFiles, options.configReason),
          ],
        },
      };
    },
  });

/** `.GET(path, handler)`-style route registration for the given verb names. */
const goRoutePattern = (verbs: string) =>
  new RegExp(String.raw`\.(?:${verbs})\s*\([^,]+,\s*[A-Za-z_][A-Za-z0-9_]*\s*\)`);

interface GoWebOptions {
  /** Lower-case stack id, which also names the adapter and its relationship reasons. */
  stackId: string;
  displayName: string;
  entryPattern: RegExp;
  /** The verb names the framework registers routes with, e.g. `GET|POST`. */
  routeVerbs: string;
}

/**
 * Adapter for a Go router framework: files with the framework's entry call are linked to the
 * files registering routes with its verbs (`.GET(path, handler)`) and to the handlers, plus go.mod.
 */
const createGoWebAdapter = (options: GoWebOptions) =>
  createRouterAdapter({
    stackId: options.stackId,
    adapterId: `${options.stackId}-topology`,
    displayName: options.displayName,
    label: options.displayName,
    extensions: /\.go$/i,
    manifest: 'go.mod',
    entryPattern: options.entryPattern,
    routePattern: goRoutePattern(options.routeVerbs),
    extractHandlers: extractGoRouteHandlers,
    extractFunctionNames: extractGoFunctionNames,
    entryReason: `${options.stackId}_entry_router`,
    handlerReason: `${options.stackId}_router_handler`,
    configReason: `gomod_${options.stackId}_entry`,
  });

const UPPERCASE_VERBS = 'GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD|Any';

const ginAdapter = createGoWebAdapter({
  stackId: 'gin',
  displayName: 'Gin Topology',
  entryPattern: /\bgin\.(?:Default|New)\s*\(/,
  routeVerbs: UPPERCASE_VERBS,
});

const fiberAdapter = createGoWebAdapter({
  stackId: 'fiber',
  displayName: 'Fiber Topology',
  entryPattern: /\bfiber\.New\s*\(/,
  routeVerbs: 'Get|Post|Put|Patch|Delete|Options|Head|All',
});

const echoAdapter = createGoWebAdapter({
  stackId: 'echo',
  displayName: 'Echo Topology',
  entryPattern: /\becho\.New\s*\(/,
  routeVerbs: UPPERCASE_VERBS,
});

const chiAdapter = createGoWebAdapter({
  stackId: 'chi',
  displayName: 'Chi Topology',
  entryPattern: /\bchi\.NewRouter\s*\(/,
  routeVerbs: 'Get|Post|Put|Patch|Delete|Method|Handle|Mount',
});

const grpcGoAdapter = defineFrameworkAdapter({
  id: 'grpc-go-topology',
  displayName: 'gRPC-Go Topology',
  stackId: 'grpc-go',
  extensions: /\.go$/i,
  describe: (sources) => {
    const { context, entries } = sources;
    const goSymbols = buildNamedSymbolToFileMap(entries, extractGoFunctionNames);
    const typeSymbols = buildSymbolToFileMap(entries);
    const configFiles = configFilesNamed(context, ['go.mod']);
    const entryFiles = filesMatching(entries, /\bgrpc\.NewServer\s*\(/);
    const registrationFiles = filesMatching(entries, /\bRegister[A-Z][A-Za-z0-9_]*Server\s*\(/);

    const registrationLinks = registrationFiles.flatMap((registrationFile) =>
      extractGrpcRegistrationTargets(textOf(sources, registrationFile)).flatMap(
        ({ implementation }) => {
          const matchedFile = typeSymbols.get(implementation) || goSymbols.get(implementation);
          if (!matchedFile) return [];
          return [
            createRelationship(
              fileEndpoint(sources, registrationFile),
              fileEndpoint(sources, matchedFile, implementation),
              'framework',
              'grpc_registration_handler'
            ),
          ];
        }
      )
    );

    return {
      summary: `Detected ${entryFiles.length} gRPC server entry files and ${registrationFiles.length} registration-bearing modules.`,
      details: {
        entryFiles,
        configFiles: toRelativeList(context, configFiles),
        modules: registrationFiles,
        relationships: [
          ...entryLinks(sources, entryFiles, registrationFiles, 'grpc_entry_registration'),
          ...registrationLinks,
          ...configEntryLinks(sources, configFiles, entryFiles, 'gomod_grpc_entry'),
        ],
      },
    };
  },
});

const createRustWebAdapter = (
  options: Omit<RouterAdapterOptions, 'extensions' | 'manifest' | 'extractFunctionNames'>
) =>
  createRouterAdapter({
    ...options,
    extensions: /\.rs$/i,
    manifest: 'Cargo.toml',
    extractFunctionNames: extractRustFunctionNames,
  });

const axumAdapter = createRustWebAdapter({
  stackId: 'axum',
  adapterId: 'axum-topology',
  displayName: 'Axum Topology',
  label: 'Axum',
  entryPattern: /\bRouter::new\s*\(|\baxum::serve\s*\(/,
  routePattern: /\.route\s*\([^,]+,\s*(?:get|post|put|patch|delete|options|head|any)\s*\(/,
  extractHandlers: extractAxumHandlerNames,
  entryReason: 'axum_entry_router',
  handlerReason: 'axum_router_handler',
  configReason: 'cargo_axum_entry',
});

const actixAdapter = createRustWebAdapter({
  stackId: 'actix-web',
  adapterId: 'actix-web-topology',
  displayName: 'Actix Web Topology',
  label: 'Actix',
  entryPattern: /\bHttpServer::new\s*\(|\bApp::new\s*\(/,
  routePattern:
    /\b(?:web::(?:get|post|put|patch|delete)\s*\(\)\.to\s*\(|#\[(?:get|post|put|patch|delete|route))/,
  extractHandlers: extractActixHandlerNames,
  entryReason: 'actix_entry_routes',
  handlerReason: 'actix_route_handler',
  configReason: 'cargo_actix_entry',
});

export const GO_RUST_FRAMEWORK_STACK_ADAPTERS = [
  ginAdapter,
  fiberAdapter,
  echoAdapter,
  chiAdapter,
  grpcGoAdapter,
  axumAdapter,
  actixAdapter,
];

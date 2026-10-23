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
import {
  configEntryLinks,
  configFilesNamed,
  defineFrameworkAdapter,
  entryLinks,
  fileEndpoint,
  filesMatching,
  handlerLinks,
  textOf,
} from './stackTopologyAdapterKit';

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

interface GoWebOptions {
  stackId: string;
  adapterId: string;
  displayName: string;
  entryPattern: RegExp;
  routePattern: RegExp;
  entryReason: string;
  handlerReason: string;
  configReason: string;
}

const createGoWebAdapter = (options: GoWebOptions) =>
  createRouterAdapter({
    ...options,
    label: options.displayName,
    extensions: /\.go$/i,
    manifest: 'go.mod',
    extractHandlers: extractGoRouteHandlers,
    extractFunctionNames: extractGoFunctionNames,
  });

const ginAdapter = createGoWebAdapter({
  stackId: 'gin',
  adapterId: 'gin-topology',
  displayName: 'Gin Topology',
  entryPattern: /\bgin\.(?:Default|New)\s*\(/,
  routePattern:
    /\.(?:GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD|Any)\s*\([^,]+,\s*[A-Za-z_][A-Za-z0-9_]*\s*\)/,
  entryReason: 'gin_entry_router',
  handlerReason: 'gin_router_handler',
  configReason: 'gomod_gin_entry',
});

const fiberAdapter = createGoWebAdapter({
  stackId: 'fiber',
  adapterId: 'fiber-topology',
  displayName: 'Fiber Topology',
  entryPattern: /\bfiber\.New\s*\(/,
  routePattern:
    /\.(?:Get|Post|Put|Patch|Delete|Options|Head|All)\s*\([^,]+,\s*[A-Za-z_][A-Za-z0-9_]*\s*\)/,
  entryReason: 'fiber_entry_router',
  handlerReason: 'fiber_router_handler',
  configReason: 'gomod_fiber_entry',
});

const echoAdapter = createGoWebAdapter({
  stackId: 'echo',
  adapterId: 'echo-topology',
  displayName: 'Echo Topology',
  entryPattern: /\becho\.New\s*\(/,
  routePattern:
    /\.(?:GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD|Any)\s*\([^,]+,\s*[A-Za-z_][A-Za-z0-9_]*\s*\)/,
  entryReason: 'echo_entry_router',
  handlerReason: 'echo_router_handler',
  configReason: 'gomod_echo_entry',
});

const chiAdapter = createGoWebAdapter({
  stackId: 'chi',
  adapterId: 'chi-topology',
  displayName: 'Chi Topology',
  entryPattern: /\bchi\.NewRouter\s*\(/,
  routePattern:
    /\.(?:Get|Post|Put|Patch|Delete|Method|Handle|Mount)\s*\([^,]+,\s*[A-Za-z_][A-Za-z0-9_]*\s*\)/,
  entryReason: 'chi_entry_router',
  handlerReason: 'chi_router_handler',
  configReason: 'gomod_chi_entry',
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

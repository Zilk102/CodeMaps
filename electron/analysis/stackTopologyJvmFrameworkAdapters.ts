import {
  buildNamedSymbolToFileMap,
  createRelationship,
  extractJakartaRouteMethods,
  extractJvmFunctionNames,
  extractKtorRouteFunctions,
  extractMicronautRouteMethods,
  extractSpringBeanBindings,
  extractSpringRouteMethods,
  toRelativeList,
} from './stackTopologySupport';
import {
  classEndpoint,
  configEntryLinks,
  configFilesNamed,
  defineFrameworkAdapter,
  entryLinks,
  fileEndpoint,
  filesMatching,
  handlerLinks,
  JVM_BUILD_FILES,
  methodLinks,
  referenceLinks,
  SPRING_STYLE_CONFIG_FILES,
  symbolsOfFiles,
  type AdapterSources,
} from './stackTopologyAdapterKit';

const JVM_SOURCES = /\.(java|kt)$/i;

/** Controller -> service -> repository layering shared by Spring Boot and Micronaut. */
const layeredLinks = (
  sources: AdapterSources,
  layers: { controllers: string[]; services: string[]; repositories: string[] },
  prefix: string
) => {
  const serviceSymbols = symbolsOfFiles(sources, layers.services);
  const repositorySymbols = symbolsOfFiles(sources, layers.repositories);
  return {
    serviceSymbols,
    links: [
      ...referenceLinks(
        sources,
        layers.controllers,
        serviceSymbols,
        `${prefix}_controller_service`
      ),
      ...referenceLinks(
        sources,
        layers.services,
        repositorySymbols,
        `${prefix}_service_repository`
      ),
    ],
  };
};

/** `@Bean` methods of the application class and the service each one binds. */
const beanBindingLinks = (
  sources: AdapterSources,
  applications: string[],
  serviceSymbols: Map<string, string>
) =>
  applications.flatMap((entryFile) => {
    const entryText = sources.contentByRelativePath.get(entryFile) || '';
    const entryEndpoint = classEndpoint(sources, entryFile);

    return extractSpringBeanBindings(entryText).flatMap(
      ({ returnType, methodName, implementationType }) => {
        const methodEndpoint = fileEndpoint(sources, entryFile, methodName);
        const bindingTarget = implementationType || returnType;
        const matchingService = Array.from(serviceSymbols.entries()).find(
          ([symbol]) => symbol === bindingTarget
        );

        return [
          createRelationship(entryEndpoint, methodEndpoint, 'framework', 'springboot_bean_method'),
          ...(matchingService
            ? [
                createRelationship(
                  methodEndpoint,
                  fileEndpoint(sources, matchingService[1], bindingTarget),
                  'framework',
                  'springboot_bean_binding'
                ),
              ]
            : []),
        ];
      }
    );
  });

interface LayeredJvmSpec {
  id: string;
  displayName: string;
  stackId: string;
  /** Prefix of the relationship reasons, e.g. `springboot` -> `springboot_entry_controller`. */
  prefix: string;
  /** What the summary calls the entry files. */
  entryLabel: string;
  entry: RegExp;
  controllers: RegExp;
  services: RegExp;
  routeMethods: (text: string) => string[];
  /** Spring links the entry class to the controllers it scans; Micronaut links the file. */
  entryKind: 'file' | 'class';
  /** Extra links found from the application classes and the service symbols. */
  extraLinks?: (
    sources: AdapterSources,
    applications: string[],
    serviceSymbols: Map<string, string>
  ) => ReturnType<typeof referenceLinks>;
}

/** Entry class -> controllers -> services -> repositories, as in Spring Boot and Micronaut. */
const defineLayeredJvmAdapter = (spec: LayeredJvmSpec) =>
  defineFrameworkAdapter({
    id: spec.id,
    displayName: spec.displayName,
    stackId: spec.stackId,
    extensions: JVM_SOURCES,
    describe: (sources) => {
      const { context, entries } = sources;
      const entryFiles = filesMatching(entries, spec.entry);
      const controllers = filesMatching(entries, spec.controllers);
      const services = filesMatching(entries, spec.services);
      const repositories = filesMatching(entries, /@Repository\b/);
      const configs = configFilesNamed(context, SPRING_STYLE_CONFIG_FILES);
      const layers = layeredLinks(sources, { controllers, services, repositories }, spec.prefix);

      return {
        summary: `Detected ${entryFiles.length} ${spec.entryLabel}, ${controllers.length} controllers, ${services.length} services, and ${repositories.length} repositories.`,
        details: {
          entryFiles,
          configFiles: toRelativeList(context, configs),
          components: controllers,
          modules: [...services, ...repositories],
          relationships: [
            ...entryLinks(sources, entryFiles, controllers, `${spec.prefix}_entry_controller`, {
              entry: spec.entryKind,
              target: 'class',
            }),
            ...layers.links,
            ...methodLinks(
              sources,
              controllers,
              spec.routeMethods,
              `${spec.prefix}_controller_method`
            ),
            ...(spec.extraLinks?.(sources, entryFiles, layers.serviceSymbols) ?? []),
            ...configEntryLinks(sources, configs, entryFiles, `${spec.prefix}_config_entry`),
          ],
        },
      };
    },
  });

export const springBootAdapter = defineLayeredJvmAdapter({
  id: 'spring-boot-topology',
  displayName: 'Spring Boot Topology',
  stackId: 'spring-boot',
  prefix: 'springboot',
  entryLabel: 'application entrypoints',
  entry: /@SpringBootApplication\b/,
  controllers: /@(RestController|Controller)\b/,
  services: /@Service\b/,
  routeMethods: extractSpringRouteMethods,
  entryKind: 'class',
  extraLinks: beanBindingLinks,
});

export const ktorAdapter = defineFrameworkAdapter({
  id: 'ktor-topology',
  displayName: 'Ktor Topology',
  stackId: 'ktor',
  extensions: JVM_SOURCES,
  describe: (sources) => {
    const { context, entries } = sources;
    const functionSymbols = buildNamedSymbolToFileMap(entries, extractJvmFunctionNames);
    const entryFiles = filesMatching(
      entries,
      /\bembeddedServer\s*\(|\bEngineMain\b|fun\s+Application\.module\s*\(/
    );
    const routeFiles = filesMatching(
      entries,
      /\brouting\s*\{|\broute\s*\(|\b(?:get|post|put|patch|delete)\s*\(/
    );
    const configFiles = configFilesNamed(context, [
      ...JVM_BUILD_FILES,
      'src/main/resources/application.conf',
      'src/main/resources/application.yml',
      'src/main/resources/application.properties',
    ]);

    return {
      summary: `Detected ${entryFiles.length} Ktor entry files and ${routeFiles.length} route-bearing modules.`,
      details: {
        entryFiles,
        configFiles: toRelativeList(context, configFiles),
        routes: routeFiles,
        relationships: [
          ...entryLinks(sources, entryFiles, routeFiles, 'ktor_entry_routes'),
          ...handlerLinks(
            sources,
            routeFiles,
            extractKtorRouteFunctions,
            functionSymbols,
            'ktor_route_function'
          ),
          ...configEntryLinks(sources, configFiles, entryFiles, 'ktor_config_entry'),
        ],
      },
    };
  },
});

export const micronautAdapter = defineLayeredJvmAdapter({
  id: 'micronaut-topology',
  displayName: 'Micronaut Topology',
  stackId: 'micronaut',
  prefix: 'micronaut',
  entryLabel: 'Micronaut entry files',
  entry: /\bMicronaut\.run\s*\(/,
  controllers: /@Controller\b/,
  services: /@(Singleton|Service)\b/,
  routeMethods: extractMicronautRouteMethods,
  entryKind: 'file',
});

export const quarkusAdapter = defineFrameworkAdapter({
  id: 'quarkus-topology',
  displayName: 'Quarkus Topology',
  stackId: 'quarkus',
  extensions: JVM_SOURCES,
  describe: (sources) => {
    const { context, entries } = sources;
    const entryFiles = filesMatching(
      entries,
      /\bQuarkus\.run\s*\(|@QuarkusMain\b|\bimplements\s+QuarkusApplication\b/
    );
    const resources = filesMatching(entries, /@Path\s*\(/);
    const services = filesMatching(entries, /@(ApplicationScoped|Singleton)\b/);
    const configFiles = configFilesNamed(context, SPRING_STYLE_CONFIG_FILES);
    const serviceSymbols = symbolsOfFiles(sources, services);

    return {
      summary: `Detected ${entryFiles.length} Quarkus entry files, ${resources.length} REST resources, and ${services.length} scoped services.`,
      details: {
        entryFiles,
        configFiles: toRelativeList(context, configFiles),
        components: resources,
        modules: services,
        relationships: [
          ...entryLinks(sources, entryFiles, resources, 'quarkus_entry_resource', {
            target: 'class',
          }),
          ...referenceLinks(sources, resources, serviceSymbols, 'quarkus_resource_service'),
          ...methodLinks(sources, resources, extractJakartaRouteMethods, 'quarkus_resource_method'),
          ...configEntryLinks(sources, configFiles, entryFiles, 'quarkus_config_entry'),
        ],
      },
    };
  },
});

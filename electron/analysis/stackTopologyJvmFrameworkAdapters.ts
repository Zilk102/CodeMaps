import {
  buildGraphSymbolIndex,
  buildNamedSymbolToFileMap,
  buildSymbolToFileMap,
  createInsight,
  createRelationship,
  extractJakartaRouteMethods,
  extractJvmFunctionNames,
  extractKtorRouteFunctions,
  extractMicronautRouteMethods,
  extractSpringBeanBindings,
  extractSpringRouteMethods,
  findReferencedSymbolMatches,
  getContentByRelativePath,
  inferClassSymbolsForFile,
  resolveSymbolEndpoint,
  StackAdapter,
  toRelativeList,
} from './stackTopologySupport';

export const springBootAdapter: StackAdapter = {
  id: 'spring-boot-topology',
  displayName: 'Spring Boot Topology',
  category: 'framework',
  supports: (context) => !!context.getDetectedStack('spring-boot'),
  analyze: async (context) => {
    const graphSymbolIndex = buildGraphSymbolIndex(context.graph);
    const candidateFiles = context
      .getAllFilePaths()
      .filter((filePath) => /\.(java|kt)$/i.test(filePath));
    const contents = await context.readTexts(candidateFiles);
    const relativeContentEntries = contents.map((entry) => ({
      filePath: context.getProjectRelativePath(entry.filePath),
      text: entry.text,
    }));
    const contentByRelativePath = getContentByRelativePath(relativeContentEntries);

    const applications = relativeContentEntries
      .filter(({ text }) => /@SpringBootApplication\b/.test(text))
      .map(({ filePath }) => filePath);
    const controllers = relativeContentEntries
      .filter(({ text }) => /@(RestController|Controller)\b/.test(text))
      .map(({ filePath }) => filePath);
    const services = relativeContentEntries
      .filter(({ text }) => /@Service\b/.test(text))
      .map(({ filePath }) => filePath);
    const repositories = relativeContentEntries
      .filter(({ text }) => /@Repository\b/.test(text))
      .map(({ filePath }) => filePath);
    const configs = context
      .getAllFilePaths()
      .filter((filePath) =>
        [
          'pom.xml',
          'build.gradle',
          'build.gradle.kts',
          'src/main/resources/application.yml',
          'src/main/resources/application.properties',
        ].includes(context.getProjectRelativePath(filePath))
      );
    const serviceSymbols = buildSymbolToFileMap(
      relativeContentEntries.filter((entry) => services.includes(entry.filePath))
    );
    const repositorySymbols = buildSymbolToFileMap(
      relativeContentEntries.filter((entry) => repositories.includes(entry.filePath))
    );
    const controllerServiceLinks = controllers.flatMap((controllerFile) =>
      findReferencedSymbolMatches(contentByRelativePath.get(controllerFile) || '', serviceSymbols, [
        controllerFile,
      ]).map(({ filePath, symbol }) =>
        createRelationship(
          resolveSymbolEndpoint(controllerFile, graphSymbolIndex, {
            preferredSymbols: inferClassSymbolsForFile(
              contentByRelativePath.get(controllerFile) || ''
            ),
          }),
          resolveSymbolEndpoint(filePath, graphSymbolIndex, { preferredSymbols: [symbol] }),
          'framework',
          'springboot_controller_service'
        )
      )
    );
    const serviceRepositoryLinks = services.flatMap((serviceFile) =>
      findReferencedSymbolMatches(contentByRelativePath.get(serviceFile) || '', repositorySymbols, [
        serviceFile,
      ]).map(({ filePath, symbol }) =>
        createRelationship(
          resolveSymbolEndpoint(serviceFile, graphSymbolIndex, {
            preferredSymbols: inferClassSymbolsForFile(
              contentByRelativePath.get(serviceFile) || ''
            ),
          }),
          resolveSymbolEndpoint(filePath, graphSymbolIndex, { preferredSymbols: [symbol] }),
          'framework',
          'springboot_service_repository'
        )
      )
    );
    const controllerMethodLinks = controllers.flatMap((controllerFile) =>
      extractSpringRouteMethods(contentByRelativePath.get(controllerFile) || '').map((methodName) =>
        createRelationship(
          resolveSymbolEndpoint(controllerFile, graphSymbolIndex, {
            preferredSymbols: inferClassSymbolsForFile(
              contentByRelativePath.get(controllerFile) || ''
            ),
          }),
          resolveSymbolEndpoint(controllerFile, graphSymbolIndex, {
            preferredSymbols: [methodName],
          }),
          'framework',
          'springboot_controller_method'
        )
      )
    );
    const beanBindingLinks = applications.flatMap((entryFile) => {
      const entryText = contentByRelativePath.get(entryFile) || '';
      const entryEndpoint = resolveSymbolEndpoint(entryFile, graphSymbolIndex, {
        preferredSymbols: inferClassSymbolsForFile(entryText),
      });

      return extractSpringBeanBindings(entryText).flatMap(
        ({ returnType, methodName, implementationType }) => {
          const methodEndpoint = resolveSymbolEndpoint(entryFile, graphSymbolIndex, {
            preferredSymbols: [methodName],
          });
          const bindingTarget = implementationType || returnType;
          const matchingService = Array.from(serviceSymbols.entries()).find(
            ([symbol]) => symbol === bindingTarget
          );

          return [
            createRelationship(
              entryEndpoint,
              methodEndpoint,
              'framework',
              'springboot_bean_method'
            ),
            ...(matchingService
              ? [
                  createRelationship(
                    methodEndpoint,
                    resolveSymbolEndpoint(matchingService[1], graphSymbolIndex, {
                      preferredSymbols: [bindingTarget],
                    }),
                    'framework',
                    'springboot_bean_binding'
                  ),
                ]
              : []),
          ];
        }
      );
    });

    return createInsight(
      springBootAdapter.id,
      springBootAdapter.displayName,
      springBootAdapter.category,
      `Detected ${applications.length} application entrypoints, ${controllers.length} controllers, ${services.length} services, and ${repositories.length} repositories.`,
      {
        evidence: context.getDetectedStack('spring-boot')?.evidence || [],
        entryFiles: applications,
        configFiles: toRelativeList(context, configs),
        components: controllers,
        modules: [...services, ...repositories],
        relationships: [
          ...applications.flatMap((entryFile) =>
            controllers.map((controllerFile) =>
              createRelationship(
                resolveSymbolEndpoint(entryFile, graphSymbolIndex, {
                  preferredSymbols: inferClassSymbolsForFile(
                    contentByRelativePath.get(entryFile) || ''
                  ),
                }),
                resolveSymbolEndpoint(controllerFile, graphSymbolIndex, {
                  preferredSymbols: inferClassSymbolsForFile(
                    contentByRelativePath.get(controllerFile) || ''
                  ),
                }),
                'framework',
                'springboot_entry_controller'
              )
            )
          ),
          ...controllerServiceLinks,
          ...serviceRepositoryLinks,
          ...controllerMethodLinks,
          ...beanBindingLinks,
          ...configs.flatMap((configFile) =>
            applications.map((entryFile) => ({
              source: context.getProjectRelativePath(configFile),
              target: resolveSymbolEndpoint(entryFile, graphSymbolIndex),
              type: 'build' as const,
              reason: 'springboot_config_entry',
            }))
          ),
        ],
      }
    );
  },
};

export const ktorAdapter: StackAdapter = {
  id: 'ktor-topology',
  displayName: 'Ktor Topology',
  category: 'framework',
  supports: (context) => !!context.getDetectedStack('ktor'),
  analyze: async (context) => {
    const graphSymbolIndex = buildGraphSymbolIndex(context.graph);
    const candidateFiles = context
      .getAllFilePaths()
      .filter((filePath) => /\.(kt|java)$/i.test(filePath));
    const contents = await context.readTexts(candidateFiles);
    const relativeContentEntries = contents.map((entry) => ({
      filePath: context.getProjectRelativePath(entry.filePath),
      text: entry.text,
    }));
    const contentByRelativePath = getContentByRelativePath(relativeContentEntries);
    const functionSymbols = buildNamedSymbolToFileMap(
      relativeContentEntries,
      extractJvmFunctionNames
    );

    const entryFiles = relativeContentEntries
      .filter(({ text }) =>
        /\bembeddedServer\s*\(|\bEngineMain\b|fun\s+Application\.module\s*\(/.test(text)
      )
      .map(({ filePath }) => filePath);
    const routeFiles = relativeContentEntries
      .filter(({ text }) =>
        /\brouting\s*\{|\broute\s*\(|\b(?:get|post|put|patch|delete)\s*\(/.test(text)
      )
      .map(({ filePath }) => filePath);
    const configFiles = context
      .getAllFilePaths()
      .filter((filePath) =>
        [
          'pom.xml',
          'build.gradle',
          'build.gradle.kts',
          'src/main/resources/application.conf',
          'src/main/resources/application.yml',
          'src/main/resources/application.properties',
        ].includes(context.getProjectRelativePath(filePath))
      );

    const routeFunctionLinks = routeFiles.flatMap((routeFile) =>
      extractKtorRouteFunctions(contentByRelativePath.get(routeFile) || '')
        .map((functionName) => ({
          functionName,
          filePath: functionSymbols.get(functionName) || routeFile,
        }))
        .map(({ functionName, filePath }) =>
          createRelationship(
            resolveSymbolEndpoint(routeFile, graphSymbolIndex),
            resolveSymbolEndpoint(filePath, graphSymbolIndex, { preferredSymbols: [functionName] }),
            'framework',
            'ktor_route_function'
          )
        )
    );

    return createInsight(
      ktorAdapter.id,
      ktorAdapter.displayName,
      ktorAdapter.category,
      `Detected ${entryFiles.length} Ktor entry files and ${routeFiles.length} route-bearing modules.`,
      {
        evidence: context.getDetectedStack('ktor')?.evidence || [],
        entryFiles,
        configFiles: toRelativeList(context, configFiles),
        routes: routeFiles,
        relationships: [
          ...entryFiles.flatMap((entryFile) =>
            routeFiles.map((routeFile) =>
              createRelationship(
                resolveSymbolEndpoint(entryFile, graphSymbolIndex),
                resolveSymbolEndpoint(routeFile, graphSymbolIndex),
                'framework',
                'ktor_entry_routes'
              )
            )
          ),
          ...routeFunctionLinks,
          ...configFiles.flatMap((configFile) =>
            entryFiles.map((entryFile) => ({
              source: context.getProjectRelativePath(configFile),
              target: resolveSymbolEndpoint(entryFile, graphSymbolIndex),
              type: 'build' as const,
              reason: 'ktor_config_entry',
            }))
          ),
        ],
      }
    );
  },
};

export const micronautAdapter: StackAdapter = {
  id: 'micronaut-topology',
  displayName: 'Micronaut Topology',
  category: 'framework',
  supports: (context) => !!context.getDetectedStack('micronaut'),
  analyze: async (context) => {
    const graphSymbolIndex = buildGraphSymbolIndex(context.graph);
    const candidateFiles = context
      .getAllFilePaths()
      .filter((filePath) => /\.(java|kt)$/i.test(filePath));
    const contents = await context.readTexts(candidateFiles);
    const relativeContentEntries = contents.map((entry) => ({
      filePath: context.getProjectRelativePath(entry.filePath),
      text: entry.text,
    }));
    const contentByRelativePath = getContentByRelativePath(relativeContentEntries);

    const entryFiles = relativeContentEntries
      .filter(({ text }) => /\bMicronaut\.run\s*\(/.test(text))
      .map(({ filePath }) => filePath);
    const controllers = relativeContentEntries
      .filter(({ text }) => /@Controller\b/.test(text))
      .map(({ filePath }) => filePath);
    const services = relativeContentEntries
      .filter(({ text }) => /@(Singleton|Service)\b/.test(text))
      .map(({ filePath }) => filePath);
    const repositories = relativeContentEntries
      .filter(({ text }) => /@Repository\b/.test(text))
      .map(({ filePath }) => filePath);
    const configFiles = context
      .getAllFilePaths()
      .filter((filePath) =>
        [
          'pom.xml',
          'build.gradle',
          'build.gradle.kts',
          'src/main/resources/application.yml',
          'src/main/resources/application.properties',
        ].includes(context.getProjectRelativePath(filePath))
      );

    const serviceSymbols = buildSymbolToFileMap(
      relativeContentEntries.filter((entry) => services.includes(entry.filePath))
    );
    const repositorySymbols = buildSymbolToFileMap(
      relativeContentEntries.filter((entry) => repositories.includes(entry.filePath))
    );

    const controllerServiceLinks = controllers.flatMap((controllerFile) =>
      findReferencedSymbolMatches(contentByRelativePath.get(controllerFile) || '', serviceSymbols, [
        controllerFile,
      ]).map(({ filePath, symbol }) =>
        createRelationship(
          resolveSymbolEndpoint(controllerFile, graphSymbolIndex, {
            preferredSymbols: inferClassSymbolsForFile(
              contentByRelativePath.get(controllerFile) || ''
            ),
          }),
          resolveSymbolEndpoint(filePath, graphSymbolIndex, { preferredSymbols: [symbol] }),
          'framework',
          'micronaut_controller_service'
        )
      )
    );

    const serviceRepositoryLinks = services.flatMap((serviceFile) =>
      findReferencedSymbolMatches(contentByRelativePath.get(serviceFile) || '', repositorySymbols, [
        serviceFile,
      ]).map(({ filePath, symbol }) =>
        createRelationship(
          resolveSymbolEndpoint(serviceFile, graphSymbolIndex, {
            preferredSymbols: inferClassSymbolsForFile(
              contentByRelativePath.get(serviceFile) || ''
            ),
          }),
          resolveSymbolEndpoint(filePath, graphSymbolIndex, { preferredSymbols: [symbol] }),
          'framework',
          'micronaut_service_repository'
        )
      )
    );

    const controllerMethodLinks = controllers.flatMap((controllerFile) =>
      extractMicronautRouteMethods(contentByRelativePath.get(controllerFile) || '').map(
        (methodName) =>
          createRelationship(
            resolveSymbolEndpoint(controllerFile, graphSymbolIndex, {
              preferredSymbols: inferClassSymbolsForFile(
                contentByRelativePath.get(controllerFile) || ''
              ),
            }),
            resolveSymbolEndpoint(controllerFile, graphSymbolIndex, {
              preferredSymbols: [methodName],
            }),
            'framework',
            'micronaut_controller_method'
          )
      )
    );

    return createInsight(
      micronautAdapter.id,
      micronautAdapter.displayName,
      micronautAdapter.category,
      `Detected ${entryFiles.length} Micronaut entry files, ${controllers.length} controllers, ${services.length} services, and ${repositories.length} repositories.`,
      {
        evidence: context.getDetectedStack('micronaut')?.evidence || [],
        entryFiles,
        configFiles: toRelativeList(context, configFiles),
        components: controllers,
        modules: [...services, ...repositories],
        relationships: [
          ...entryFiles.flatMap((entryFile) =>
            controllers.map((controllerFile) =>
              createRelationship(
                resolveSymbolEndpoint(entryFile, graphSymbolIndex),
                resolveSymbolEndpoint(controllerFile, graphSymbolIndex, {
                  preferredSymbols: inferClassSymbolsForFile(
                    contentByRelativePath.get(controllerFile) || ''
                  ),
                }),
                'framework',
                'micronaut_entry_controller'
              )
            )
          ),
          ...controllerServiceLinks,
          ...serviceRepositoryLinks,
          ...controllerMethodLinks,
          ...configFiles.flatMap((configFile) =>
            entryFiles.map((entryFile) => ({
              source: context.getProjectRelativePath(configFile),
              target: resolveSymbolEndpoint(entryFile, graphSymbolIndex),
              type: 'build' as const,
              reason: 'micronaut_config_entry',
            }))
          ),
        ],
      }
    );
  },
};

export const quarkusAdapter: StackAdapter = {
  id: 'quarkus-topology',
  displayName: 'Quarkus Topology',
  category: 'framework',
  supports: (context) => !!context.getDetectedStack('quarkus'),
  analyze: async (context) => {
    const graphSymbolIndex = buildGraphSymbolIndex(context.graph);
    const candidateFiles = context
      .getAllFilePaths()
      .filter((filePath) => /\.(java|kt)$/i.test(filePath));
    const contents = await context.readTexts(candidateFiles);
    const relativeContentEntries = contents.map((entry) => ({
      filePath: context.getProjectRelativePath(entry.filePath),
      text: entry.text,
    }));
    const contentByRelativePath = getContentByRelativePath(relativeContentEntries);

    const entryFiles = relativeContentEntries
      .filter(({ text }) =>
        /\bQuarkus\.run\s*\(|@QuarkusMain\b|\bimplements\s+QuarkusApplication\b/.test(text)
      )
      .map(({ filePath }) => filePath);
    const resources = relativeContentEntries
      .filter(({ text }) => /@Path\s*\(/.test(text))
      .map(({ filePath }) => filePath);
    const services = relativeContentEntries
      .filter(({ text }) => /@(ApplicationScoped|Singleton)\b/.test(text))
      .map(({ filePath }) => filePath);
    const configFiles = context
      .getAllFilePaths()
      .filter((filePath) =>
        [
          'pom.xml',
          'build.gradle',
          'build.gradle.kts',
          'src/main/resources/application.yml',
          'src/main/resources/application.properties',
        ].includes(context.getProjectRelativePath(filePath))
      );

    const serviceSymbols = buildSymbolToFileMap(
      relativeContentEntries.filter((entry) => services.includes(entry.filePath))
    );

    const resourceServiceLinks = resources.flatMap((resourceFile) =>
      findReferencedSymbolMatches(contentByRelativePath.get(resourceFile) || '', serviceSymbols, [
        resourceFile,
      ]).map(({ filePath, symbol }) =>
        createRelationship(
          resolveSymbolEndpoint(resourceFile, graphSymbolIndex, {
            preferredSymbols: inferClassSymbolsForFile(
              contentByRelativePath.get(resourceFile) || ''
            ),
          }),
          resolveSymbolEndpoint(filePath, graphSymbolIndex, { preferredSymbols: [symbol] }),
          'framework',
          'quarkus_resource_service'
        )
      )
    );

    const resourceMethodLinks = resources.flatMap((resourceFile) =>
      extractJakartaRouteMethods(contentByRelativePath.get(resourceFile) || '').map((methodName) =>
        createRelationship(
          resolveSymbolEndpoint(resourceFile, graphSymbolIndex, {
            preferredSymbols: inferClassSymbolsForFile(
              contentByRelativePath.get(resourceFile) || ''
            ),
          }),
          resolveSymbolEndpoint(resourceFile, graphSymbolIndex, { preferredSymbols: [methodName] }),
          'framework',
          'quarkus_resource_method'
        )
      )
    );

    return createInsight(
      quarkusAdapter.id,
      quarkusAdapter.displayName,
      quarkusAdapter.category,
      `Detected ${entryFiles.length} Quarkus entry files, ${resources.length} REST resources, and ${services.length} scoped services.`,
      {
        evidence: context.getDetectedStack('quarkus')?.evidence || [],
        entryFiles,
        configFiles: toRelativeList(context, configFiles),
        components: resources,
        modules: services,
        relationships: [
          ...entryFiles.flatMap((entryFile) =>
            resources.map((resourceFile) =>
              createRelationship(
                resolveSymbolEndpoint(entryFile, graphSymbolIndex),
                resolveSymbolEndpoint(resourceFile, graphSymbolIndex, {
                  preferredSymbols: inferClassSymbolsForFile(
                    contentByRelativePath.get(resourceFile) || ''
                  ),
                }),
                'framework',
                'quarkus_entry_resource'
              )
            )
          ),
          ...resourceServiceLinks,
          ...resourceMethodLinks,
          ...configFiles.flatMap((configFile) =>
            entryFiles.map((entryFile) => ({
              source: context.getProjectRelativePath(configFile),
              target: resolveSymbolEndpoint(entryFile, graphSymbolIndex),
              type: 'build' as const,
              reason: 'quarkus_config_entry',
            }))
          ),
        ],
      }
    );
  },
};

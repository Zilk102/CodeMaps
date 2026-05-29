export * from './stackTopologySupport';

import {
  basename,
  buildGraphSymbolIndex,
  buildNamedSymbolToFileMap,
  buildSymbolToFileMap,
  createInsight,
  createRelationship,
  extractAspNetRouteMethods,
  extractAspNetServiceRegistrations,
  extractJakartaRouteMethods,
  extractJvmFunctionNames,
  extractKtorRouteFunctions,
  extractMicronautRouteMethods,
  extractNestProviderBindings,
  extractNestRouteMethods,
  extractSpringBeanBindings,
  extractSpringRouteMethods,
  findReferencedSymbolMatches,
  getContentByRelativePath,
  getNearestNextLayouts,
  inferClassSymbolsForFile,
  resolveSymbolEndpoint,
  StackAdapter,
  toRelativeList
} from './stackTopologySupport';
import { POLYGLOT_FRAMEWORK_STACK_ADAPTERS } from './stackTopologyPolyglotFrameworkAdapters';

const nextJsAdapter: StackAdapter = {
  id: 'nextjs-topology',
  displayName: 'Next.js Topology',
  category: 'framework',
  supports: (context) => !!context.getDetectedStack('nextjs'),
  analyze: async (context) => {
    const graphSymbolIndex = buildGraphSymbolIndex(context.graph);
    const routeFiles = [
      ...context.findByRelativePrefix('app/').filter((filePath) =>
        /(?:^|\/)(page|layout|route)\.(tsx|ts|jsx|js)$/i.test(context.getProjectRelativePath(filePath))
      ),
      ...context.findByRelativePrefix('pages/').filter((filePath) =>
        /\.(tsx|ts|jsx|js)$/i.test(filePath)
      ),
    ];
    const apiRoutes = routeFiles
      .map((filePath) => context.getProjectRelativePath(filePath))
      .filter((relativePath) => relativePath.includes('/api/') || /\/route\.(tsx|ts|jsx|js)$/i.test(relativePath));
    const configFiles = context
      .getAllFilePaths()
      .filter((filePath) =>
        ['next.config.js', 'next.config.mjs', 'next.config.ts'].includes(
          context.getProjectRelativePath(filePath)
        )
      );
    const entryFiles = context
      .getAllFilePaths()
      .filter((filePath) =>
        [
          'app/layout.tsx',
          'app/layout.ts',
          'pages/_app.tsx',
          'pages/_app.ts',
          'pages/_document.tsx',
          'pages/_document.ts',
        ].includes(context.getProjectRelativePath(filePath))
      );
    const routePaths = routeFiles.map((filePath) => context.getProjectRelativePath(filePath));
    const layoutPaths = new Set(
      routePaths.filter((relativePath) => /(?:^|\/)layout\.(tsx|ts|jsx|js)$/i.test(relativePath))
    );
    const semanticRouteRelationships = routePaths.flatMap((relativePath) => {
      const nearestLayouts = getNearestNextLayouts(relativePath, layoutPaths).filter(
        (layoutPath) => layoutPath !== relativePath
      );
      const routeTarget = resolveSymbolEndpoint(relativePath, graphSymbolIndex);

      if (nearestLayouts.length > 0) {
        return nearestLayouts.map((layoutPath) =>
          createRelationship(
            resolveSymbolEndpoint(layoutPath, graphSymbolIndex),
            routeTarget,
            'framework',
            'nextjs_layout_route'
          )
        );
      }

      if (/\/page\.(tsx|ts|jsx|js)$/i.test(relativePath)) {
        return entryFiles.map((entryFile) =>
          createRelationship(
            resolveSymbolEndpoint(context.getProjectRelativePath(entryFile), graphSymbolIndex),
            routeTarget,
            'framework',
            'nextjs_route_handler'
          )
        );
      }

      return [];
    });

    return createInsight(
      nextJsAdapter.id,
      nextJsAdapter.displayName,
      nextJsAdapter.category,
      `Detected ${routeFiles.length} route-related files and ${apiRoutes.length} API route candidates in Next.js structure.`,
      {
        evidence: context.getDetectedStack('nextjs')?.evidence || [],
        routes: routePaths,
        modules: apiRoutes,
        entryFiles: toRelativeList(context, entryFiles),
        configFiles: toRelativeList(context, configFiles),
        relationships: [
          ...entryFiles.flatMap((entryFile) =>
            routeFiles.map((routeFile) =>
              createRelationship(
                resolveSymbolEndpoint(context.getProjectRelativePath(entryFile), graphSymbolIndex),
                resolveSymbolEndpoint(context.getProjectRelativePath(routeFile), graphSymbolIndex),
                'framework',
                'nextjs_entry_route'
              )
            )
          ),
          ...configFiles.flatMap((configFile) =>
            entryFiles.map((entryFile) => ({
              source: context.getProjectRelativePath(configFile),
              target: resolveSymbolEndpoint(context.getProjectRelativePath(entryFile), graphSymbolIndex),
              type: 'build' as const,
              reason: 'nextjs_config_entry',
            }))
          ),
          ...routePaths
            .filter((relativePath) => /\/route\.(tsx|ts|jsx|js)$/i.test(relativePath))
            .map((relativePath) =>
              createRelationship(
                entryFiles[0]
                  ? resolveSymbolEndpoint(context.getProjectRelativePath(entryFiles[0]), graphSymbolIndex)
                  : relativePath,
                resolveSymbolEndpoint(relativePath, graphSymbolIndex, {
                  preferredSymbols: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
                }),
                'framework',
                'nextjs_api_route_handler'
              )
            ),
          ...semanticRouteRelationships,
        ].filter((relationship) => relationship.source !== relationship.target),
      }
    );
  },
};

const nestJsAdapter: StackAdapter = {
  id: 'nestjs-topology',
  displayName: 'NestJS Topology',
  category: 'framework',
  supports: (context) => !!context.getDetectedStack('nestjs'),
  analyze: async (context) => {
    const graphSymbolIndex = buildGraphSymbolIndex(context.graph);
    const candidateFiles = context
      .getAllFilePaths()
      .filter((filePath) => /\.(ts|tsx|js|jsx)$/i.test(filePath));
    const contents = await context.readTexts(candidateFiles);
    const relativeContentEntries = contents.map((entry) => ({
      filePath: context.getProjectRelativePath(entry.filePath),
      text: entry.text,
    }));
    const contentByRelativePath = getContentByRelativePath(relativeContentEntries);

    const modules = relativeContentEntries
      .filter(({ text }) => /@Module\s*\(/.test(text))
      .map(({ filePath }) => filePath);
    const controllers = relativeContentEntries
      .filter(({ text }) => /@Controller\s*\(/.test(text))
      .map(({ filePath }) => filePath);
    const providers = relativeContentEntries
      .filter(({ text }) => /@Injectable\s*\(/.test(text))
      .map(({ filePath }) => filePath);
    const entryFiles = candidateFiles
      .filter((filePath) => ['main.ts', 'main.js'].includes(basename(filePath)))
      .map((filePath) => context.getProjectRelativePath(filePath));
    const controllerSymbols = buildSymbolToFileMap(
      relativeContentEntries.filter((entry) => controllers.includes(entry.filePath))
    );
    const providerSymbols = buildSymbolToFileMap(
      relativeContentEntries.filter((entry) => providers.includes(entry.filePath))
    );
    const moduleSymbols = buildSymbolToFileMap(
      relativeContentEntries.filter((entry) => modules.includes(entry.filePath))
    );
    const controllerProviderLinks = controllers.flatMap((controllerFile) =>
      findReferencedSymbolMatches(
        contentByRelativePath.get(controllerFile) || '',
        providerSymbols,
        [controllerFile]
      ).map(({ filePath, symbol }) =>
        createRelationship(
          resolveSymbolEndpoint(controllerFile, graphSymbolIndex, {
            preferredSymbols: inferClassSymbolsForFile(contentByRelativePath.get(controllerFile) || ''),
          }),
          resolveSymbolEndpoint(filePath, graphSymbolIndex, { preferredSymbols: [symbol] }),
          'framework',
          'nestjs_controller_provider'
        )
      )
    );
    const moduleSemanticLinks = modules.flatMap((moduleFile) => {
      const moduleText = contentByRelativePath.get(moduleFile) || '';
      return [
        ...findReferencedSymbolMatches(moduleText, controllerSymbols, [moduleFile]).map(
          ({ filePath, symbol }) =>
            createRelationship(
              resolveSymbolEndpoint(moduleFile, graphSymbolIndex, {
                preferredSymbols: inferClassSymbolsForFile(moduleText),
              }),
              resolveSymbolEndpoint(filePath, graphSymbolIndex, { preferredSymbols: [symbol] }),
              'framework',
              'nestjs_module_controller'
            )
        ),
        ...findReferencedSymbolMatches(moduleText, providerSymbols, [moduleFile]).map(
          ({ filePath, symbol }) =>
            createRelationship(
              resolveSymbolEndpoint(moduleFile, graphSymbolIndex, {
                preferredSymbols: inferClassSymbolsForFile(moduleText),
              }),
              resolveSymbolEndpoint(filePath, graphSymbolIndex, { preferredSymbols: [symbol] }),
              'framework',
              'nestjs_module_provider'
            )
        ),
        ...findReferencedSymbolMatches(moduleText, moduleSymbols, [moduleFile]).map(
          ({ filePath, symbol }) =>
            createRelationship(
              resolveSymbolEndpoint(moduleFile, graphSymbolIndex, {
                preferredSymbols: inferClassSymbolsForFile(moduleText),
              }),
              resolveSymbolEndpoint(filePath, graphSymbolIndex, { preferredSymbols: [symbol] }),
              'framework',
              'nestjs_module_import'
            )
        ),
      ];
    });
    const controllerMethodLinks = controllers.flatMap((controllerFile) =>
      extractNestRouteMethods(contentByRelativePath.get(controllerFile) || '').map((methodName) =>
        createRelationship(
          resolveSymbolEndpoint(controllerFile, graphSymbolIndex, {
            preferredSymbols: inferClassSymbolsForFile(contentByRelativePath.get(controllerFile) || ''),
          }),
          resolveSymbolEndpoint(controllerFile, graphSymbolIndex, { preferredSymbols: [methodName] }),
          'framework',
          'nestjs_controller_method'
        )
      )
    );
    const providerBindingLinks = modules.flatMap((moduleFile) => {
      const moduleText = contentByRelativePath.get(moduleFile) || '';
      const moduleEndpoint = resolveSymbolEndpoint(moduleFile, graphSymbolIndex, {
        preferredSymbols: inferClassSymbolsForFile(moduleText),
      });

      return extractNestProviderBindings(moduleText).flatMap(({ implementation }) =>
        Array.from(providerSymbols.entries())
          .filter(([symbol]) => symbol === implementation)
          .map(([, filePath]) =>
            createRelationship(
              moduleEndpoint,
              resolveSymbolEndpoint(filePath, graphSymbolIndex, { preferredSymbols: [implementation] }),
              'framework',
              'nestjs_provider_binding'
            )
          )
      );
    });

    return createInsight(
      nestJsAdapter.id,
      nestJsAdapter.displayName,
      nestJsAdapter.category,
      `Detected ${modules.length} Nest modules, ${controllers.length} controllers, and ${providers.length} injectable providers.`,
      {
        evidence: context.getDetectedStack('nestjs')?.evidence || [],
        entryFiles,
        components: controllers,
        modules: [...modules, ...providers],
        relationships: [
          ...entryFiles.flatMap((entryFile) =>
            modules.map((moduleFile) =>
              createRelationship(
                entryFile,
                resolveSymbolEndpoint(moduleFile, graphSymbolIndex, {
                  preferredSymbols: inferClassSymbolsForFile(contentByRelativePath.get(moduleFile) || ''),
                }),
                'framework',
                'nestjs_entry_module'
              )
            )
          ),
          ...moduleSemanticLinks,
          ...controllerProviderLinks,
          ...controllerMethodLinks,
          ...providerBindingLinks,
        ],
      }
    );
  },
};

const springBootAdapter: StackAdapter = {
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
        ['pom.xml', 'build.gradle', 'build.gradle.kts', 'src/main/resources/application.yml', 'src/main/resources/application.properties'].includes(
          context.getProjectRelativePath(filePath)
        )
      );
    const serviceSymbols = buildSymbolToFileMap(
      relativeContentEntries.filter((entry) => services.includes(entry.filePath))
    );
    const repositorySymbols = buildSymbolToFileMap(
      relativeContentEntries.filter((entry) => repositories.includes(entry.filePath))
    );
    const controllerServiceLinks = controllers.flatMap((controllerFile) =>
      findReferencedSymbolMatches(
        contentByRelativePath.get(controllerFile) || '',
        serviceSymbols,
        [controllerFile]
      ).map(({ filePath, symbol }) =>
        createRelationship(
          resolveSymbolEndpoint(controllerFile, graphSymbolIndex, {
            preferredSymbols: inferClassSymbolsForFile(contentByRelativePath.get(controllerFile) || ''),
          }),
          resolveSymbolEndpoint(filePath, graphSymbolIndex, { preferredSymbols: [symbol] }),
          'framework',
          'springboot_controller_service'
        )
      )
    );
    const serviceRepositoryLinks = services.flatMap((serviceFile) =>
      findReferencedSymbolMatches(
        contentByRelativePath.get(serviceFile) || '',
        repositorySymbols,
        [serviceFile]
      ).map(({ filePath, symbol }) =>
        createRelationship(
          resolveSymbolEndpoint(serviceFile, graphSymbolIndex, {
            preferredSymbols: inferClassSymbolsForFile(contentByRelativePath.get(serviceFile) || ''),
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
            preferredSymbols: inferClassSymbolsForFile(contentByRelativePath.get(controllerFile) || ''),
          }),
          resolveSymbolEndpoint(controllerFile, graphSymbolIndex, { preferredSymbols: [methodName] }),
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

      return extractSpringBeanBindings(entryText).flatMap(({ returnType, methodName, implementationType }) => {
        const methodEndpoint = resolveSymbolEndpoint(entryFile, graphSymbolIndex, {
          preferredSymbols: [methodName],
        });
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
                  resolveSymbolEndpoint(matchingService[1], graphSymbolIndex, {
                    preferredSymbols: [bindingTarget],
                  }),
                  'framework',
                  'springboot_bean_binding'
                ),
              ]
            : []),
        ];
      });
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
                  preferredSymbols: inferClassSymbolsForFile(contentByRelativePath.get(entryFile) || ''),
                }),
                resolveSymbolEndpoint(controllerFile, graphSymbolIndex, {
                  preferredSymbols: inferClassSymbolsForFile(contentByRelativePath.get(controllerFile) || ''),
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

const ktorAdapter: StackAdapter = {
  id: 'ktor-topology',
  displayName: 'Ktor Topology',
  category: 'framework',
  supports: (context) => !!context.getDetectedStack('ktor'),
  analyze: async (context) => {
    const graphSymbolIndex = buildGraphSymbolIndex(context.graph);
    const candidateFiles = context.getAllFilePaths().filter((filePath) => /\.(kt|java)$/i.test(filePath));
    const contents = await context.readTexts(candidateFiles);
    const relativeContentEntries = contents.map((entry) => ({
      filePath: context.getProjectRelativePath(entry.filePath),
      text: entry.text,
    }));
    const contentByRelativePath = getContentByRelativePath(relativeContentEntries);
    const functionSymbols = buildNamedSymbolToFileMap(relativeContentEntries, extractJvmFunctionNames);

    const entryFiles = relativeContentEntries
      .filter(({ text }) => /\bembeddedServer\s*\(|\bEngineMain\b|fun\s+Application\.module\s*\(/.test(text))
      .map(({ filePath }) => filePath);
    const routeFiles = relativeContentEntries
      .filter(({ text }) => /\brouting\s*\{|\broute\s*\(|\b(?:get|post|put|patch|delete)\s*\(/.test(text))
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
        .map((functionName) => ({ functionName, filePath: functionSymbols.get(functionName) || routeFile }))
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

const micronautAdapter: StackAdapter = {
  id: 'micronaut-topology',
  displayName: 'Micronaut Topology',
  category: 'framework',
  supports: (context) => !!context.getDetectedStack('micronaut'),
  analyze: async (context) => {
    const graphSymbolIndex = buildGraphSymbolIndex(context.graph);
    const candidateFiles = context.getAllFilePaths().filter((filePath) => /\.(java|kt)$/i.test(filePath));
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
      findReferencedSymbolMatches(contentByRelativePath.get(controllerFile) || '', serviceSymbols, [controllerFile]).map(
        ({ filePath, symbol }) =>
          createRelationship(
            resolveSymbolEndpoint(controllerFile, graphSymbolIndex, {
              preferredSymbols: inferClassSymbolsForFile(contentByRelativePath.get(controllerFile) || ''),
            }),
            resolveSymbolEndpoint(filePath, graphSymbolIndex, { preferredSymbols: [symbol] }),
            'framework',
            'micronaut_controller_service'
          )
      )
    );

    const serviceRepositoryLinks = services.flatMap((serviceFile) =>
      findReferencedSymbolMatches(contentByRelativePath.get(serviceFile) || '', repositorySymbols, [serviceFile]).map(
        ({ filePath, symbol }) =>
          createRelationship(
            resolveSymbolEndpoint(serviceFile, graphSymbolIndex, {
              preferredSymbols: inferClassSymbolsForFile(contentByRelativePath.get(serviceFile) || ''),
            }),
            resolveSymbolEndpoint(filePath, graphSymbolIndex, { preferredSymbols: [symbol] }),
            'framework',
            'micronaut_service_repository'
          )
      )
    );

    const controllerMethodLinks = controllers.flatMap((controllerFile) =>
      extractMicronautRouteMethods(contentByRelativePath.get(controllerFile) || '').map((methodName) =>
        createRelationship(
          resolveSymbolEndpoint(controllerFile, graphSymbolIndex, {
            preferredSymbols: inferClassSymbolsForFile(contentByRelativePath.get(controllerFile) || ''),
          }),
          resolveSymbolEndpoint(controllerFile, graphSymbolIndex, { preferredSymbols: [methodName] }),
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
                  preferredSymbols: inferClassSymbolsForFile(contentByRelativePath.get(controllerFile) || ''),
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

const quarkusAdapter: StackAdapter = {
  id: 'quarkus-topology',
  displayName: 'Quarkus Topology',
  category: 'framework',
  supports: (context) => !!context.getDetectedStack('quarkus'),
  analyze: async (context) => {
    const graphSymbolIndex = buildGraphSymbolIndex(context.graph);
    const candidateFiles = context.getAllFilePaths().filter((filePath) => /\.(java|kt)$/i.test(filePath));
    const contents = await context.readTexts(candidateFiles);
    const relativeContentEntries = contents.map((entry) => ({
      filePath: context.getProjectRelativePath(entry.filePath),
      text: entry.text,
    }));
    const contentByRelativePath = getContentByRelativePath(relativeContentEntries);

    const entryFiles = relativeContentEntries
      .filter(({ text }) => /\bQuarkus\.run\s*\(|@QuarkusMain\b|\bimplements\s+QuarkusApplication\b/.test(text))
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
      findReferencedSymbolMatches(contentByRelativePath.get(resourceFile) || '', serviceSymbols, [resourceFile]).map(
        ({ filePath, symbol }) =>
          createRelationship(
            resolveSymbolEndpoint(resourceFile, graphSymbolIndex, {
              preferredSymbols: inferClassSymbolsForFile(contentByRelativePath.get(resourceFile) || ''),
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
            preferredSymbols: inferClassSymbolsForFile(contentByRelativePath.get(resourceFile) || ''),
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
                  preferredSymbols: inferClassSymbolsForFile(contentByRelativePath.get(resourceFile) || ''),
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

const aspNetAdapter: StackAdapter = {
  id: 'aspnet-core-topology',
  displayName: 'ASP.NET Core Topology',
  category: 'framework',
  supports: (context) => !!context.getDetectedStack('aspnet-core'),
  analyze: async (context) => {
    const graphSymbolIndex = buildGraphSymbolIndex(context.graph);
    const candidateFiles = context
      .getAllFilePaths()
      .filter((filePath) => /\.(cs)$/i.test(filePath));
    const contents = await context.readTexts(candidateFiles);
    const relativeContentEntries = contents.map((entry) => ({
      filePath: context.getProjectRelativePath(entry.filePath),
      text: entry.text,
    }));
    const contentByRelativePath = getContentByRelativePath(relativeContentEntries);

    const programFiles = relativeContentEntries
      .filter(({ text }) => /WebApplication\.CreateBuilder|Host\.CreateDefaultBuilder|CreateHostBuilder/.test(text))
      .map(({ filePath }) => filePath);
    const controllers = relativeContentEntries
      .filter(({ text }) => /\[ApiController\]|ControllerBase|: Controller\b/.test(text))
      .map(({ filePath }) => filePath);
    const minimalApis = relativeContentEntries
      .filter(({ text }) => /Map(Get|Post|Put|Delete|Group)\s*\(/.test(text))
      .map(({ filePath }) => filePath);
    const serviceCandidates = relativeContentEntries
      .filter(
        ({ filePath, text }) =>
          /service/i.test(filePath) ||
          /\b(?:class|interface)\s+I?[A-Z][A-Za-z0-9_]*Service\b/.test(text)
      )
      .map(({ filePath }) => filePath);
    const projectFiles = context
      .getAllFilePaths()
      .filter((filePath) => /\.(csproj|sln)$/i.test(filePath));
    const serviceSymbols = buildSymbolToFileMap(
      relativeContentEntries.filter((entry) => serviceCandidates.includes(entry.filePath))
    );
    const controllerServiceLinks = controllers.flatMap((controllerFile) =>
      findReferencedSymbolMatches(
        contentByRelativePath.get(controllerFile) || '',
        serviceSymbols,
        [controllerFile]
      ).map(({ filePath, symbol }) =>
        createRelationship(
          resolveSymbolEndpoint(controllerFile, graphSymbolIndex, {
            preferredSymbols: inferClassSymbolsForFile(contentByRelativePath.get(controllerFile) || ''),
          }),
          resolveSymbolEndpoint(filePath, graphSymbolIndex, { preferredSymbols: [symbol] }),
          'framework',
          'aspnet_controller_service'
        )
      )
    );
    const controllerMethodLinks = controllers.flatMap((controllerFile) =>
      extractAspNetRouteMethods(contentByRelativePath.get(controllerFile) || '').map((methodName) =>
        createRelationship(
          resolveSymbolEndpoint(controllerFile, graphSymbolIndex, {
            preferredSymbols: inferClassSymbolsForFile(contentByRelativePath.get(controllerFile) || ''),
          }),
          resolveSymbolEndpoint(controllerFile, graphSymbolIndex, { preferredSymbols: [methodName] }),
          'framework',
          'aspnet_controller_method'
        )
      )
    );
    const serviceRegistrationLinks = programFiles.flatMap((programFile) => {
      const programText = contentByRelativePath.get(programFile) || '';
      const programEndpoint = resolveSymbolEndpoint(programFile, graphSymbolIndex, {
        preferredSymbols: inferClassSymbolsForFile(programText),
      });

      return extractAspNetServiceRegistrations(programText).flatMap(({ contract, implementation }) => {
        const matchingContract = Array.from(serviceSymbols.entries()).find(([symbol]) => symbol === contract);
        const matchingImplementation = Array.from(serviceSymbols.entries()).find(
          ([symbol]) => symbol === implementation
        );

        return [
          ...(matchingContract
            ? [
                createRelationship(
                  programEndpoint,
                  resolveSymbolEndpoint(matchingContract[1], graphSymbolIndex, {
                    preferredSymbols: [contract],
                  }),
                  'framework',
                  'aspnet_service_contract'
                ),
              ]
            : []),
          ...(matchingImplementation
            ? [
                createRelationship(
                  programEndpoint,
                  resolveSymbolEndpoint(matchingImplementation[1], graphSymbolIndex, {
                    preferredSymbols: [implementation],
                  }),
                  'framework',
                  'aspnet_service_registration'
                ),
              ]
            : []),
        ];
      });
    });

    return createInsight(
      aspNetAdapter.id,
      aspNetAdapter.displayName,
      aspNetAdapter.category,
      `Detected ${controllers.length} controller files, ${minimalApis.length} minimal API candidates, and ${projectFiles.length} .NET project descriptors.`,
      {
        evidence: context.getDetectedStack('aspnet-core')?.evidence || [],
        entryFiles: programFiles,
        configFiles: toRelativeList(context, projectFiles),
        components: controllers,
        routes: minimalApis,
        relationships: [
          ...programFiles.flatMap((entryFile) =>
            [...controllers, ...minimalApis].map((targetFile) =>
              createRelationship(
                resolveSymbolEndpoint(entryFile, graphSymbolIndex, {
                  preferredSymbols: inferClassSymbolsForFile(contentByRelativePath.get(entryFile) || ''),
                }),
                resolveSymbolEndpoint(targetFile, graphSymbolIndex, {
                  preferredSymbols: inferClassSymbolsForFile(contentByRelativePath.get(targetFile) || ''),
                }),
                'framework',
                'aspnet_entry_runtime'
              )
            )
          ),
          ...controllerServiceLinks,
          ...controllerMethodLinks,
          ...serviceRegistrationLinks,
          ...projectFiles.map((projectFile) => ({
            source: context.getProjectRelativePath(projectFile),
            target: programFiles[0]
              ? resolveSymbolEndpoint(programFiles[0], graphSymbolIndex)
              : context.getProjectRelativePath(projectFile),
            type: 'build' as const,
            reason: 'dotnet_project_entry',
          })),
        ],
      }
    );
  },
};

export const FRAMEWORK_STACK_ADAPTERS: StackAdapter[] = [
  nextJsAdapter,
  nestJsAdapter,
  springBootAdapter,
  ktorAdapter,
  micronautAdapter,
  quarkusAdapter,
  aspNetAdapter,
  ...POLYGLOT_FRAMEWORK_STACK_ADAPTERS,
];

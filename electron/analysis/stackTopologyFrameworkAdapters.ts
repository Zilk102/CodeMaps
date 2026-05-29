export * from './stackTopologySupport';

import {
  basename,
  buildGraphSymbolIndex,
  buildIdentifierVariants,
  buildNamedSymbolToFileMap,
  buildSymbolToFileMap,
  containsIdentifierVariantInNormalizedText,
  createInsight,
  createRelationship,
  escapeRegExp,
  extractActixHandlerNames,
  extractAspNetRouteMethods,
  extractAspNetServiceRegistrations,
  extractAxumHandlerNames,
  extractCSharpMethodNames,
  extractDjangoUrlTargets,
  extractFastApiRouteFunctions,
  extractGoFunctionNames,
  extractGoRouteHandlers,
  extractGrpcRegistrationTargets,
  extractJakartaRouteMethods,
  extractJvmFunctionNames,
  extractKtorRouteFunctions,
  extractLaravelControllerTargets,
  extractMethodNames,
  extractMicronautRouteMethods,
  extractNestProviderBindings,
  extractNestRouteMethods,
  extractPhpMethodNames,
  extractPythonFunctionNames,
  extractRailsResourceTargets,
  extractRubyMethodNames,
  extractRustFunctionNames,
  extractSpringBeanBindings,
  extractSpringRouteMethods,
  FileContentEntry,
  findContainingIdentifierSymbols,
  findMatchingIdentifierSymbols,
  findReferencedSymbolMatches,
  getContentByRelativePath,
  getNearestNextLayouts,
  GraphSymbolIndex,
  inferClassSymbolsForFile,
  inferSymbolsForFile,
  matchesIdentifierVariantInText,
  normalizeIdentifierForComparison,
  normalizeTypeName,
  ProjectFileContext,
  resolveSymbolEndpoint,
  splitIdentifierWords,
  StackAdapter,
  StackAdapterCategory,
  StackAdapterContext,
  StackRelationshipType,
  StackStructuralInsight,
  StackStructuralRelationship,
  stripKnownExtension,
  toPascalCase,
  toRelativeList
} from './stackTopologySupport';

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

const fastApiAdapter: StackAdapter = {
  id: 'fastapi-topology',
  displayName: 'FastAPI Topology',
  category: 'framework',
  supports: (context) => !!context.getDetectedStack('fastapi'),
  analyze: async (context) => {
    const graphSymbolIndex = buildGraphSymbolIndex(context.graph);
    const candidateFiles = context.getAllFilePaths().filter((filePath) => /\.py$/i.test(filePath));
    const contents = await context.readTexts(candidateFiles);
    const relativeContentEntries = contents.map((entry) => ({
      filePath: context.getProjectRelativePath(entry.filePath),
      text: entry.text,
    }));
    const contentByRelativePath = getContentByRelativePath(relativeContentEntries);

    const entryFiles = relativeContentEntries
      .filter(({ text }) => /\bFastAPI\s*\(/.test(text))
      .map(({ filePath }) => filePath);
    const routerFiles = relativeContentEntries
      .filter(({ text }) => /\bAPIRouter\s*\(/.test(text))
      .map(({ filePath }) => filePath);
    const routeFiles = relativeContentEntries
      .filter(({ text }) =>
        /@(?:[A-Za-z_][A-Za-z0-9_]*)\.(?:get|post|put|patch|delete|options|head|api_route)\s*\(/.test(
          text
        )
      )
      .map(({ filePath }) => filePath);
    const configFiles = context
      .getAllFilePaths()
      .filter((filePath) =>
        ['requirements.txt', 'requirements-dev.txt', 'pyproject.toml'].includes(
          context.getProjectRelativePath(filePath)
        )
      );

    const routerHandlerLinks = routeFiles.flatMap((routeFile) =>
      extractFastApiRouteFunctions(contentByRelativePath.get(routeFile) || '').map((handlerName) =>
        createRelationship(
          resolveSymbolEndpoint(routeFile, graphSymbolIndex),
          resolveSymbolEndpoint(routeFile, graphSymbolIndex, { preferredSymbols: [handlerName] }),
          'framework',
          routerFiles.includes(routeFile) ? 'fastapi_router_handler' : 'fastapi_app_handler'
        )
      )
    );

    const entryRouterLinks = entryFiles.flatMap((entryFile) =>
      routerFiles
        .filter((routerFile) => routerFile !== entryFile)
        .map((routerFile) =>
          createRelationship(
            resolveSymbolEndpoint(entryFile, graphSymbolIndex),
            resolveSymbolEndpoint(routerFile, graphSymbolIndex),
            'framework',
            'fastapi_entry_router'
          )
        )
    );

    return createInsight(
      fastApiAdapter.id,
      fastApiAdapter.displayName,
      fastApiAdapter.category,
      `Detected ${entryFiles.length} FastAPI app entrypoints, ${routerFiles.length} router files, and ${routeFiles.length} route-bearing modules.`,
      {
        evidence: context.getDetectedStack('fastapi')?.evidence || [],
        entryFiles,
        configFiles: toRelativeList(context, configFiles),
        routes: routeFiles,
        modules: routerFiles,
        relationships: [
          ...entryRouterLinks,
          ...routerHandlerLinks,
          ...configFiles.flatMap((configFile) =>
            entryFiles.map((entryFile) => ({
              source: context.getProjectRelativePath(configFile),
              target: resolveSymbolEndpoint(entryFile, graphSymbolIndex),
              type: 'build' as const,
              reason: 'fastapi_config_entry',
            }))
          ),
        ],
      }
    );
  },
};

const djangoAdapter: StackAdapter = {
  id: 'django-topology',
  displayName: 'Django Topology',
  category: 'framework',
  supports: (context) => !!context.getDetectedStack('django'),
  analyze: async (context) => {
    const graphSymbolIndex = buildGraphSymbolIndex(context.graph);
    const candidateFiles = context.getAllFilePaths().filter((filePath) => /\.py$/i.test(filePath));
    const contents = await context.readTexts(candidateFiles);
    const relativeContentEntries = contents.map((entry) => ({
      filePath: context.getProjectRelativePath(entry.filePath),
      text: entry.text,
    }));
    const contentByRelativePath = getContentByRelativePath(relativeContentEntries);

    const manageFiles = relativeContentEntries
      .filter(({ filePath }) => basename(filePath) === 'manage.py')
      .map(({ filePath }) => filePath);
    const settingsFiles = relativeContentEntries
      .filter(({ filePath }) => basename(filePath) === 'settings.py')
      .map(({ filePath }) => filePath);
    const urlFiles = relativeContentEntries
      .filter(({ filePath, text }) => basename(filePath) === 'urls.py' || /\burlpatterns\s*=/.test(text))
      .map(({ filePath }) => filePath);
    const viewFiles = relativeContentEntries
      .filter(
        ({ filePath, text }) =>
          basename(filePath) === 'views.py' ||
          /\b(?:async\s+def|def)\s+[A-Za-z_][A-Za-z0-9_]*\s*\(/.test(text) ||
          /\bclass\s+[A-Z][A-Za-z0-9_]*(?:View|ViewSet)\b/.test(text)
      )
      .map(({ filePath }) => filePath);
    const modelFiles = relativeContentEntries
      .filter(({ filePath, text }) => basename(filePath) === 'models.py' || /\bmodels\.Model\b/.test(text))
      .map(({ filePath }) => filePath);
    const configFiles = context
      .getAllFilePaths()
      .filter((filePath) =>
        ['requirements.txt', 'requirements-dev.txt', 'pyproject.toml'].includes(
          context.getProjectRelativePath(filePath)
        )
      );

    const viewSymbols = buildNamedSymbolToFileMap(
      relativeContentEntries.filter((entry) => viewFiles.includes(entry.filePath)),
      (text) => [...extractPythonFunctionNames(text), ...inferClassSymbolsForFile(text)]
    );
    const modelSymbols = buildSymbolToFileMap(
      relativeContentEntries.filter((entry) => modelFiles.includes(entry.filePath))
    );

    const urlViewLinks = urlFiles.flatMap((urlFile) =>
      extractDjangoUrlTargets(contentByRelativePath.get(urlFile) || '')
        .map((symbol) => ({ symbol, filePath: viewSymbols.get(symbol) }))
        .filter((entry): entry is { symbol: string; filePath: string } => Boolean(entry.filePath))
        .map(({ symbol, filePath }) =>
          createRelationship(
            resolveSymbolEndpoint(urlFile, graphSymbolIndex),
            resolveSymbolEndpoint(filePath, graphSymbolIndex, { preferredSymbols: [symbol] }),
            'framework',
            'django_url_view'
          )
        )
    );

    const participatingViewFiles = new Set(
      urlViewLinks.map((relationship) => relationship.target.split('#')[0])
    );
    const viewModelLinks = Array.from(participatingViewFiles).flatMap((viewFile) =>
      findReferencedSymbolMatches(contentByRelativePath.get(viewFile) || '', modelSymbols, [viewFile]).map(
        ({ filePath, symbol }) =>
          createRelationship(
            resolveSymbolEndpoint(viewFile, graphSymbolIndex),
            resolveSymbolEndpoint(filePath, graphSymbolIndex, { preferredSymbols: [symbol] }),
            'framework',
            'django_view_model'
          )
      )
    );

    return createInsight(
      djangoAdapter.id,
      djangoAdapter.displayName,
      djangoAdapter.category,
      `Detected ${manageFiles.length} Django entry files, ${urlFiles.length} URL modules, ${viewFiles.length} view modules, and ${modelFiles.length} model modules.`,
      {
        evidence: context.getDetectedStack('django')?.evidence || [],
        entryFiles: manageFiles,
        configFiles: toRelativeList(context, [...configFiles, ...settingsFiles]),
        components: viewFiles,
        modules: [...urlFiles, ...modelFiles],
        relationships: [
          ...manageFiles.flatMap((manageFile) =>
            settingsFiles.map((settingsFile) =>
              createRelationship(
                resolveSymbolEndpoint(manageFile, graphSymbolIndex),
                resolveSymbolEndpoint(settingsFile, graphSymbolIndex),
                'framework',
                'django_manage_settings'
              )
            )
          ),
          ...settingsFiles.flatMap((settingsFile) =>
            urlFiles.map((urlFile) =>
              createRelationship(
                resolveSymbolEndpoint(settingsFile, graphSymbolIndex),
                resolveSymbolEndpoint(urlFile, graphSymbolIndex),
                'framework',
                'django_settings_urls'
              )
            )
          ),
          ...urlViewLinks,
          ...viewModelLinks,
          ...configFiles.flatMap((configFile) =>
            manageFiles.map((manageFile) => ({
              source: context.getProjectRelativePath(configFile),
              target: resolveSymbolEndpoint(manageFile, graphSymbolIndex),
              type: 'build' as const,
              reason: 'django_config_entry',
            }))
          ),
        ],
      }
    );
  },
};

const railsAdapter: StackAdapter = {
  id: 'rails-topology',
  displayName: 'Rails Topology',
  category: 'framework',
  supports: (context) => !!context.getDetectedStack('rails'),
  analyze: async (context) => {
    const graphSymbolIndex = buildGraphSymbolIndex(context.graph);
    const candidateFiles = context.getAllFilePaths().filter((filePath) => /\.rb$/i.test(filePath));
    const contents = await context.readTexts(candidateFiles);
    const relativeContentEntries = contents.map((entry) => ({
      filePath: context.getProjectRelativePath(entry.filePath),
      text: entry.text,
    }));
    const contentByRelativePath = getContentByRelativePath(relativeContentEntries);

    const routeFiles = relativeContentEntries
      .filter(({ filePath }) => filePath === 'config/routes.rb')
      .map(({ filePath }) => filePath);
    const entryFiles = relativeContentEntries
      .filter(({ filePath }) => ['config/application.rb', 'config/environment.rb'].includes(filePath))
      .map(({ filePath }) => filePath);
    const controllerFiles = relativeContentEntries
      .filter(({ filePath }) => /^app\/controllers\/.+_controller\.rb$/i.test(filePath))
      .map(({ filePath }) => filePath);
    const modelFiles = relativeContentEntries
      .filter(({ filePath }) => /^app\/models\/.+\.rb$/i.test(filePath))
      .map(({ filePath }) => filePath);
    const modelSymbols = buildSymbolToFileMap(
      relativeContentEntries.filter((entry) => modelFiles.includes(entry.filePath))
    );

    const routeControllerLinks = routeFiles.flatMap((routeFile) =>
      extractRailsResourceTargets(contentByRelativePath.get(routeFile) || '').flatMap((resourceName) =>
        controllerFiles
          .filter((controllerFile) =>
            basename(controllerFile).toLowerCase() === `${resourceName.toLowerCase()}_controller.rb`
          )
          .map((controllerFile) =>
            createRelationship(
              resolveSymbolEndpoint(routeFile, graphSymbolIndex),
              resolveSymbolEndpoint(controllerFile, graphSymbolIndex),
              'framework',
              'rails_routes_controller'
            )
          )
      )
    );

    const controllerModelLinks = controllerFiles.flatMap((controllerFile) =>
      findReferencedSymbolMatches(
        contentByRelativePath.get(controllerFile) || '',
        modelSymbols,
        [controllerFile]
      ).map(({ filePath, symbol }) =>
        createRelationship(
          resolveSymbolEndpoint(controllerFile, graphSymbolIndex),
          resolveSymbolEndpoint(filePath, graphSymbolIndex, { preferredSymbols: [symbol] }),
          'framework',
          'rails_controller_model'
        )
      )
    );

    return createInsight(
      railsAdapter.id,
      railsAdapter.displayName,
      railsAdapter.category,
      `Detected ${routeFiles.length} Rails route descriptors, ${controllerFiles.length} controllers, and ${modelFiles.length} models.`,
      {
        evidence: context.getDetectedStack('rails')?.evidence || [],
        entryFiles,
        configFiles: ['Gemfile', ...routeFiles],
        components: controllerFiles,
        modules: modelFiles,
        relationships: [
          ...entryFiles.flatMap((entryFile) =>
            routeFiles.map((routeFile) =>
              createRelationship(
                resolveSymbolEndpoint(entryFile, graphSymbolIndex),
                resolveSymbolEndpoint(routeFile, graphSymbolIndex),
                'framework',
                'rails_entry_routes'
              )
            )
          ),
          ...routeControllerLinks,
          ...controllerModelLinks,
        ],
      }
    );
  },
};

const laravelAdapter: StackAdapter = {
  id: 'laravel-topology',
  displayName: 'Laravel Topology',
  category: 'framework',
  supports: (context) => !!context.getDetectedStack('laravel'),
  analyze: async (context) => {
    const graphSymbolIndex = buildGraphSymbolIndex(context.graph);
    const candidateFiles = context.getAllFilePaths().filter((filePath) => /\.php$/i.test(filePath));
    const contents = await context.readTexts(candidateFiles);
    const relativeContentEntries = contents.map((entry) => ({
      filePath: context.getProjectRelativePath(entry.filePath),
      text: entry.text,
    }));
    const contentByRelativePath = getContentByRelativePath(relativeContentEntries);

    const entryFiles = context
      .getAllFilePaths()
      .filter((filePath) => context.getProjectRelativePath(filePath) === 'artisan')
      .map((filePath) => context.getProjectRelativePath(filePath));
    const routeFiles = relativeContentEntries
      .filter(({ filePath }) => /^routes\/.+\.php$/i.test(filePath))
      .map(({ filePath }) => filePath);
    const controllerFiles = relativeContentEntries
      .filter(({ filePath }) => /^app\/Http\/Controllers\/.+\.php$/i.test(filePath))
      .map(({ filePath }) => filePath);
    const modelFiles = relativeContentEntries
      .filter(
        ({ filePath, text }) =>
          /^app\/Models\/.+\.php$/i.test(filePath) || /\bextends\s+Model\b/.test(text)
      )
      .map(({ filePath }) => filePath);
    const configFiles = context
      .getAllFilePaths()
      .filter((filePath) =>
        ['composer.json'].includes(context.getProjectRelativePath(filePath))
      );

    const controllerSymbols = buildSymbolToFileMap(
      relativeContentEntries.filter((entry) => controllerFiles.includes(entry.filePath))
    );
    const modelSymbols = buildSymbolToFileMap(
      relativeContentEntries.filter((entry) => modelFiles.includes(entry.filePath))
    );

    const routeControllerLinks = routeFiles.flatMap((routeFile) =>
      extractLaravelControllerTargets(contentByRelativePath.get(routeFile) || '')
        .map((symbol) => ({ symbol, filePath: controllerSymbols.get(symbol) }))
        .filter((entry): entry is { symbol: string; filePath: string } => Boolean(entry.filePath))
        .map(({ symbol, filePath }) =>
          createRelationship(
            resolveSymbolEndpoint(routeFile, graphSymbolIndex),
            resolveSymbolEndpoint(filePath, graphSymbolIndex, { preferredSymbols: [symbol] }),
            'framework',
            'laravel_route_controller'
          )
        )
    );

    const controllerModelLinks = controllerFiles.flatMap((controllerFile) =>
      findReferencedSymbolMatches(
        contentByRelativePath.get(controllerFile) || '',
        modelSymbols,
        [controllerFile]
      ).map(({ filePath, symbol }) =>
        createRelationship(
          resolveSymbolEndpoint(controllerFile, graphSymbolIndex),
          resolveSymbolEndpoint(filePath, graphSymbolIndex, { preferredSymbols: [symbol] }),
          'framework',
          'laravel_controller_model'
        )
      )
    );

    return createInsight(
      laravelAdapter.id,
      laravelAdapter.displayName,
      laravelAdapter.category,
      `Detected ${routeFiles.length} Laravel route files, ${controllerFiles.length} controllers, and ${modelFiles.length} models.`,
      {
        evidence: context.getDetectedStack('laravel')?.evidence || [],
        entryFiles,
        configFiles: toRelativeList(context, configFiles),
        components: controllerFiles,
        modules: modelFiles,
        relationships: [
          ...entryFiles.flatMap((entryFile) =>
            routeFiles.map((routeFile) =>
              createRelationship(
                resolveSymbolEndpoint(entryFile, graphSymbolIndex),
                resolveSymbolEndpoint(routeFile, graphSymbolIndex),
                'framework',
                'laravel_artisan_routes'
              )
            )
          ),
          ...routeControllerLinks,
          ...controllerModelLinks,
          ...configFiles.flatMap((configFile) =>
            entryFiles.map((entryFile) => ({
              source: context.getProjectRelativePath(configFile),
              target: resolveSymbolEndpoint(entryFile, graphSymbolIndex),
              type: 'build' as const,
              reason: 'laravel_config_entry',
            }))
          ),
        ],
      }
    );
  },
};

const createGoWebAdapter = (options: {
  stackId: string;
  adapterId: string;
  displayName: string;
  entryPattern: RegExp;
  routePattern: RegExp;
  entryReason: string;
  handlerReason: string;
  configReason: string;
}) =>
  ({
    id: options.adapterId,
    displayName: options.displayName,
    category: 'framework',
    supports: (context) => !!context.getDetectedStack(options.stackId),
    analyze: async (context) => {
      const graphSymbolIndex = buildGraphSymbolIndex(context.graph);
      const candidateFiles = context.getAllFilePaths().filter((filePath) => /\.go$/i.test(filePath));
      const contents = await context.readTexts(candidateFiles);
      const relativeContentEntries = contents.map((entry) => ({
        filePath: context.getProjectRelativePath(entry.filePath),
        text: entry.text,
      }));
      const contentByRelativePath = getContentByRelativePath(relativeContentEntries);
      const functionSymbols = buildNamedSymbolToFileMap(relativeContentEntries, extractGoFunctionNames);
      const configFiles = context
        .getAllFilePaths()
        .filter((filePath) => context.getProjectRelativePath(filePath) === 'go.mod');
      const entryFiles = relativeContentEntries
        .filter(({ text }) => options.entryPattern.test(text))
        .map(({ filePath }) => filePath);
      const routeFiles = relativeContentEntries
        .filter(({ text }) => options.routePattern.test(text))
        .map(({ filePath }) => filePath);

      const routeHandlerLinks = routeFiles.flatMap((routeFile) =>
        extractGoRouteHandlers(contentByRelativePath.get(routeFile) || '')
          .map((handlerName) => ({ handlerName, filePath: functionSymbols.get(handlerName) || routeFile }))
          .map(({ handlerName, filePath }) =>
            createRelationship(
              resolveSymbolEndpoint(routeFile, graphSymbolIndex),
              resolveSymbolEndpoint(filePath, graphSymbolIndex, { preferredSymbols: [handlerName] }),
              'framework',
              options.handlerReason
            )
          )
      );

      return createInsight(
        options.adapterId,
        options.displayName,
        'framework',
        `Detected ${entryFiles.length} ${options.displayName} entry files and ${routeFiles.length} route-bearing modules.`,
        {
          evidence: context.getDetectedStack(options.stackId)?.evidence || [],
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
                  options.entryReason
                )
              )
            ),
            ...routeHandlerLinks,
            ...configFiles.flatMap((configFile) =>
              entryFiles.map((entryFile) => ({
                source: context.getProjectRelativePath(configFile),
                target: resolveSymbolEndpoint(entryFile, graphSymbolIndex),
                type: 'build' as const,
                reason: options.configReason,
              }))
            ),
          ],
        }
      );
    },
  }) satisfies StackAdapter;

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

const axumAdapter: StackAdapter = {
  id: 'axum-topology',
  displayName: 'Axum Topology',
  category: 'framework',
  supports: (context) => !!context.getDetectedStack('axum'),
  analyze: async (context) => {
    const graphSymbolIndex = buildGraphSymbolIndex(context.graph);
    const candidateFiles = context.getAllFilePaths().filter((filePath) => /\.rs$/i.test(filePath));
    const contents = await context.readTexts(candidateFiles);
    const relativeContentEntries = contents.map((entry) => ({
      filePath: context.getProjectRelativePath(entry.filePath),
      text: entry.text,
    }));
    const contentByRelativePath = getContentByRelativePath(relativeContentEntries);
    const functionSymbols = buildNamedSymbolToFileMap(relativeContentEntries, extractRustFunctionNames);
    const configFiles = context
      .getAllFilePaths()
      .filter((filePath) => context.getProjectRelativePath(filePath) === 'Cargo.toml');
    const entryFiles = relativeContentEntries
      .filter(({ text }) => /\bRouter::new\s*\(|\baxum::serve\s*\(/.test(text))
      .map(({ filePath }) => filePath);
    const routeFiles = relativeContentEntries
      .filter(({ text }) =>
        /\.route\s*\([^,]+,\s*(?:get|post|put|patch|delete|options|head|any)\s*\(/.test(text)
      )
      .map(({ filePath }) => filePath);

    const routeHandlerLinks = routeFiles.flatMap((routeFile) =>
      extractAxumHandlerNames(contentByRelativePath.get(routeFile) || '')
        .map((handlerName) => ({ handlerName, filePath: functionSymbols.get(handlerName) || routeFile }))
        .map(({ handlerName, filePath }) =>
          createRelationship(
            resolveSymbolEndpoint(routeFile, graphSymbolIndex),
            resolveSymbolEndpoint(filePath, graphSymbolIndex, { preferredSymbols: [handlerName] }),
            'framework',
            'axum_router_handler'
          )
        )
    );

    return createInsight(
      axumAdapter.id,
      axumAdapter.displayName,
      axumAdapter.category,
      `Detected ${entryFiles.length} Axum entry files and ${routeFiles.length} route-bearing modules.`,
      {
        evidence: context.getDetectedStack('axum')?.evidence || [],
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
                'axum_entry_router'
              )
            )
          ),
          ...routeHandlerLinks,
          ...configFiles.flatMap((configFile) =>
            entryFiles.map((entryFile) => ({
              source: context.getProjectRelativePath(configFile),
              target: resolveSymbolEndpoint(entryFile, graphSymbolIndex),
              type: 'build' as const,
              reason: 'cargo_axum_entry',
            }))
          ),
        ],
      }
    );
  },
};

const actixAdapter: StackAdapter = {
  id: 'actix-web-topology',
  displayName: 'Actix Web Topology',
  category: 'framework',
  supports: (context) => !!context.getDetectedStack('actix-web'),
  analyze: async (context) => {
    const graphSymbolIndex = buildGraphSymbolIndex(context.graph);
    const candidateFiles = context.getAllFilePaths().filter((filePath) => /\.rs$/i.test(filePath));
    const contents = await context.readTexts(candidateFiles);
    const relativeContentEntries = contents.map((entry) => ({
      filePath: context.getProjectRelativePath(entry.filePath),
      text: entry.text,
    }));
    const contentByRelativePath = getContentByRelativePath(relativeContentEntries);
    const functionSymbols = buildNamedSymbolToFileMap(relativeContentEntries, extractRustFunctionNames);
    const configFiles = context
      .getAllFilePaths()
      .filter((filePath) => context.getProjectRelativePath(filePath) === 'Cargo.toml');
    const entryFiles = relativeContentEntries
      .filter(({ text }) => /\bHttpServer::new\s*\(|\bApp::new\s*\(/.test(text))
      .map(({ filePath }) => filePath);
    const routeFiles = relativeContentEntries
      .filter(({ text }) =>
        /\b(?:web::(?:get|post|put|patch|delete)\s*\(\)\.to\s*\(|#\[(?:get|post|put|patch|delete|route))/.test(
          text
        )
      )
      .map(({ filePath }) => filePath);

    const routeHandlerLinks = routeFiles.flatMap((routeFile) =>
      extractActixHandlerNames(contentByRelativePath.get(routeFile) || '')
        .map((handlerName) => ({ handlerName, filePath: functionSymbols.get(handlerName) || routeFile }))
        .map(({ handlerName, filePath }) =>
          createRelationship(
            resolveSymbolEndpoint(routeFile, graphSymbolIndex),
            resolveSymbolEndpoint(filePath, graphSymbolIndex, { preferredSymbols: [handlerName] }),
            'framework',
            'actix_route_handler'
          )
        )
    );

    return createInsight(
      actixAdapter.id,
      actixAdapter.displayName,
      actixAdapter.category,
      `Detected ${entryFiles.length} Actix entry files and ${routeFiles.length} route-bearing modules.`,
      {
        evidence: context.getDetectedStack('actix-web')?.evidence || [],
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
                'actix_entry_routes'
              )
            )
          ),
          ...routeHandlerLinks,
          ...configFiles.flatMap((configFile) =>
            entryFiles.map((entryFile) => ({
              source: context.getProjectRelativePath(configFile),
              target: resolveSymbolEndpoint(entryFile, graphSymbolIndex),
              type: 'build' as const,
              reason: 'cargo_actix_entry',
            }))
          ),
        ],
      }
    );
  },
};

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

const grpcGoAdapter: StackAdapter = {
  id: 'grpc-go-topology',
  displayName: 'gRPC-Go Topology',
  category: 'framework',
  supports: (context) => !!context.getDetectedStack('grpc-go'),
  analyze: async (context) => {
    const graphSymbolIndex = buildGraphSymbolIndex(context.graph);
    const candidateFiles = context.getAllFilePaths().filter((filePath) => /\.go$/i.test(filePath));
    const contents = await context.readTexts(candidateFiles);
    const relativeContentEntries = contents.map((entry) => ({
      filePath: context.getProjectRelativePath(entry.filePath),
      text: entry.text,
    }));
    const contentByRelativePath = getContentByRelativePath(relativeContentEntries);
    const goSymbols = buildNamedSymbolToFileMap(relativeContentEntries, extractGoFunctionNames);
    const typeSymbols = buildSymbolToFileMap(relativeContentEntries);
    const configFiles = context
      .getAllFilePaths()
      .filter((filePath) => context.getProjectRelativePath(filePath) === 'go.mod');
    const entryFiles = relativeContentEntries
      .filter(({ text }) => /\bgrpc\.NewServer\s*\(/.test(text))
      .map(({ filePath }) => filePath);
    const registrationFiles = relativeContentEntries
      .filter(({ text }) => /\bRegister[A-Z][A-Za-z0-9_]*Server\s*\(/.test(text))
      .map(({ filePath }) => filePath);

    const registrationLinks = registrationFiles.flatMap((registrationFile) =>
      extractGrpcRegistrationTargets(contentByRelativePath.get(registrationFile) || '').flatMap(
        ({ implementation }) => {
          const matchedFile =
            typeSymbols.get(implementation) || goSymbols.get(implementation.replace(/Server$/, 'Server'));
          if (!matchedFile) {
            return [];
          }

          return [
            createRelationship(
              resolveSymbolEndpoint(registrationFile, graphSymbolIndex),
              resolveSymbolEndpoint(matchedFile, graphSymbolIndex, { preferredSymbols: [implementation] }),
              'framework',
              'grpc_registration_handler'
            ),
          ];
        }
      )
    );

    return createInsight(
      grpcGoAdapter.id,
      grpcGoAdapter.displayName,
      grpcGoAdapter.category,
      `Detected ${entryFiles.length} gRPC server entry files and ${registrationFiles.length} registration-bearing modules.`,
      {
        evidence: context.getDetectedStack('grpc-go')?.evidence || [],
        entryFiles,
        configFiles: toRelativeList(context, configFiles),
        modules: registrationFiles,
        relationships: [
          ...entryFiles.flatMap((entryFile) =>
            registrationFiles.map((registrationFile) =>
              createRelationship(
                resolveSymbolEndpoint(entryFile, graphSymbolIndex),
                resolveSymbolEndpoint(registrationFile, graphSymbolIndex),
                'framework',
                'grpc_entry_registration'
              )
            )
          ),
          ...registrationLinks,
          ...configFiles.flatMap((configFile) =>
            entryFiles.map((entryFile) => ({
              source: context.getProjectRelativePath(configFile),
              target: resolveSymbolEndpoint(entryFile, graphSymbolIndex),
              type: 'build' as const,
              reason: 'gomod_grpc_entry',
            }))
          ),
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
  fastApiAdapter,
  djangoAdapter,
  railsAdapter,
  laravelAdapter,
  ginAdapter,
  fiberAdapter,
  echoAdapter,
  chiAdapter,
  grpcGoAdapter,
  axumAdapter,
  actixAdapter,
];
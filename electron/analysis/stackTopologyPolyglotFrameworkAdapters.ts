export * from './stackTopologySupport';

import {
  basename,
  buildGraphSymbolIndex,
  buildNamedSymbolToFileMap,
  buildSymbolToFileMap,
  createInsight,
  createRelationship,
  extractActixHandlerNames,
  extractAxumHandlerNames,
  extractDjangoUrlTargets,
  extractFastApiRouteFunctions,
  extractGoFunctionNames,
  extractGoRouteHandlers,
  extractGrpcRegistrationTargets,
  extractLaravelControllerTargets,
  extractPythonFunctionNames,
  extractRailsResourceTargets,
  extractRustFunctionNames,
  findReferencedSymbolMatches,
  getContentByRelativePath,
  inferClassSymbolsForFile,
  resolveSymbolEndpoint,
  StackAdapter,
  toRelativeList,
} from './stackTopologySupport';

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
          .map((handlerName) => ({
            handlerName,
            filePath: functionSymbols.get(handlerName) || routeFile,
          }))
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

export const POLYGLOT_FRAMEWORK_STACK_ADAPTERS: StackAdapter[] = [
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

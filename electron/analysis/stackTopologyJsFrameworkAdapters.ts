import {
  basename,
  buildGraphSymbolIndex,
  buildSymbolToFileMap,
  createInsight,
  createRelationship,
  extractNestProviderBindings,
  extractNestRouteMethods,
  findReferencedSymbolMatches,
  getContentByRelativePath,
  getNearestNextLayouts,
  inferClassSymbolsForFile,
  resolveSymbolEndpoint,
  StackAdapter,
  toRelativeList,
} from './stackTopologySupport';

type GraphSymbolIndex = ReturnType<typeof buildGraphSymbolIndex>;

/** A relationship from the class of `sourceFile` to each symbol of `symbols` its text mentions. */
function linkReferencedSymbols(
  graphSymbolIndex: GraphSymbolIndex,
  sourceFile: string,
  sourceText: string,
  symbols: Map<string, string>,
  reason: string
) {
  return findReferencedSymbolMatches(sourceText, symbols, [sourceFile]).map(
    ({ filePath, symbol }) =>
      createRelationship(
        resolveSymbolEndpoint(sourceFile, graphSymbolIndex, {
          preferredSymbols: inferClassSymbolsForFile(sourceText),
        }),
        resolveSymbolEndpoint(filePath, graphSymbolIndex, { preferredSymbols: [symbol] }),
        'framework',
        reason
      )
  );
}

export const nextJsAdapter: StackAdapter = {
  id: 'nextjs-topology',
  displayName: 'Next.js Topology',
  category: 'framework',
  supports: (context) => !!context.getDetectedStack('nextjs'),
  analyze: async (context) => {
    const graphSymbolIndex = buildGraphSymbolIndex(context.graph);
    const routeFiles = [
      ...context
        .findByRelativePrefix('app/')
        .filter((filePath) =>
          /(?:^|\/)(page|layout|route)\.(tsx|ts|jsx|js)$/i.test(
            context.getProjectRelativePath(filePath)
          )
        ),
      ...context
        .findByRelativePrefix('pages/')
        .filter((filePath) => /\.(tsx|ts|jsx|js)$/i.test(filePath)),
    ];
    const apiRoutes = routeFiles
      .map((filePath) => context.getProjectRelativePath(filePath))
      .filter(
        (relativePath) =>
          relativePath.includes('/api/') || /\/route\.(tsx|ts|jsx|js)$/i.test(relativePath)
      );
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
              target: resolveSymbolEndpoint(
                context.getProjectRelativePath(entryFile),
                graphSymbolIndex
              ),
              type: 'build' as const,
              reason: 'nextjs_config_entry',
            }))
          ),
          ...routePaths
            .filter((relativePath) => /\/route\.(tsx|ts|jsx|js)$/i.test(relativePath))
            .map((relativePath) =>
              createRelationship(
                entryFiles[0]
                  ? resolveSymbolEndpoint(
                      context.getProjectRelativePath(entryFiles[0]),
                      graphSymbolIndex
                    )
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

export const nestJsAdapter: StackAdapter = {
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
      linkReferencedSymbols(
        graphSymbolIndex,
        controllerFile,
        contentByRelativePath.get(controllerFile) || '',
        providerSymbols,
        'nestjs_controller_provider'
      )
    );
    const moduleSemanticLinks = modules.flatMap((moduleFile) => {
      const moduleText = contentByRelativePath.get(moduleFile) || '';
      const targets: Array<[reason: string, symbols: Map<string, string>]> = [
        ['nestjs_module_controller', controllerSymbols],
        ['nestjs_module_provider', providerSymbols],
        ['nestjs_module_import', moduleSymbols],
      ];
      return targets.flatMap(([reason, symbols]) =>
        linkReferencedSymbols(graphSymbolIndex, moduleFile, moduleText, symbols, reason)
      );
    });
    const controllerMethodLinks = controllers.flatMap((controllerFile) =>
      extractNestRouteMethods(contentByRelativePath.get(controllerFile) || '').map((methodName) =>
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
              resolveSymbolEndpoint(filePath, graphSymbolIndex, {
                preferredSymbols: [implementation],
              }),
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
                  preferredSymbols: inferClassSymbolsForFile(
                    contentByRelativePath.get(moduleFile) || ''
                  ),
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

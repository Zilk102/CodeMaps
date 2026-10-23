import {
  basename,
  buildNamedSymbolToFileMap,
  createRelationship,
  extractDjangoUrlTargets,
  extractFastApiRouteFunctions,
  extractLaravelControllerTargets,
  extractPythonFunctionNames,
  extractRailsResourceTargets,
  inferClassSymbolsForFile,
  toRelativeList,
} from './stackTopologySupport';
import {
  configEntryLinks,
  configFilesNamed,
  defineFrameworkAdapter,
  entryLinks,
  fileEndpoint,
  filesMatching,
  filesWhere,
  referenceLinks,
  symbolsOfFiles,
  targetLinks,
  textOf,
} from './stackTopologyAdapterKit';

const PYTHON_CONFIG_FILES = ['requirements.txt', 'requirements-dev.txt', 'pyproject.toml'];

export const fastApiAdapter = defineFrameworkAdapter({
  id: 'fastapi-topology',
  displayName: 'FastAPI Topology',
  stackId: 'fastapi',
  extensions: /\.py$/i,
  describe: (sources) => {
    const { context, entries } = sources;
    const entryFiles = filesMatching(entries, /\bFastAPI\s*\(/);
    const routerFiles = filesMatching(entries, /\bAPIRouter\s*\(/);
    const routeFiles = filesMatching(
      entries,
      /@(?:[A-Za-z_][A-Za-z0-9_]*)\.(?:get|post|put|patch|delete|options|head|api_route)\s*\(/
    );
    const configFiles = configFilesNamed(context, PYTHON_CONFIG_FILES);

    const routerHandlerLinks = routeFiles.flatMap((routeFile) =>
      extractFastApiRouteFunctions(textOf(sources, routeFile)).map((handlerName) =>
        createRelationship(
          fileEndpoint(sources, routeFile),
          fileEndpoint(sources, routeFile, handlerName),
          'framework',
          routerFiles.includes(routeFile) ? 'fastapi_router_handler' : 'fastapi_app_handler'
        )
      )
    );
    const entryRouterLinks = entryFiles.flatMap((entryFile) =>
      entryLinks(
        sources,
        [entryFile],
        routerFiles.filter((routerFile) => routerFile !== entryFile),
        'fastapi_entry_router'
      )
    );

    return {
      summary: `Detected ${entryFiles.length} FastAPI app entrypoints, ${routerFiles.length} router files, and ${routeFiles.length} route-bearing modules.`,
      details: {
        entryFiles,
        configFiles: toRelativeList(context, configFiles),
        routes: routeFiles,
        modules: routerFiles,
        relationships: [
          ...entryRouterLinks,
          ...routerHandlerLinks,
          ...configEntryLinks(sources, configFiles, entryFiles, 'fastapi_config_entry'),
        ],
      },
    };
  },
});

export const djangoAdapter = defineFrameworkAdapter({
  id: 'django-topology',
  displayName: 'Django Topology',
  stackId: 'django',
  extensions: /\.py$/i,
  describe: (sources) => {
    const { context, entries } = sources;
    const manageFiles = filesWhere(entries, ({ filePath }) => basename(filePath) === 'manage.py');
    const settingsFiles = filesWhere(
      entries,
      ({ filePath }) => basename(filePath) === 'settings.py'
    );
    const urlFiles = filesWhere(
      entries,
      ({ filePath, text }) => basename(filePath) === 'urls.py' || /\burlpatterns\s*=/.test(text)
    );
    const viewFiles = filesWhere(
      entries,
      ({ filePath, text }) =>
        basename(filePath) === 'views.py' ||
        /\b(?:async\s+def|def)\s+[A-Za-z_][A-Za-z0-9_]*\s*\(/.test(text) ||
        /\bclass\s+[A-Z][A-Za-z0-9_]*(?:View|ViewSet)\b/.test(text)
    );
    const modelFiles = filesWhere(
      entries,
      ({ filePath, text }) => basename(filePath) === 'models.py' || /\bmodels\.Model\b/.test(text)
    );
    const configFiles = configFilesNamed(context, PYTHON_CONFIG_FILES);

    const viewSymbols = buildNamedSymbolToFileMap(
      entries.filter((entry) => viewFiles.includes(entry.filePath)),
      (text) => [...extractPythonFunctionNames(text), ...inferClassSymbolsForFile(text)]
    );
    const urlViewLinks = targetLinks(
      sources,
      urlFiles,
      extractDjangoUrlTargets,
      viewSymbols,
      'django_url_view'
    );
    const participatingViewFiles = Array.from(
      new Set(urlViewLinks.map((relationship) => relationship.target.split('#')[0]))
    );

    return {
      summary: `Detected ${manageFiles.length} Django entry files, ${urlFiles.length} URL modules, ${viewFiles.length} view modules, and ${modelFiles.length} model modules.`,
      details: {
        entryFiles: manageFiles,
        configFiles: toRelativeList(context, [...configFiles, ...settingsFiles]),
        components: viewFiles,
        modules: [...urlFiles, ...modelFiles],
        relationships: [
          ...entryLinks(sources, manageFiles, settingsFiles, 'django_manage_settings'),
          ...entryLinks(sources, settingsFiles, urlFiles, 'django_settings_urls'),
          ...urlViewLinks,
          ...referenceLinks(
            sources,
            participatingViewFiles,
            symbolsOfFiles(sources, modelFiles),
            'django_view_model',
            'file'
          ),
          ...configEntryLinks(sources, configFiles, manageFiles, 'django_config_entry'),
        ],
      },
    };
  },
});

export const railsAdapter = defineFrameworkAdapter({
  id: 'rails-topology',
  displayName: 'Rails Topology',
  stackId: 'rails',
  extensions: /\.rb$/i,
  describe: (sources) => {
    const { entries } = sources;
    const routeFiles = filesWhere(entries, ({ filePath }) => filePath === 'config/routes.rb');
    const entryFiles = filesWhere(entries, ({ filePath }) =>
      ['config/application.rb', 'config/environment.rb'].includes(filePath)
    );
    const controllerFiles = filesWhere(entries, ({ filePath }) =>
      /^app\/controllers\/.+_controller\.rb$/i.test(filePath)
    );
    const modelFiles = filesWhere(entries, ({ filePath }) =>
      /^app\/models\/.+\.rb$/i.test(filePath)
    );

    const routeControllerLinks = routeFiles.flatMap((routeFile) =>
      extractRailsResourceTargets(textOf(sources, routeFile)).flatMap((resourceName) =>
        entryLinks(
          sources,
          [routeFile],
          controllerFiles.filter(
            (controllerFile) =>
              basename(controllerFile).toLowerCase() ===
              `${resourceName.toLowerCase()}_controller.rb`
          ),
          'rails_routes_controller'
        )
      )
    );

    return {
      summary: `Detected ${routeFiles.length} Rails route descriptors, ${controllerFiles.length} controllers, and ${modelFiles.length} models.`,
      details: {
        entryFiles,
        configFiles: ['Gemfile', ...routeFiles],
        components: controllerFiles,
        modules: modelFiles,
        relationships: [
          ...entryLinks(sources, entryFiles, routeFiles, 'rails_entry_routes'),
          ...routeControllerLinks,
          ...referenceLinks(
            sources,
            controllerFiles,
            symbolsOfFiles(sources, modelFiles),
            'rails_controller_model',
            'file'
          ),
        ],
      },
    };
  },
});

export const laravelAdapter = defineFrameworkAdapter({
  id: 'laravel-topology',
  displayName: 'Laravel Topology',
  stackId: 'laravel',
  extensions: /\.php$/i,
  describe: (sources) => {
    const { context, entries } = sources;
    const entryFiles = context
      .getAllFilePaths()
      .filter((filePath) => context.getProjectRelativePath(filePath) === 'artisan')
      .map((filePath) => context.getProjectRelativePath(filePath));
    const routeFiles = filesWhere(entries, ({ filePath }) => /^routes\/.+\.php$/i.test(filePath));
    const controllerFiles = filesWhere(entries, ({ filePath }) =>
      /^app\/Http\/Controllers\/.+\.php$/i.test(filePath)
    );
    const modelFiles = filesWhere(
      entries,
      ({ filePath, text }) =>
        /^app\/Models\/.+\.php$/i.test(filePath) || /\bextends\s+Model\b/.test(text)
    );
    const configFiles = configFilesNamed(context, ['composer.json']);

    return {
      summary: `Detected ${routeFiles.length} Laravel route files, ${controllerFiles.length} controllers, and ${modelFiles.length} models.`,
      details: {
        entryFiles,
        configFiles: toRelativeList(context, configFiles),
        components: controllerFiles,
        modules: modelFiles,
        relationships: [
          ...entryLinks(sources, entryFiles, routeFiles, 'laravel_artisan_routes'),
          ...targetLinks(
            sources,
            routeFiles,
            extractLaravelControllerTargets,
            symbolsOfFiles(sources, controllerFiles),
            'laravel_route_controller'
          ),
          ...referenceLinks(
            sources,
            controllerFiles,
            symbolsOfFiles(sources, modelFiles),
            'laravel_controller_model',
            'file'
          ),
          ...configEntryLinks(sources, configFiles, entryFiles, 'laravel_config_entry'),
        ],
      },
    };
  },
});

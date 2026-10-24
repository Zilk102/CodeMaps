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
} from './stackTopologySupport';
import {
  configFilesNamed,
  filesMatching,
  filesWhere,
  symbolsOfFiles,
  textOf,
} from './stackTopologySources';
import { configuredFindings, defineFrameworkAdapter } from './stackTopologyAdapterFactory';
import { entryLinks, fileEndpoint, modelUseLinks, targetLinks } from './stackTopologyLinks';

const PYTHON_CONFIG_FILES = ['requirements.txt', 'requirements-dev.txt', 'pyproject.toml'];

/** A framework adapter named `<name> Topology` that reads the files with the given extension. */
const scriptingAdapter = (
  stackId: string,
  name: string,
  extensions: RegExp,
  describe: Parameters<typeof defineFrameworkAdapter>[0]['describe']
) =>
  defineFrameworkAdapter({
    id: `${stackId}-topology`,
    displayName: `${name} Topology`,
    stackId,
    extensions,
    describe,
  });

export const fastApiAdapter = scriptingAdapter('fastapi', 'FastAPI', /\.py$/i, (sources) => {
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

  return configuredFindings(sources, {
    summary: `Detected ${entryFiles.length} FastAPI app entrypoints, ${routerFiles.length} router files, and ${routeFiles.length} route-bearing modules.`,
    entryFiles,
    configFiles,
    configReason: 'fastapi_config_entry',
    details: {
      routes: routeFiles,
      modules: routerFiles,
      relationships: [...entryRouterLinks, ...routerHandlerLinks],
    },
  });
});

export const djangoAdapter = scriptingAdapter('django', 'Django', /\.py$/i, (sources) => {
  const { context, entries } = sources;
  const manageFiles = filesWhere(entries, ({ filePath }) => basename(filePath) === 'manage.py');
  const settingsFiles = filesWhere(entries, ({ filePath }) => basename(filePath) === 'settings.py');
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

  return configuredFindings(sources, {
    summary: `Detected ${manageFiles.length} Django entry files, ${urlFiles.length} URL modules, ${viewFiles.length} view modules, and ${modelFiles.length} model modules.`,
    entryFiles: manageFiles,
    configFiles,
    otherConfigFiles: settingsFiles,
    configReason: 'django_config_entry',
    details: {
      components: viewFiles,
      modules: [...urlFiles, ...modelFiles],
      relationships: [
        ...entryLinks(sources, manageFiles, settingsFiles, 'django_manage_settings'),
        ...entryLinks(sources, settingsFiles, urlFiles, 'django_settings_urls'),
        ...urlViewLinks,
        ...modelUseLinks(sources, participatingViewFiles, modelFiles, 'django_view_model'),
      ],
    },
  });
});

export const railsAdapter = scriptingAdapter('rails', 'Rails', /\.rb$/i, (sources) => {
  const { entries } = sources;
  const routeFiles = filesWhere(entries, ({ filePath }) => filePath === 'config/routes.rb');
  const entryFiles = filesWhere(entries, ({ filePath }) =>
    ['config/application.rb', 'config/environment.rb'].includes(filePath)
  );
  const controllerFiles = filesWhere(entries, ({ filePath }) =>
    /^app\/controllers\/.+_controller\.rb$/i.test(filePath)
  );
  const modelFiles = filesWhere(entries, ({ filePath }) => /^app\/models\/.+\.rb$/i.test(filePath));

  const routeControllerLinks = routeFiles.flatMap((routeFile) =>
    extractRailsResourceTargets(textOf(sources, routeFile)).flatMap((resourceName) =>
      entryLinks(
        sources,
        [routeFile],
        controllerFiles.filter(
          (controllerFile) =>
            basename(controllerFile).toLowerCase() === `${resourceName.toLowerCase()}_controller.rb`
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
        ...modelUseLinks(sources, controllerFiles, modelFiles, 'rails_controller_model'),
      ],
    },
  };
});

export const laravelAdapter = scriptingAdapter('laravel', 'Laravel', /\.php$/i, (sources) => {
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

  return configuredFindings(sources, {
    summary: `Detected ${routeFiles.length} Laravel route files, ${controllerFiles.length} controllers, and ${modelFiles.length} models.`,
    entryFiles,
    configFiles,
    configReason: 'laravel_config_entry',
    details: {
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
        ...modelUseLinks(sources, controllerFiles, modelFiles, 'laravel_controller_model'),
      ],
    },
  });
});

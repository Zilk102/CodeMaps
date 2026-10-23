export * from './stackTopologySupport';

import {
  createRelationship,
  extractAspNetRouteMethods,
  extractAspNetServiceRegistrations,
  StackAdapter,
  toRelativeList,
} from './stackTopologySupport';
import {
  classEndpoint,
  defineFrameworkAdapter,
  entryLinks,
  fileEndpoint,
  filesMatching,
  filesWhere,
  methodLinks,
  referenceLinks,
  symbolsOfFiles,
  textOf,
  type AdapterSources,
} from './stackTopologyAdapterKit';
import { POLYGLOT_FRAMEWORK_STACK_ADAPTERS } from './stackTopologyPolyglotFrameworkAdapters';
import { nextJsAdapter, nestJsAdapter } from './stackTopologyJsFrameworkAdapters';
import {
  springBootAdapter,
  ktorAdapter,
  micronautAdapter,
  quarkusAdapter,
} from './stackTopologyJvmFrameworkAdapters';

/** `AddScoped<IFoo, Foo>()` registrations in the program file: contract and implementation links. */
const serviceRegistrationLinks = (
  sources: AdapterSources,
  programFiles: string[],
  serviceSymbols: Map<string, string>
) =>
  programFiles.flatMap((programFile) => {
    const programText = textOf(sources, programFile);
    const programEndpoint = classEndpoint(sources, programFile);
    const linkTo = (symbol: string, reason: string) => {
      const file = serviceSymbols.get(symbol);
      return file === undefined
        ? []
        : [
            createRelationship(
              programEndpoint,
              fileEndpoint(sources, file, symbol),
              'framework',
              reason
            ),
          ];
    };

    return extractAspNetServiceRegistrations(programText).flatMap(
      ({ contract, implementation }) => [
        ...linkTo(contract, 'aspnet_service_contract'),
        ...linkTo(implementation, 'aspnet_service_registration'),
      ]
    );
  });

const aspNetAdapter: StackAdapter = defineFrameworkAdapter({
  id: 'aspnet-core-topology',
  displayName: 'ASP.NET Core Topology',
  stackId: 'aspnet-core',
  extensions: /\.(cs)$/i,
  describe: (sources) => {
    const { context, entries } = sources;
    const programFiles = filesMatching(
      entries,
      /WebApplication\.CreateBuilder|Host\.CreateDefaultBuilder|CreateHostBuilder/
    );
    const controllers = filesMatching(entries, /\[ApiController\]|ControllerBase|: Controller\b/);
    const minimalApis = filesMatching(entries, /Map(Get|Post|Put|Delete|Group)\s*\(/);
    const serviceCandidates = filesWhere(
      entries,
      ({ filePath, text }) =>
        /service/i.test(filePath) ||
        /\b(?:class|interface)\s+I?[A-Z][A-Za-z0-9_]*Service\b/.test(text)
    );
    const projectFiles = context
      .getAllFilePaths()
      .filter((filePath) => /\.(csproj|sln)$/i.test(filePath));
    const serviceSymbols = symbolsOfFiles(sources, serviceCandidates);

    return {
      summary: `Detected ${controllers.length} controller files, ${minimalApis.length} minimal API candidates, and ${projectFiles.length} .NET project descriptors.`,
      details: {
        entryFiles: programFiles,
        configFiles: toRelativeList(context, projectFiles),
        components: controllers,
        routes: minimalApis,
        relationships: [
          ...entryLinks(
            sources,
            programFiles,
            [...controllers, ...minimalApis],
            'aspnet_entry_runtime',
            {
              entry: 'class',
              target: 'class',
            }
          ),
          ...referenceLinks(sources, controllers, serviceSymbols, 'aspnet_controller_service'),
          ...methodLinks(
            sources,
            controllers,
            extractAspNetRouteMethods,
            'aspnet_controller_method'
          ),
          ...serviceRegistrationLinks(sources, programFiles, serviceSymbols),
          ...projectFiles.map((projectFile) => ({
            source: context.getProjectRelativePath(projectFile),
            target: programFiles[0]
              ? fileEndpoint(sources, programFiles[0])
              : context.getProjectRelativePath(projectFile),
            type: 'build' as const,
            reason: 'dotnet_project_entry',
          })),
        ],
      },
    };
  },
});

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

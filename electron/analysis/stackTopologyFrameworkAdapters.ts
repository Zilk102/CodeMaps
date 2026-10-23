export * from './stackTopologySupport';

import {
  buildGraphSymbolIndex,
  buildSymbolToFileMap,
  createInsight,
  createRelationship,
  extractAspNetRouteMethods,
  extractAspNetServiceRegistrations,
  findReferencedSymbolMatches,
  getContentByRelativePath,
  inferClassSymbolsForFile,
  resolveSymbolEndpoint,
  StackAdapter,
  toRelativeList,
} from './stackTopologySupport';
import { POLYGLOT_FRAMEWORK_STACK_ADAPTERS } from './stackTopologyPolyglotFrameworkAdapters';
import { nextJsAdapter, nestJsAdapter } from './stackTopologyJsFrameworkAdapters';
import {
  springBootAdapter,
  ktorAdapter,
  micronautAdapter,
  quarkusAdapter,
} from './stackTopologyJvmFrameworkAdapters';

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
      .filter(({ text }) =>
        /WebApplication\.CreateBuilder|Host\.CreateDefaultBuilder|CreateHostBuilder/.test(text)
      )
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
          'aspnet_controller_service'
        )
      )
    );
    const controllerMethodLinks = controllers.flatMap((controllerFile) =>
      extractAspNetRouteMethods(contentByRelativePath.get(controllerFile) || '').map((methodName) =>
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
          'aspnet_controller_method'
        )
      )
    );
    const serviceRegistrationLinks = programFiles.flatMap((programFile) => {
      const programText = contentByRelativePath.get(programFile) || '';
      const programEndpoint = resolveSymbolEndpoint(programFile, graphSymbolIndex, {
        preferredSymbols: inferClassSymbolsForFile(programText),
      });

      return extractAspNetServiceRegistrations(programText).flatMap(
        ({ contract, implementation }) => {
          const matchingContract = Array.from(serviceSymbols.entries()).find(
            ([symbol]) => symbol === contract
          );
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
        }
      );
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
                  preferredSymbols: inferClassSymbolsForFile(
                    contentByRelativePath.get(entryFile) || ''
                  ),
                }),
                resolveSymbolEndpoint(targetFile, graphSymbolIndex, {
                  preferredSymbols: inferClassSymbolsForFile(
                    contentByRelativePath.get(targetFile) || ''
                  ),
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

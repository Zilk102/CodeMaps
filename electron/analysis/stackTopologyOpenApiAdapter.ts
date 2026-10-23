import * as path from 'path';
import {
  buildIdentifierVariants,
  createInsight,
  createRelationship,
  findMatchingIdentifierSymbols,
  matchesIdentifierVariantInText,
  resolveSymbolEndpoint,
  type StackAdapter,
  type StackStructuralRelationship,
} from './stackTopologySupport';
import { loadSources } from './stackTopologyAdapterKit';
import {
  OPENAPI_GENERATOR_CONFIG_BASENAMES,
  isLikelyOpenApiSpec,
  extractOpenApiOperationIds,
  extractOpenApiRuntimeSymbols,
  isGeneratedOpenApiModule,
} from './stackTopologyContractSupport';

export const openApiAdapter: StackAdapter = {
  id: 'openapi-contract-topology',
  displayName: 'OpenAPI Contract Topology',
  category: 'build',
  supports: (context) => !!context.getDetectedStack('openapi'),
  analyze: async (context) => {
    const sources = await loadSources(
      context,
      /\.(yaml|yml|json|ts|tsx|js|jsx|java|kt|go|py|cs)$/i
    );
    const { graphSymbolIndex, entries: relativeEntries } = sources;
    const specEntries = relativeEntries.filter((entry) =>
      isLikelyOpenApiSpec(entry.filePath, entry.text)
    );
    const configFiles = relativeEntries
      .filter((entry) =>
        OPENAPI_GENERATOR_CONFIG_BASENAMES.has(path.posix.basename(entry.filePath))
      )
      .map((entry) => entry.filePath);
    const generatedEntries = relativeEntries.filter(
      (entry) =>
        !specEntries.some((spec) => spec.filePath === entry.filePath) &&
        isGeneratedOpenApiModule(entry.filePath, entry.text)
    );
    const runtimeEntries = relativeEntries.filter(
      (entry) =>
        !specEntries.some((spec) => spec.filePath === entry.filePath) &&
        !generatedEntries.some((generatedEntry) => generatedEntry.filePath === entry.filePath) &&
        /\.(ts|tsx|js|jsx|java|kt|go|py|cs|rb|php|rs)$/i.test(entry.filePath)
    );

    const relationships: StackStructuralRelationship[] = [
      ...configFiles.flatMap((configFile) =>
        specEntries.map((specEntry) =>
          createRelationship(configFile, specEntry.filePath, 'build', 'openapi_codegen_spec')
        )
      ),
      ...specEntries.flatMap((specEntry) => {
        const operationIds = extractOpenApiOperationIds(specEntry.text);
        return generatedEntries.flatMap((generatedEntry) =>
          operationIds.flatMap((operationId) =>
            matchesIdentifierVariantInText(generatedEntry.text, operationId)
              ? [
                  createRelationship(
                    specEntry.filePath,
                    generatedEntry.filePath,
                    'build',
                    'openapi_generated_module'
                  ),
                  createRelationship(
                    specEntry.filePath,
                    resolveSymbolEndpoint(generatedEntry.filePath, graphSymbolIndex, {
                      preferredSymbols: buildIdentifierVariants(operationId),
                    }),
                    'build',
                    'openapi_operation_symbol'
                  ),
                ]
              : []
          )
        );
      }),
      ...specEntries.flatMap((specEntry) => {
        const operationIds = extractOpenApiOperationIds(specEntry.text);
        return runtimeEntries.flatMap((runtimeEntry) =>
          operationIds.flatMap((operationId) => {
            const runtimeSymbols = extractOpenApiRuntimeSymbols(
              runtimeEntry.filePath,
              runtimeEntry.text
            );
            const matchingSymbols = findMatchingIdentifierSymbols(runtimeSymbols, operationId);
            const matchesOperationId =
              matchesIdentifierVariantInText(runtimeEntry.text, operationId) ||
              matchingSymbols.length > 0;
            return matchesOperationId
              ? [
                  createRelationship(
                    specEntry.filePath,
                    resolveSymbolEndpoint(runtimeEntry.filePath, graphSymbolIndex, {
                      preferredSymbols: [
                        ...matchingSymbols,
                        ...buildIdentifierVariants(operationId),
                      ],
                    }),
                    'framework',
                    'openapi_operation_runtime_binding'
                  ),
                ]
              : [];
          })
        );
      }),
    ];

    return createInsight(
      openApiAdapter.id,
      openApiAdapter.displayName,
      openApiAdapter.category,
      `Detected ${specEntries.length} OpenAPI specs, ${configFiles.length} codegen configs, and ${generatedEntries.length} generated contract-aware modules.`,
      {
        evidence: context.getDetectedStack('openapi')?.evidence || [],
        entryFiles: specEntries.map((entry) => entry.filePath),
        configFiles,
        modules: generatedEntries.map((entry) => entry.filePath),
        relationships,
      }
    );
  },
};

import {
  buildIdentifierVariants,
  findMatchingIdentifierSymbols,
  matchesIdentifierVariantInText,
  type FileContentEntry,
} from './stackTopologySupport';
import { defineSourceAdapter } from './stackTopologyAdapterFactory';
import { fanOutLinks } from './stackTopologyLinks';
import { type AdapterSources } from './stackTopologySources';
import { contractBindingLinks } from './stackTopologyContractLinks';
import {
  OPENAPI_GENERATOR_CONFIG_BASENAMES,
  isLikelyOpenApiSpec,
  extractOpenApiOperationIds,
  extractOpenApiRuntimeSymbols,
  isGeneratedOpenApiModule,
} from './stackTopologyContractSupport';

const RUNTIME_SOURCES = /\.(ts|tsx|js|jsx|java|kt|go|py|cs|rb|php|rs)$/i;

/** Specs bind to generated modules (build) and to hand-written handlers (framework) by operation id. */
const operationLinks = (
  sources: AdapterSources,
  specEntries: FileContentEntry[],
  generatedEntries: FileContentEntry[],
  runtimeEntries: FileContentEntry[]
) => [
  ...contractBindingLinks(sources, {
    contracts: specEntries,
    implementations: generatedEntries,
    namesOf: (spec) => extractOpenApiOperationIds(spec.text),
    bind: (generated, operationId) =>
      matchesIdentifierVariantInText(generated.text, operationId)
        ? buildIdentifierVariants(operationId)
        : null,
    type: 'build',
    fileReason: 'openapi_generated_module',
    symbolReason: 'openapi_operation_symbol',
  }),
  ...contractBindingLinks(sources, {
    contracts: specEntries,
    implementations: runtimeEntries,
    namesOf: (spec) => extractOpenApiOperationIds(spec.text),
    bind: (runtime, operationId) => {
      const runtimeSymbols = extractOpenApiRuntimeSymbols(runtime.filePath, runtime.text);
      const matchingSymbols = findMatchingIdentifierSymbols(runtimeSymbols, operationId);
      return matchesIdentifierVariantInText(runtime.text, operationId) || matchingSymbols.length > 0
        ? [...matchingSymbols, ...buildIdentifierVariants(operationId)]
        : null;
    },
    type: 'framework',
    symbolReason: 'openapi_operation_runtime_binding',
  }),
];

export const openApiAdapter = defineSourceAdapter('build', {
  id: 'openapi-contract-topology',
  displayName: 'OpenAPI Contract Topology',
  stackId: 'openapi',
  extensions: /\.(yaml|yml|json|ts|tsx|js|jsx|java|kt|go|py|cs)$/i,
  configBasenames: OPENAPI_GENERATOR_CONFIG_BASENAMES,
  describe: (sources, configFiles) => {
    const { entries } = sources;
    const specEntries = entries.filter((entry) => isLikelyOpenApiSpec(entry.filePath, entry.text));
    const generatedEntries = entries.filter(
      (entry) =>
        !specEntries.some((spec) => spec.filePath === entry.filePath) &&
        isGeneratedOpenApiModule(entry.filePath, entry.text)
    );
    const runtimeEntries = entries.filter(
      (entry) =>
        !specEntries.some((spec) => spec.filePath === entry.filePath) &&
        !generatedEntries.some((generatedEntry) => generatedEntry.filePath === entry.filePath) &&
        RUNTIME_SOURCES.test(entry.filePath)
    );

    return {
      summary: `Detected ${specEntries.length} OpenAPI specs, ${configFiles.length} codegen configs, and ${generatedEntries.length} generated contract-aware modules.`,
      details: {
        entryFiles: specEntries.map((entry) => entry.filePath),
        configFiles,
        modules: generatedEntries.map((entry) => entry.filePath),
        relationships: [
          ...fanOutLinks(
            configFiles,
            specEntries.map((spec) => spec.filePath),
            'openapi_codegen_spec'
          ),
          ...operationLinks(sources, specEntries, generatedEntries, runtimeEntries),
        ],
      },
    };
  },
});

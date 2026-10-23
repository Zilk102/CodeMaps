import * as path from 'path';
import {
  buildIdentifierVariants,
  containsIdentifierVariantInNormalizedText,
  createInsight,
  createRelationship,
  resolveSymbolEndpoint,
  type StackAdapter,
  type StackStructuralRelationship,
} from './stackTopologySupport';
import { loadSources } from './stackTopologyAdapterKit';
import {
  PROTOBUF_CONFIG_BASENAMES,
  extractConnectRuntimeSymbols,
  extractGrpcWebRuntimeSymbols,
  matchesProtoRuntimeEntry,
  extractProtoRuntimeSymbols,
  extractProtoServiceNames,
  extractBufOutputDirs,
  normalizeProtoGeneratedStem,
  isGeneratedProtoModule,
  isConnectGeneratedModule,
  isGrpcWebGeneratedModule,
  isConnectRuntimeEntry,
  isGrpcWebRuntimeEntry,
} from './stackTopologyContractSupport';

export const protobufAdapter: StackAdapter = {
  id: 'protobuf-contract-topology',
  displayName: 'Protocol Buffers Contract Topology',
  category: 'build',
  supports: (context) => !!context.getDetectedStack('protobuf'),
  analyze: async (context) => {
    const sources = await loadSources(
      context,
      /\.(proto|ts|tsx|js|jsx|go|java|kt|cs|py|yaml|yml)$/i
    );
    const { graphSymbolIndex, entries: relativeEntries } = sources;
    const protoEntries = relativeEntries.filter((entry) => entry.filePath.endsWith('.proto'));
    const configFiles = relativeEntries
      .filter((entry) => PROTOBUF_CONFIG_BASENAMES.has(path.posix.basename(entry.filePath)))
      .map((entry) => entry.filePath);
    const bufOutputDirs = relativeEntries
      .filter((entry) => path.posix.basename(entry.filePath) === 'buf.gen.yaml')
      .flatMap((entry) => extractBufOutputDirs(entry.text));
    const generatedEntries = relativeEntries.filter(
      (entry) =>
        !entry.filePath.endsWith('.proto') && isGeneratedProtoModule(entry.filePath, entry.text)
    );
    const connectGeneratedEntries = generatedEntries.filter((entry) =>
      isConnectGeneratedModule(entry.filePath, entry.text)
    );
    const grpcWebGeneratedEntries = generatedEntries.filter((entry) =>
      isGrpcWebGeneratedModule(entry.filePath, entry.text)
    );
    const runtimeEntries = relativeEntries.filter(
      (entry) =>
        !entry.filePath.endsWith('.proto') &&
        !generatedEntries.some((generatedEntry) => generatedEntry.filePath === entry.filePath)
    );
    const connectRuntimeEntries = runtimeEntries.filter((entry) =>
      isConnectRuntimeEntry(entry.text)
    );
    const grpcWebRuntimeEntries = runtimeEntries.filter((entry) =>
      isGrpcWebRuntimeEntry(entry.text)
    );

    const relationships: StackStructuralRelationship[] = [
      ...configFiles.flatMap((configFile) =>
        protoEntries.map((protoEntry) =>
          createRelationship(configFile, protoEntry.filePath, 'build', 'protobuf_config_schema')
        )
      ),
      ...configFiles.flatMap((configFile) =>
        bufOutputDirs.flatMap((outputDir) =>
          generatedEntries
            .filter((generatedEntry) =>
              generatedEntry.filePath.startsWith(`${outputDir.replace(/\/+$/, '')}/`)
            )
            .map((generatedEntry) =>
              createRelationship(configFile, generatedEntry.filePath, 'build', 'buf_codegen_output')
            )
        )
      ),
      ...protoEntries.flatMap((protoEntry) => {
        const protoStem = path.posix.basename(protoEntry.filePath, '.proto');
        return generatedEntries.flatMap((generatedEntry) =>
          normalizeProtoGeneratedStem(generatedEntry.filePath).toLowerCase() ===
          protoStem.toLowerCase()
            ? [
                createRelationship(
                  protoEntry.filePath,
                  generatedEntry.filePath,
                  'build',
                  'protobuf_generated_module'
                ),
              ]
            : []
        );
      }),
      ...protoEntries.flatMap((protoEntry) => {
        const protoStem = path.posix.basename(protoEntry.filePath, '.proto').toLowerCase();
        return connectGeneratedEntries.flatMap((generatedEntry) =>
          normalizeProtoGeneratedStem(generatedEntry.filePath).toLowerCase() === protoStem
            ? [
                createRelationship(
                  protoEntry.filePath,
                  generatedEntry.filePath,
                  'build',
                  'connectrpc_generated_module'
                ),
              ]
            : []
        );
      }),
      ...protoEntries.flatMap((protoEntry) => {
        const protoStem = path.posix.basename(protoEntry.filePath, '.proto').toLowerCase();
        const serviceNames = extractProtoServiceNames(protoEntry.text);
        return grpcWebGeneratedEntries.flatMap((generatedEntry) =>
          serviceNames.flatMap((serviceName) =>
            normalizeProtoGeneratedStem(generatedEntry.filePath).toLowerCase() === protoStem
              ? [
                  createRelationship(
                    protoEntry.filePath,
                    generatedEntry.filePath,
                    'build',
                    'grpc_web_generated_module'
                  ),
                  createRelationship(
                    protoEntry.filePath,
                    resolveSymbolEndpoint(generatedEntry.filePath, graphSymbolIndex, {
                      preferredSymbols: [serviceName],
                    }),
                    'build',
                    'proto_service_symbol'
                  ),
                ]
              : []
          )
        );
      }),
      ...protoEntries.flatMap((protoEntry) => {
        const serviceNames = extractProtoServiceNames(protoEntry.text);
        return grpcWebGeneratedEntries.flatMap((generatedEntry) =>
          serviceNames.flatMap((serviceName) => {
            const matchesService =
              normalizeProtoGeneratedStem(generatedEntry.filePath).toLowerCase() ===
              path.posix.basename(protoEntry.filePath, '.proto').toLowerCase();
            return matchesService
              ? [
                  createRelationship(
                    protoEntry.filePath,
                    resolveSymbolEndpoint(generatedEntry.filePath, graphSymbolIndex, {
                      preferredSymbols: [`${serviceName}PromiseClient`, serviceName],
                    }),
                    'build',
                    'proto_client_symbol'
                  ),
                ]
              : [];
          })
        );
      }),
      ...protoEntries.flatMap((protoEntry) => {
        const serviceNames = extractProtoServiceNames(protoEntry.text);
        return runtimeEntries.flatMap((runtimeEntry) =>
          serviceNames.flatMap((serviceName) => {
            const runtimeSymbols = extractProtoRuntimeSymbols(
              runtimeEntry.filePath,
              runtimeEntry.text,
              serviceName
            );
            return matchesProtoRuntimeEntry(runtimeEntry.text, serviceName)
              ? [
                  createRelationship(
                    protoEntry.filePath,
                    runtimeEntry.filePath,
                    'framework',
                    'proto_service_runtime_binding'
                  ),
                  createRelationship(
                    protoEntry.filePath,
                    resolveSymbolEndpoint(runtimeEntry.filePath, graphSymbolIndex, {
                      preferredSymbols: [
                        ...runtimeSymbols,
                        ...buildIdentifierVariants(serviceName),
                      ],
                    }),
                    'framework',
                    'proto_server_symbol'
                  ),
                ]
              : [];
          })
        );
      }),
      ...protoEntries.flatMap((protoEntry) => {
        const serviceNames = extractProtoServiceNames(protoEntry.text);
        return connectRuntimeEntries.flatMap((runtimeEntry) =>
          serviceNames.flatMap((serviceName) =>
            containsIdentifierVariantInNormalizedText(runtimeEntry.text, serviceName) &&
            (runtimeEntry.text.includes('createPromiseClient(') ||
              runtimeEntry.text.includes('createConnectTransport(') ||
              runtimeEntry.text.includes('connectNodeAdapter('))
              ? [
                  createRelationship(
                    protoEntry.filePath,
                    runtimeEntry.filePath,
                    'framework',
                    'connectrpc_runtime_binding'
                  ),
                  createRelationship(
                    protoEntry.filePath,
                    resolveSymbolEndpoint(runtimeEntry.filePath, graphSymbolIndex, {
                      preferredSymbols: extractConnectRuntimeSymbols(runtimeEntry.text),
                    }),
                    'framework',
                    'connectrpc_client_symbol'
                  ),
                ]
              : []
          )
        );
      }),
      ...protoEntries.flatMap((protoEntry) => {
        const serviceNames = extractProtoServiceNames(protoEntry.text);
        return grpcWebRuntimeEntries.flatMap((runtimeEntry) =>
          serviceNames.flatMap((serviceName) =>
            containsIdentifierVariantInNormalizedText(runtimeEntry.text, serviceName) &&
            (runtimeEntry.text.includes('GrpcWebFetchTransport(') ||
              runtimeEntry.text.includes('grpc.unary(') ||
              runtimeEntry.text.includes('grpc.invoke(') ||
              runtimeEntry.text.includes('Client('))
              ? [
                  createRelationship(
                    protoEntry.filePath,
                    runtimeEntry.filePath,
                    'framework',
                    'grpc_web_runtime_binding'
                  ),
                  createRelationship(
                    protoEntry.filePath,
                    resolveSymbolEndpoint(runtimeEntry.filePath, graphSymbolIndex, {
                      preferredSymbols: extractGrpcWebRuntimeSymbols(runtimeEntry.text),
                    }),
                    'framework',
                    'grpc_web_client_symbol'
                  ),
                ]
              : []
          )
        );
      }),
    ];

    return createInsight(
      protobufAdapter.id,
      protobufAdapter.displayName,
      protobufAdapter.category,
      `Detected ${protoEntries.length} proto schemas, ${generatedEntries.length} generated protobuf modules, ${bufOutputDirs.length} Buf output directories, and ${relationships.length} contract/runtime relationships.`,
      {
        evidence: context.getDetectedStack('protobuf')?.evidence || [],
        entryFiles: protoEntries.map((entry) => entry.filePath),
        configFiles,
        modules: generatedEntries.map((entry) => entry.filePath),
        relationships,
      }
    );
  },
};

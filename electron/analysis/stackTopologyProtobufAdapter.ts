import * as path from 'path';
import {
  buildIdentifierVariants,
  containsIdentifierVariantInNormalizedText,
  createRelationship,
  type FileContentEntry,
} from './stackTopologySupport';
import { defineSourceAdapter } from './stackTopologyAdapterFactory';
import { fanOutLinks } from './stackTopologyLinks';
import { type AdapterSources } from './stackTopologySources';
import { contractBindingLinks } from './stackTopologyContractLinks';
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

const CONNECT_CLIENT_MARKERS = [
  'createPromiseClient(',
  'createConnectTransport(',
  'connectNodeAdapter(',
];
const GRPC_WEB_CLIENT_MARKERS = [
  'GrpcWebFetchTransport(',
  'grpc.unary(',
  'grpc.invoke(',
  'Client(',
];

const protoStemOf = (proto: FileContentEntry) =>
  path.posix.basename(proto.filePath, '.proto').toLowerCase();
const generatedStemOf = (generated: FileContentEntry) =>
  normalizeProtoGeneratedStem(generated.filePath).toLowerCase();

/** The proto files, the generated modules (and their flavours) and the hand-written runtime files. */
const classifyProtoEntries = (entries: FileContentEntry[]) => {
  const protoEntries = entries.filter((entry) => entry.filePath.endsWith('.proto'));
  const generatedEntries = entries.filter(
    (entry) =>
      !entry.filePath.endsWith('.proto') && isGeneratedProtoModule(entry.filePath, entry.text)
  );
  const runtimeEntries = entries.filter(
    (entry) =>
      !entry.filePath.endsWith('.proto') &&
      !generatedEntries.some((generatedEntry) => generatedEntry.filePath === entry.filePath)
  );
  return {
    protoEntries,
    generatedEntries,
    connectGeneratedEntries: generatedEntries.filter((entry) =>
      isConnectGeneratedModule(entry.filePath, entry.text)
    ),
    grpcWebGeneratedEntries: generatedEntries.filter((entry) =>
      isGrpcWebGeneratedModule(entry.filePath, entry.text)
    ),
    connectRuntimeEntries: runtimeEntries.filter((entry) => isConnectRuntimeEntry(entry.text)),
    grpcWebRuntimeEntries: runtimeEntries.filter((entry) => isGrpcWebRuntimeEntry(entry.text)),
    runtimeEntries,
  };
};

type ProtoEntries = ReturnType<typeof classifyProtoEntries>;

/** A proto file links to the generated modules that carry its name. */
const generatedModuleLinks = (
  sources: AdapterSources,
  protoEntries: FileContentEntry[],
  generatedEntries: FileContentEntry[],
  reason: string
) =>
  contractBindingLinks(sources, {
    contracts: protoEntries,
    implementations: generatedEntries,
    namesOf: (proto) => [protoStemOf(proto)],
    bind: (generated, stem) => (generatedStemOf(generated) === stem ? [] : null),
    type: 'build',
    fileReason: reason,
  });

/** A proto file links to the grpc-web modules generated for it and to the symbols of its services. */
const grpcWebGeneratedLinks = (sources: AdapterSources, entries: ProtoEntries) => {
  const spec = {
    contracts: entries.protoEntries,
    implementations: entries.grpcWebGeneratedEntries,
    namesOf: (proto: FileContentEntry) => extractProtoServiceNames(proto.text),
    type: 'build' as const,
  };
  const sameStem = (generated: FileContentEntry, proto: FileContentEntry) =>
    generatedStemOf(generated) === protoStemOf(proto);
  return [
    ...contractBindingLinks(sources, {
      ...spec,
      bind: (generated, name, proto) => (sameStem(generated, proto) ? [name] : null),
      fileReason: 'grpc_web_generated_module',
      symbolReason: 'proto_service_symbol',
    }),
    ...contractBindingLinks(sources, {
      ...spec,
      bind: (generated, name, proto) =>
        sameStem(generated, proto) ? [`${name}PromiseClient`, name] : null,
      symbolReason: 'proto_client_symbol',
    }),
  ];
};

/** A proto file links to the runtime files that use one of its services through a generated client. */
const clientRuntimeLinks = (
  sources: AdapterSources,
  protoEntries: FileContentEntry[],
  runtimeEntries: FileContentEntry[],
  markers: string[],
  extractSymbols: (text: string) => string[],
  reasons: { file: string; symbol: string }
) =>
  contractBindingLinks(sources, {
    contracts: protoEntries,
    implementations: runtimeEntries,
    namesOf: (proto) => extractProtoServiceNames(proto.text),
    bind: (runtime, name) =>
      containsIdentifierVariantInNormalizedText(runtime.text, name) &&
      markers.some((marker) => runtime.text.includes(marker))
        ? extractSymbols(runtime.text)
        : null,
    type: 'framework',
    fileReason: reasons.file,
    symbolReason: reasons.symbol,
  });

/** A proto file links to the runtime files that serve or call its services. */
const runtimeLinks = (sources: AdapterSources, entries: ProtoEntries) => [
  ...contractBindingLinks(sources, {
    contracts: entries.protoEntries,
    implementations: entries.runtimeEntries,
    namesOf: (proto) => extractProtoServiceNames(proto.text),
    bind: (runtime, name) =>
      matchesProtoRuntimeEntry(runtime.text, name)
        ? [
            ...extractProtoRuntimeSymbols(runtime.filePath, runtime.text, name),
            ...buildIdentifierVariants(name),
          ]
        : null,
    type: 'framework',
    fileReason: 'proto_service_runtime_binding',
    symbolReason: 'proto_server_symbol',
  }),
  ...clientRuntimeLinks(
    sources,
    entries.protoEntries,
    entries.connectRuntimeEntries,
    CONNECT_CLIENT_MARKERS,
    extractConnectRuntimeSymbols,
    { file: 'connectrpc_runtime_binding', symbol: 'connectrpc_client_symbol' }
  ),
  ...clientRuntimeLinks(
    sources,
    entries.protoEntries,
    entries.grpcWebRuntimeEntries,
    GRPC_WEB_CLIENT_MARKERS,
    extractGrpcWebRuntimeSymbols,
    { file: 'grpc_web_runtime_binding', symbol: 'grpc_web_client_symbol' }
  ),
];

/** Buf config files link to the generated modules inside their output directories. */
const bufOutputLinks = (
  configFiles: string[],
  bufOutputDirs: string[],
  generatedEntries: FileContentEntry[]
) =>
  configFiles.flatMap((configFile) =>
    bufOutputDirs.flatMap((outputDir) =>
      generatedEntries
        .filter((generatedEntry) =>
          generatedEntry.filePath.startsWith(`${outputDir.replace(/\/+$/, '')}/`)
        )
        .map((generatedEntry) =>
          createRelationship(configFile, generatedEntry.filePath, 'build', 'buf_codegen_output')
        )
    )
  );

export const protobufAdapter = defineSourceAdapter('build', {
  stackId: 'protobuf',
  extensions: /\.(proto|ts|tsx|js|jsx|go|java|kt|cs|py|yaml|yml)$/i,
  configBasenames: PROTOBUF_CONFIG_BASENAMES,
  id: 'protobuf-contract-topology',
  displayName: 'Protocol Buffers Contract Topology',
  describe: (sources, configFiles) => {
    const { entries } = sources;
    const classified = classifyProtoEntries(entries);
    const { protoEntries, generatedEntries } = classified;
    const bufOutputDirs = entries
      .filter((entry) => path.posix.basename(entry.filePath) === 'buf.gen.yaml')
      .flatMap((entry) => extractBufOutputDirs(entry.text));

    const relationships = [
      ...fanOutLinks(
        configFiles,
        protoEntries.map((proto) => proto.filePath),
        'protobuf_config_schema'
      ),
      ...bufOutputLinks(configFiles, bufOutputDirs, generatedEntries),
      ...generatedModuleLinks(sources, protoEntries, generatedEntries, 'protobuf_generated_module'),
      ...generatedModuleLinks(
        sources,
        protoEntries,
        classified.connectGeneratedEntries,
        'connectrpc_generated_module'
      ),
      ...grpcWebGeneratedLinks(sources, classified),
      ...runtimeLinks(sources, classified),
    ];

    return {
      summary: `Detected ${protoEntries.length} proto schemas, ${generatedEntries.length} generated protobuf modules, ${bufOutputDirs.length} Buf output directories, and ${relationships.length} contract/runtime relationships.`,
      details: {
        entryFiles: protoEntries.map((entry) => entry.filePath),
        configFiles,
        modules: generatedEntries.map((entry) => entry.filePath),
        relationships,
      },
    };
  },
});

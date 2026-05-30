import * as path from 'path';

import {
  buildGraphSymbolIndex,
  buildIdentifierVariants,
  containsIdentifierVariantInNormalizedText,
  createInsight,
  createRelationship,
  extractActixHandlerNames,
  extractAspNetRouteMethods,
  extractAxumHandlerNames,
  extractCSharpMethodNames,
  extractFastApiRouteFunctions,
  extractGoFunctionNames,
  extractGoRouteHandlers,
  extractJakartaRouteMethods,
  extractJvmFunctionNames,
  extractKtorRouteFunctions,
  extractMicronautRouteMethods,
  extractPhpMethodNames,
  extractPythonFunctionNames,
  extractRubyMethodNames,
  extractRustFunctionNames,
  extractSpringRouteMethods,
  findContainingIdentifierSymbols,
  findMatchingIdentifierSymbols,
  inferClassSymbolsForFile,
  inferSymbolsForFile,
  matchesIdentifierVariantInText,
  resolveSymbolEndpoint,
  StackAdapter,
  StackStructuralRelationship,
} from './stackTopologySupport';

const OPENAPI_SPEC_BASENAMES = new Set([
  'openapi.yaml',
  'openapi.yml',
  'openapi.json',
  'swagger.yaml',
  'swagger.yml',
  'swagger.json',
]);

const OPENAPI_GENERATOR_CONFIG_BASENAMES = new Set([
  'openapi-generator-config.json',
  'openapi-generator-config.yaml',
  'openapi-generator-config.yml',
  'openapitools.json',
  'swagger-codegen-config.json',
  'swagger-codegen-config.yaml',
  'swagger-codegen-config.yml',
]);

const PROTOBUF_CONFIG_BASENAMES = new Set(['buf.yaml', 'buf.gen.yaml', 'buf.work.yaml']);

const isLikelyOpenApiSpec = (filePath: string, text: string) =>
  OPENAPI_SPEC_BASENAMES.has(path.posix.basename(filePath)) ||
  /\bopenapi:\s*["']?3\./.test(text) ||
  /"openapi"\s*:\s*"3\./.test(text) ||
  /\bswagger:\s*["']?2\./.test(text) ||
  /"swagger"\s*:\s*"2\./.test(text);

const extractOpenApiOperationIds = (text: string) =>
  Array.from(
    new Set([
      ...Array.from(text.matchAll(/\boperationId:\s*([A-Za-z_][A-Za-z0-9_]*)/g))
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value)),
      ...Array.from(text.matchAll(/"operationId"\s*:\s*"([^"]+)"/g))
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value)),
    ])
  );

const extractNamedJsTsSymbols = (text: string) =>
  Array.from(
    new Set([
      ...Array.from(
        text.matchAll(/\bexport\s+(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)
      )
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value)),
      ...Array.from(
        text.matchAll(/\b(?:export\s+)?const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/g)
      )
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value)),
      ...Array.from(text.matchAll(/\b(?:export\s+)?class\s+([A-Z][A-Za-z0-9_]*)\b/g))
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value)),
    ])
  );

const extractConnectRuntimeSymbols = (text: string) =>
  Array.from(
    new Set([
      ...Array.from(
        text.matchAll(/\b(?:export\s+)?const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*createPromiseClient\s*\(/g)
      )
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value)),
      ...Array.from(text.matchAll(/\bcreatePromiseClient\s*\(\s*([A-Z][A-Za-z0-9_]*)\s*,/g))
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value)),
    ])
  );

const extractGrpcWebRuntimeSymbols = (text: string) =>
  Array.from(
    new Set([
      ...Array.from(
        text.matchAll(/\b(?:export\s+)?const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*new\s+[A-Z][A-Za-z0-9_]*Client\s*\(/g)
      )
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value)),
      ...Array.from(text.matchAll(/\bnew\s+([A-Z][A-Za-z0-9_]*Client)\s*\(/g))
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value)),
    ])
  );

const extractGrpcRuntimeSymbols = (text: string, serviceName: string) =>
  Array.from(
    new Set([
      ...Array.from(
        text.matchAll(
          new RegExp(
            `Register${serviceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}Server\\s*\\(\\s*[^,]+,\\s*(?:&\\s*)?([A-Za-z_][A-Za-z0-9_]*)`,
            'g'
          )
        )
      )
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value)),
      ...Array.from(text.matchAll(/\bfunc\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g))
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value)),
    ])
  );

const extractOpenApiRuntimeSymbols = (filePath: string, text: string) => {
  const extension = path.posix.extname(filePath).toLowerCase();

  switch (extension) {
    case '.ts':
    case '.tsx':
    case '.js':
    case '.jsx':
      return extractNamedJsTsSymbols(text);
    case '.py':
      return Array.from(
        new Set([
          ...extractFastApiRouteFunctions(text),
          ...extractPythonFunctionNames(text),
          ...inferClassSymbolsForFile(text),
        ])
      );
    case '.java':
      return Array.from(
        new Set([
          ...extractSpringRouteMethods(text),
          ...extractMicronautRouteMethods(text),
          ...extractJakartaRouteMethods(text),
          ...extractJvmFunctionNames(text),
          ...inferClassSymbolsForFile(text),
        ])
      );
    case '.kt':
      return Array.from(
        new Set([
          ...extractKtorRouteFunctions(text),
          ...extractMicronautRouteMethods(text),
          ...extractJakartaRouteMethods(text),
          ...extractJvmFunctionNames(text),
          ...inferClassSymbolsForFile(text),
        ])
      );
    case '.cs':
      return Array.from(
        new Set([
          ...extractAspNetRouteMethods(text),
          ...extractCSharpMethodNames(text),
          ...inferClassSymbolsForFile(text),
        ])
      );
    case '.go':
      return Array.from(new Set([...extractGoRouteHandlers(text), ...extractGoFunctionNames(text)]));
    case '.rb':
      return Array.from(new Set([...extractRubyMethodNames(text), ...inferClassSymbolsForFile(text)]));
    case '.php':
      return Array.from(new Set([...extractPhpMethodNames(text), ...inferClassSymbolsForFile(text)]));
    case '.rs':
      return Array.from(
        new Set([
          ...extractAxumHandlerNames(text),
          ...extractActixHandlerNames(text),
          ...extractRustFunctionNames(text),
        ])
      );
    default:
      return inferSymbolsForFile(filePath, text);
  }
};

const matchesProtoRuntimeEntry = (text: string, serviceName: string) =>
  containsIdentifierVariantInNormalizedText(text, serviceName) &&
  [
    /Register[A-Z][A-Za-z0-9_]*Server\s*\(/,
    /New[A-Z][A-Za-z0-9_]*Client\s*\(/,
    /\b[A-Z][A-Za-z0-9_]*Client\b/,
    /\b[A-Z][A-Za-z0-9_]*Grpc\b/,
    /\bImplBase\b/,
    /\bBindService\s*\(/,
    /\bServicer\b/,
    /\badd_[A-Z][A-Za-z0-9_]*Servicer_to_server\b/,
    /\bgrpc\b/i,
  ].some((pattern) => pattern.test(text));

const extractProtoRuntimeSymbols = (filePath: string, text: string, serviceName: string) => {
  const extension = path.posix.extname(filePath).toLowerCase();
  const serviceLikeSymbols = findContainingIdentifierSymbols(
    [
      ...inferClassSymbolsForFile(text),
      ...extractGoFunctionNames(text),
      ...extractJvmFunctionNames(text),
      ...extractPythonFunctionNames(text),
      ...extractCSharpMethodNames(text),
      ...extractRustFunctionNames(text),
    ],
    serviceName
  );

  switch (extension) {
    case '.go':
      return Array.from(
        new Set([...extractGrpcRuntimeSymbols(text, serviceName), ...serviceLikeSymbols])
      );
    case '.java':
    case '.kt':
      return Array.from(
        new Set([
          ...serviceLikeSymbols,
          ...extractSpringRouteMethods(text),
          ...extractMicronautRouteMethods(text),
          ...extractJakartaRouteMethods(text),
          ...extractKtorRouteFunctions(text),
        ])
      );
    case '.py':
      return Array.from(new Set([...serviceLikeSymbols, ...extractFastApiRouteFunctions(text)]));
    case '.cs':
      return Array.from(new Set([...serviceLikeSymbols, ...extractAspNetRouteMethods(text)]));
    case '.rs':
      return Array.from(
        new Set([
          ...serviceLikeSymbols,
          ...extractAxumHandlerNames(text),
          ...extractActixHandlerNames(text),
        ])
      );
    default:
      return Array.from(new Set(serviceLikeSymbols));
  }
};

const isGeneratedOpenApiModule = (filePath: string, text: string) =>
  /(?:^|\/)(?:generated|gen|sdk|clients?|openapi)(?:\/|$)/i.test(filePath) ||
  /Generated by OpenAPI Generator|swagger-codegen|openapi-typescript-codegen|orval/i.test(text);

const extractProtoServiceNames = (text: string) =>
  Array.from(
    new Set(
      Array.from(text.matchAll(/^\s*service\s+([A-Z][A-Za-z0-9_]*)\s*\{/gm))
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value))
    )
  );

const extractBufOutputDirs = (text: string) =>
  Array.from(
    new Set(
      Array.from(text.matchAll(/^\s*out:\s*([^\s#]+)\s*$/gm))
        .map((match) => match[1]?.trim().replace(/^['"]|['"]$/g, ''))
        .filter((value): value is string => Boolean(value))
    )
  );

const normalizeProtoGeneratedStem = (filePath: string) =>
  path.posix
    .basename(filePath)
    .replace(/\.(ts|tsx|js|jsx|go|java|kt|cs|py|rb|php)$/i, '')
    .replace(/(?:\.connectweb|\.connect|\.grpc-web)$/i, '')
    .replace(/(?:\.connect)?(?:\.grpc)?\.pb$/i, '')
    .replace(/_pb2(?:_grpc)?$/i, '')
    .replace(/Grpc$/i, '')
    .replace(/Proto$/i, '');

const isGeneratedProtoModule = (filePath: string, text: string) =>
  /\.(?:connectweb|connect|grpc-web)\.(?:ts|js)$/i.test(filePath) ||
  /\.(?:connect\.)?(?:grpc\.)?pb\.(?:ts|js|go|java|kt|cs)$/i.test(filePath) ||
  /_pb2(?:_grpc)?\.py$/i.test(filePath) ||
  /Code generated by protoc|Generated by the protocol buffer compiler|protobufjs|minimal\.js/i.test(text);

const isConnectGeneratedModule = (filePath: string, text: string) =>
  /\.connect(?:web)?\.ts$/i.test(filePath) ||
  /@connectrpc\/connect|createPromiseClient|MethodKind/i.test(text);

const isGrpcWebGeneratedModule = (filePath: string, text: string) =>
  /\.grpc-web\.(?:ts|js)$/i.test(filePath) ||
  /grpc-web|GrpcWebImpl|PromiseClient|UnaryResponse/i.test(text);

const isConnectRuntimeEntry = (text: string) =>
  /createPromiseClient\s*\(|createConnectTransport\s*\(|connectNodeAdapter\s*\(/.test(text);

const isGrpcWebRuntimeEntry = (text: string) =>
  /GrpcWebFetchTransport\s*\(|grpc\.unary\s*\(|grpc\.invoke\s*\(|new\s+[A-Za-z0-9_]+Client\s*\(/.test(text);

export const openApiAdapter: StackAdapter = {
  id: 'openapi-contract-topology',
  displayName: 'OpenAPI Contract Topology',
  category: 'build',
  supports: (context) => !!context.getDetectedStack('openapi'),
  analyze: async (context) => {
    const graphSymbolIndex = buildGraphSymbolIndex(context.graph);
    const candidateFiles = context.getAllFilePaths().filter((filePath) =>
      /\.(yaml|yml|json|ts|tsx|js|jsx|java|kt|go|py|cs)$/i.test(context.getProjectRelativePath(filePath))
    );
    const contents = await context.readTexts(candidateFiles);
    const relativeEntries = contents.map((entry) => ({
      filePath: context.getProjectRelativePath(entry.filePath),
      text: entry.text,
    }));
    const specEntries = relativeEntries.filter((entry) => isLikelyOpenApiSpec(entry.filePath, entry.text));
    const configFiles = relativeEntries
      .filter((entry) => OPENAPI_GENERATOR_CONFIG_BASENAMES.has(path.posix.basename(entry.filePath)))
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
                      preferredSymbols: [...matchingSymbols, ...buildIdentifierVariants(operationId)],
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

export const protobufAdapter: StackAdapter = {
  id: 'protobuf-contract-topology',
  displayName: 'Protocol Buffers Contract Topology',
  category: 'build',
  supports: (context) => !!context.getDetectedStack('protobuf'),
  analyze: async (context) => {
    const graphSymbolIndex = buildGraphSymbolIndex(context.graph);
    const candidateFiles = context.getAllFilePaths().filter((filePath) =>
      /\.(proto|ts|tsx|js|jsx|go|java|kt|cs|py|yaml|yml)$/i.test(context.getProjectRelativePath(filePath))
    );
    const contents = await context.readTexts(candidateFiles);
    const relativeEntries = contents.map((entry) => ({
      filePath: context.getProjectRelativePath(entry.filePath),
      text: entry.text,
    }));
    const protoEntries = relativeEntries.filter((entry) => entry.filePath.endsWith('.proto'));
    const configFiles = relativeEntries
      .filter((entry) => PROTOBUF_CONFIG_BASENAMES.has(path.posix.basename(entry.filePath)))
      .map((entry) => entry.filePath);
    const bufOutputDirs = relativeEntries
      .filter((entry) => path.posix.basename(entry.filePath) === 'buf.gen.yaml')
      .flatMap((entry) => extractBufOutputDirs(entry.text));
    const generatedEntries = relativeEntries.filter(
      (entry) => !entry.filePath.endsWith('.proto') && isGeneratedProtoModule(entry.filePath, entry.text)
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
    const connectRuntimeEntries = runtimeEntries.filter((entry) => isConnectRuntimeEntry(entry.text));
    const grpcWebRuntimeEntries = runtimeEntries.filter((entry) => isGrpcWebRuntimeEntry(entry.text));

    const relationships: StackStructuralRelationship[] = [
      ...configFiles.flatMap((configFile) =>
        protoEntries.map((protoEntry) =>
          createRelationship(configFile, protoEntry.filePath, 'build', 'protobuf_config_schema')
        )
      ),
      ...configFiles.flatMap((configFile) =>
        bufOutputDirs.flatMap((outputDir) =>
          generatedEntries
            .filter((generatedEntry) => generatedEntry.filePath.startsWith(`${outputDir.replace(/\/+$/, '')}/`))
            .map((generatedEntry) =>
              createRelationship(configFile, generatedEntry.filePath, 'build', 'buf_codegen_output')
            )
        )
      ),
      ...protoEntries.flatMap((protoEntry) => {
        const protoStem = path.posix.basename(protoEntry.filePath, '.proto');
        return generatedEntries.flatMap((generatedEntry) =>
          normalizeProtoGeneratedStem(generatedEntry.filePath).toLowerCase() === protoStem.toLowerCase()
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
                      preferredSymbols: [...runtimeSymbols, ...buildIdentifierVariants(serviceName)],
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

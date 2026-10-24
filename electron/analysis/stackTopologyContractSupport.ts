/**
 * Detection and symbol-extraction helpers for API contracts (OpenAPI, protobuf, Connect, gRPC-Web):
 * recognizing specs and generated modules, and finding the runtime code that uses them.
 */
import { uniqueCaptures } from './stackTopologyExtractorBase';

import * as path from 'path';
import {
  containsIdentifierVariantInNormalizedText,
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
  inferClassSymbolsForFile,
  inferSymbolsForFile,
} from './stackTopologySupport';

export const OPENAPI_SPEC_BASENAMES = new Set([
  'openapi.yaml',
  'openapi.yml',
  'openapi.json',
  'swagger.yaml',
  'swagger.yml',
  'swagger.json',
]);

export const OPENAPI_GENERATOR_CONFIG_BASENAMES = new Set([
  'openapi-generator-config.json',
  'openapi-generator-config.yaml',
  'openapi-generator-config.yml',
  'openapitools.json',
  'swagger-codegen-config.json',
  'swagger-codegen-config.yaml',
  'swagger-codegen-config.yml',
]);

export const PROTOBUF_CONFIG_BASENAMES = new Set(['buf.yaml', 'buf.gen.yaml', 'buf.work.yaml']);

/**
 * Whether a file is an OpenAPI/Swagger spec: a conventional file name, or content declaring `openapi: 3.x` or `swagger: 2.x`.
 */
export const isLikelyOpenApiSpec = (filePath: string, text: string) =>
  OPENAPI_SPEC_BASENAMES.has(path.posix.basename(filePath)) ||
  /\bopenapi:\s*["']?3\./.test(text) ||
  /"openapi"\s*:\s*"3\./.test(text) ||
  /\bswagger:\s*["']?2\./.test(text) ||
  /"swagger"\s*:\s*"2\./.test(text);

/** The `operationId` values of an OpenAPI document (YAML or JSON), without duplicates. */
export const extractOpenApiOperationIds = (text: string) =>
  uniqueCaptures(text, [
    /\boperationId:\s*([A-Za-z_][A-Za-z0-9_]*)/g,
    /"operationId"\s*:\s*"([^"]+)"/g,
  ]);

/**
 * Names of exported functions and of constants and classes declared in JS/TS source, without duplicates.
 */
export const extractNamedJsTsSymbols = (text: string) =>
  uniqueCaptures(text, [
    /\bexport\s+(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
    /\b(?:export\s+)?const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/g,
    /\b(?:export\s+)?class\s+([A-Z][A-Za-z0-9_]*)\b/g,
  ]);

/**
 * Connect clients created with `createPromiseClient`: the variable holding the client and the service it is created for.
 */
export const extractConnectRuntimeSymbols = (text: string) =>
  uniqueCaptures(text, [
    /\b(?:export\s+)?const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*createPromiseClient\s*\(/g,
    /\bcreatePromiseClient\s*\(\s*([A-Z][A-Za-z0-9_]*)\s*,/g,
  ]);

/**
 * gRPC-Web clients: variables assigned `new XxxClient(...)` and the client class names instantiated.
 */
export const extractGrpcWebRuntimeSymbols = (text: string) =>
  uniqueCaptures(text, [
    /\b(?:export\s+)?const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*new\s+[A-Z][A-Za-z0-9_]*Client\s*\(/g,
    /\bnew\s+([A-Z][A-Za-z0-9_]*Client)\s*\(/g,
  ]);

/**
 * Go symbols that implement gRPC service `serviceName`: the struct passed to `RegisterXxxServer` plus every top-level `func` name in the text.
 */
export const extractGrpcRuntimeSymbols = (text: string, serviceName: string) =>
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

type SymbolExtractor = (text: string) => string[];

/**
 * Combines symbol extractors into one that returns the union of their results without duplicates.
 */
export const uniqueFrom = (...extractors: SymbolExtractor[]): SymbolExtractor => {
  return (text) => Array.from(new Set(extractors.flatMap((extract) => extract(text))));
};

export const JVM_ROUTE_SYMBOLS = [
  extractMicronautRouteMethods,
  extractJakartaRouteMethods,
  extractJvmFunctionNames,
  inferClassSymbolsForFile,
];

export const RUNTIME_SYMBOL_EXTRACTORS = new Map<string, SymbolExtractor>([
  ...['.ts', '.tsx', '.js', '.jsx'].map((ext): [string, SymbolExtractor] => [
    ext,
    extractNamedJsTsSymbols,
  ]),
  [
    '.py',
    uniqueFrom(extractFastApiRouteFunctions, extractPythonFunctionNames, inferClassSymbolsForFile),
  ],
  ['.java', uniqueFrom(extractSpringRouteMethods, ...JVM_ROUTE_SYMBOLS)],
  ['.kt', uniqueFrom(extractKtorRouteFunctions, ...JVM_ROUTE_SYMBOLS)],
  [
    '.cs',
    uniqueFrom(extractAspNetRouteMethods, extractCSharpMethodNames, inferClassSymbolsForFile),
  ],
  ['.go', uniqueFrom(extractGoRouteHandlers, extractGoFunctionNames)],
  ['.rb', uniqueFrom(extractRubyMethodNames, inferClassSymbolsForFile)],
  ['.php', uniqueFrom(extractPhpMethodNames, inferClassSymbolsForFile)],
  ['.rs', uniqueFrom(extractAxumHandlerNames, extractActixHandlerNames, extractRustFunctionNames)],
]);

/**
 * Symbols that may implement or call an OpenAPI operation in a file, chosen by file extension;
 * files of other languages fall back to guessing declared class and type names.
 */
export const extractOpenApiRuntimeSymbols = (filePath: string, text: string) => {
  const extractor = RUNTIME_SYMBOL_EXTRACTORS.get(path.posix.extname(filePath).toLowerCase());
  return extractor ? extractor(text) : inferSymbolsForFile(filePath, text);
};

/**
 * Whether the text refers to protobuf service `serviceName` and looks like gRPC runtime code
 * (server registration, client construction, generated stubs or base classes).
 */
export const matchesProtoRuntimeEntry = (text: string, serviceName: string) =>
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

/**
 * Symbols of a runtime file that relate to protobuf service `serviceName`, using the conventions
 * of the file's language (Go registration, Spring/Ktor routes, FastAPI, ASP.NET, Axum/Actix).
 */
export const extractProtoRuntimeSymbols = (filePath: string, text: string, serviceName: string) => {
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

/**
 * Whether a file looks like OpenAPI-generated client or server code, by its path or a generator marker in the text.
 */
export const isGeneratedOpenApiModule = (filePath: string, text: string) =>
  /(?:^|\/)(?:generated|gen|sdk|clients?|openapi)(?:\/|$)/i.test(filePath) ||
  /Generated by OpenAPI Generator|swagger-codegen|openapi-typescript-codegen|orval/i.test(text);

/** Names of the `service` blocks declared in a .proto file. */
export const extractProtoServiceNames = (text: string) =>
  uniqueCaptures(text, [/^\s*service\s+([A-Z][A-Za-z0-9_]*)\s*\{/gm]);

/** Output directories (`out:` entries) listed in a buf generation config. */
export const extractBufOutputDirs = (text: string) =>
  Array.from(
    new Set(
      Array.from(text.matchAll(/^\s*out:\s*([^\s#]+)\s*$/gm))
        .map((match) => match[1]?.trim().replace(/^['"]|['"]$/g, ''))
        .filter((value): value is string => Boolean(value))
    )
  );

/**
 * File base name with language and protobuf generator suffixes removed (`user_pb2_grpc.py`, `user.pb.go`,
 * `user.connect.ts`, `UserGrpc.java`), so it can be compared with the .proto file's stem.
 */
export const normalizeProtoGeneratedStem = (filePath: string) =>
  path.posix
    .basename(filePath)
    .replace(/\.(ts|tsx|js|jsx|go|java|kt|cs|py|rb|php)$/i, '')
    .replace(/(?:\.connectweb|\.connect|\.grpc-web)$/i, '')
    .replace(/(?:\.connect)?(?:\.grpc)?\.pb$/i, '')
    .replace(/_pb2(?:_grpc)?$/i, '')
    .replace(/Grpc$/i, '')
    .replace(/Proto$/i, '');

/**
 * Whether a file is protobuf-generated code: a generator-specific file name or a generator banner in the text.
 */
export const isGeneratedProtoModule = (filePath: string, text: string) =>
  /\.(?:connectweb|connect|grpc-web)\.(?:ts|js)$/i.test(filePath) ||
  /\.(?:connect\.)?(?:grpc\.)?pb\.(?:ts|js|go|java|kt|cs)$/i.test(filePath) ||
  /_pb2(?:_grpc)?\.py$/i.test(filePath) ||
  /Code generated by protoc|Generated by the protocol buffer compiler|protobufjs|minimal\.js/i.test(
    text
  );

/** Whether a file is generated Connect code, by name or by its use of the Connect runtime. */
export const isConnectGeneratedModule = (filePath: string, text: string) =>
  /\.connect(?:web)?\.ts$/i.test(filePath) ||
  /@connectrpc\/connect|createPromiseClient|MethodKind/i.test(text);

/** Whether a file is generated gRPC-Web code, by name or by its use of the gRPC-Web runtime. */
export const isGrpcWebGeneratedModule = (filePath: string, text: string) =>
  /\.grpc-web\.(?:ts|js)$/i.test(filePath) ||
  /grpc-web|GrpcWebImpl|PromiseClient|UnaryResponse/i.test(text);

/**
 * Whether the text sets up a Connect transport or client, i.e. it is runtime code that uses Connect.
 */
export const isConnectRuntimeEntry = (text: string) =>
  /createPromiseClient\s*\(|createConnectTransport\s*\(|connectNodeAdapter\s*\(/.test(text);

/**
 * Whether the text sets up a gRPC-Web transport or client, i.e. it is runtime code that uses gRPC-Web.
 */
export const isGrpcWebRuntimeEntry = (text: string) =>
  /GrpcWebFetchTransport\s*\(|grpc\.unary\s*\(|grpc\.invoke\s*\(|new\s+[A-Za-z0-9_]+Client\s*\(/.test(
    text
  );

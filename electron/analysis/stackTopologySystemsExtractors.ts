/**
 * Regex extractors for Go and Rust source: function names and the route handlers or gRPC services registered in them.
 */
import { uniqueCaptures } from './stackTopologyExtractorBase';

/** Names of Go functions and methods, without duplicates. */
export const extractGoFunctionNames = (text: string) =>
  uniqueCaptures(text, [/\bfunc\s+(?:\([^)]+\)\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/g]);

/** Handler names passed as second argument to router verb calls such as `.GET(path, handler)`. */
export const extractGoRouteHandlers = (text: string) =>
  uniqueCaptures(text, [
    /\.(?:GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD|Any|Get|Post|Put|Patch|Delete|Options|Head|All)\s*\([^,]+,\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/g,
  ]);

/**
 * `RegisterXxxServer(server, impl)` calls of generated gRPC code: the service name and the implementation passed.
 */
export const extractGrpcRegistrationTargets = (text: string) =>
  Array.from(
    text.matchAll(
      /Register([A-Z][A-Za-z0-9_]*)Server\s*\(\s*[^,]+,\s*(?:&\s*)?([A-Z][A-Za-z0-9_]*|[a-z_][A-Za-z0-9_]*)/g
    )
  ).map((match) => ({
    service: match[1],
    implementation: match[2],
  }));

/** Names of Rust `fn` declarations, without duplicates. */
export const extractRustFunctionNames = (text: string) =>
  uniqueCaptures(text, [/\b(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g]);

/** Handler functions passed to Axum routing helpers such as `get(handler)`. */
export const extractAxumHandlerNames = (text: string) =>
  uniqueCaptures(text, [
    /\b(?:get|post|put|patch|delete|options|head|any)\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/g,
  ]);

/**
 * Actix Web handlers: functions named in `route/to/service(...)` calls and functions carrying route attribute macros.
 */
export const extractActixHandlerNames = (text: string) =>
  uniqueCaptures(text, [
    /\b(?:route|to|service)\s*\([^)]*?([A-Za-z_][A-Za-z0-9_]*)\s*\)?/g,
    /#\[(?:get|post|put|patch|delete|head|route)[^\]]*\]\s*(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
  ]);

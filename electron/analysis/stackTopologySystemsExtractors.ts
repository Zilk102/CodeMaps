import { uniqueCaptures } from './stackTopologyExtractorBase';

export const extractGoFunctionNames = (text: string) =>
  uniqueCaptures(text, [/\bfunc\s+(?:\([^)]+\)\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/g]);

export const extractGoRouteHandlers = (text: string) =>
  uniqueCaptures(text, [
    /\.(?:GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD|Any|Get|Post|Put|Patch|Delete|Options|Head|All)\s*\([^,]+,\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/g,
  ]);

export const extractGrpcRegistrationTargets = (text: string) =>
  Array.from(
    text.matchAll(
      /Register([A-Z][A-Za-z0-9_]*)Server\s*\(\s*[^,]+,\s*(?:&\s*)?([A-Z][A-Za-z0-9_]*|[a-z_][A-Za-z0-9_]*)/g
    )
  ).map((match) => ({
    service: match[1],
    implementation: match[2],
  }));

export const extractRustFunctionNames = (text: string) =>
  uniqueCaptures(text, [/\b(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g]);

export const extractAxumHandlerNames = (text: string) =>
  uniqueCaptures(text, [
    /\b(?:get|post|put|patch|delete|options|head|any)\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/g,
  ]);

export const extractActixHandlerNames = (text: string) =>
  uniqueCaptures(text, [
    /\b(?:route|to|service)\s*\([^)]*?([A-Za-z_][A-Za-z0-9_]*)\s*\)?/g,
    /#\[(?:get|post|put|patch|delete|head|route)[^\]]*\]\s*(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
  ]);

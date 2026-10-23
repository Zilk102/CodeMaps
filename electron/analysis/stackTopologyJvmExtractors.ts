import { extractMethodNames, uniqueCaptures } from './stackTopologyExtractorBase';

export const extractSpringRouteMethods = (text: string) =>
  extractMethodNames(text, [
    /@(?:GetMapping|PostMapping|PutMapping|PatchMapping|DeleteMapping|RequestMapping)\s*(?:\([^)]*\))?\s*(?:public|private|protected|static|final|synchronized|abstract|\s)+[A-Za-z0-9_<>[\], ?]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
  ]);

export const extractMicronautRouteMethods = (text: string) =>
  extractMethodNames(text, [
    /@(?:Get|Post|Put|Patch|Delete|Head|Options)\s*(?:\([^)]*\))?\s*(?:public|private|protected|static|final|synchronized|abstract|\s)+[A-Za-z0-9_<>[\], ?]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
  ]);

export const extractJakartaRouteMethods = (text: string) =>
  extractMethodNames(text, [
    /@(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*(?:\([^)]*\))?\s*(?:public|private|protected|static|final|synchronized|abstract|\s)+[A-Za-z0-9_<>[\], ?]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
  ]);

export const extractJvmFunctionNames = (text: string) =>
  uniqueCaptures(text, [
    /\b(?:public|private|protected|internal|open|final|abstract|suspend|inline|static|async|\s)*fun\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
    /\b(?:public|private|protected|static|final|synchronized|abstract|\s)+[A-Za-z0-9_<>[\], ?]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
  ]);

export const extractKtorRouteFunctions = (text: string) =>
  uniqueCaptures(text, [
    /\bfun\s+(?:Application\.|Route\.)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
    /\b(?:get|post|put|patch|delete|options|head)\s*\([^)]*\)\s*\{[\s\S]*?([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
  ]);

export const extractAspNetRouteMethods = (text: string) =>
  extractMethodNames(text, [
    /\[(?:HttpGet|HttpPost|HttpPut|HttpPatch|HttpDelete|Route|AcceptVerbs)[^\]]*\]\s*(?:public|private|protected|internal|async|static|\s)+[A-Za-z0-9_<>[\], ?]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
  ]);

export const extractCSharpMethodNames = (text: string) =>
  uniqueCaptures(text, [
    /\b(?:public|private|protected|internal|async|static|virtual|override|sealed|partial|\s)+[A-Za-z0-9_<>[\], ?]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
  ]);

export const normalizeTypeName = (value: string) =>
  value
    .replace(/<.*>/g, '')
    .replace(/^\s*I(?=[A-Z])/, 'I')
    .trim();

export const extractNestProviderBindings = (text: string) =>
  Array.from(
    text.matchAll(
      /provide\s*:\s*([A-Za-z_][A-Za-z0-9_]*)[\s\S]*?useClass\s*:\s*([A-Z][A-Za-z0-9_]*)/g
    )
  ).map((match) => ({
    token: match[1],
    implementation: match[2],
  }));

export const extractSpringBeanBindings = (text: string) =>
  Array.from(
    text.matchAll(
      /@Bean\s*(?:\([^)]*\))?\s*(?:public|private|protected|static|final|\s)+([A-Z][A-Za-z0-9_<>]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*\{([\s\S]*?)\}/g
    )
  ).map((match) => ({
    returnType: normalizeTypeName(match[1]),
    methodName: match[2],
    implementationType: normalizeTypeName(
      match[3]?.match(/return\s+new\s+([A-Z][A-Za-z0-9_]*)\s*\(/)?.[1] || ''
    ),
  }));

export const extractAspNetServiceRegistrations = (text: string) =>
  Array.from(
    text.matchAll(
      /Add(?:Scoped|Singleton|Transient)\s*<\s*([A-Za-z_][A-Za-z0-9_<>]*)\s*,\s*([A-Za-z_][A-Za-z0-9_<>]*)\s*>\s*\(/g
    )
  ).map((match) => ({
    contract: normalizeTypeName(match[1]),
    implementation: normalizeTypeName(match[2]),
  }));

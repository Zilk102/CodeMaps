import { extractMethodNames, uniqueCaptures } from './stackTopologyExtractorBase';

const JVM_MODIFIERS = 'public|private|protected|static|final|synchronized|abstract';
const DOTNET_MODIFIERS = 'public|private|protected|internal|async|static';

/**
 * A method declaration: `head` (an annotation, an attribute or a word boundary), then modifiers and
 * a return type, with the method name captured before its parameter list.
 */
const methodDeclaration = (head: string, modifiers: string) =>
  new RegExp(
    String.raw`${head}(?:${modifiers}|\s)+[A-Za-z0-9_<>[\], ?]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(`,
    'g'
  );

/** A method carrying one of the route annotations, e.g. `@GetMapping("/x") public Foo list(`. */
const annotatedRouteMethod = (verbs: string) =>
  methodDeclaration(String.raw`@(?:${verbs})\s*(?:\([^)]*\))?\s*`, JVM_MODIFIERS);

export const extractSpringRouteMethods = (text: string) =>
  extractMethodNames(text, [
    annotatedRouteMethod(
      'GetMapping|PostMapping|PutMapping|PatchMapping|DeleteMapping|RequestMapping'
    ),
  ]);

export const extractMicronautRouteMethods = (text: string) =>
  extractMethodNames(text, [annotatedRouteMethod('Get|Post|Put|Patch|Delete|Head|Options')]);

export const extractJakartaRouteMethods = (text: string) =>
  extractMethodNames(text, [annotatedRouteMethod('GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS')]);

export const extractJvmFunctionNames = (text: string) =>
  uniqueCaptures(text, [
    /\b(?:public|private|protected|internal|open|final|abstract|suspend|inline|static|async|\s)*fun\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
    methodDeclaration(String.raw`\b`, JVM_MODIFIERS),
  ]);

export const extractKtorRouteFunctions = (text: string) =>
  uniqueCaptures(text, [
    /\bfun\s+(?:Application\.|Route\.)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
    /\b(?:get|post|put|patch|delete|options|head)\s*\([^)]*\)\s*\{[\s\S]*?([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
  ]);

export const extractAspNetRouteMethods = (text: string) =>
  extractMethodNames(text, [
    methodDeclaration(
      String.raw`\[(?:HttpGet|HttpPost|HttpPut|HttpPatch|HttpDelete|Route|AcceptVerbs)[^\]]*\]\s*`,
      DOTNET_MODIFIERS
    ),
  ]);

export const extractCSharpMethodNames = (text: string) =>
  uniqueCaptures(text, [
    methodDeclaration(String.raw`\b`, `${DOTNET_MODIFIERS}|virtual|override|sealed|partial`),
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

/**
 * Regex extractors for JVM and .NET source: route methods, function names and dependency-injection bindings.
 */
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

/**
 * Names of methods annotated with Spring mapping annotations (`@GetMapping`, `@RequestMapping`, ...).
 */
export const extractSpringRouteMethods = (text: string) =>
  extractMethodNames(text, [
    annotatedRouteMethod(
      'GetMapping|PostMapping|PutMapping|PatchMapping|DeleteMapping|RequestMapping'
    ),
  ]);

/** Names of methods annotated with Micronaut HTTP annotations (`@Get`, `@Post`, ...). */
export const extractMicronautRouteMethods = (text: string) =>
  extractMethodNames(text, [annotatedRouteMethod('Get|Post|Put|Patch|Delete|Head|Options')]);

/** Names of methods annotated with Jakarta/JAX-RS verb annotations (`@GET`, `@POST`, ...). */
export const extractJakartaRouteMethods = (text: string) =>
  extractMethodNames(text, [annotatedRouteMethod('GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS')]);

/** Names of Kotlin `fun` declarations and Java/JVM method declarations, without duplicates. */
export const extractJvmFunctionNames = (text: string) =>
  uniqueCaptures(text, [
    /\b(?:public|private|protected|internal|open|final|abstract|suspend|inline|static|async|\s)*fun\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
    methodDeclaration(String.raw`\b`, JVM_MODIFIERS),
  ]);

/**
 * Names of Kotlin functions (including `Application.`/`Route.` extensions) and of the calls
 * made inside Ktor route blocks (`get(...) { ... }`).
 */
export const extractKtorRouteFunctions = (text: string) =>
  uniqueCaptures(text, [
    /\bfun\s+(?:Application\.|Route\.)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
    /\b(?:get|post|put|patch|delete|options|head)\s*\([^)]*\)\s*\{[\s\S]*?([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
  ]);

/** Names of C# methods carrying ASP.NET `[HttpGet]`, `[Route]` and similar attributes. */
export const extractAspNetRouteMethods = (text: string) =>
  extractMethodNames(text, [
    methodDeclaration(
      String.raw`\[(?:HttpGet|HttpPost|HttpPut|HttpPatch|HttpDelete|Route|AcceptVerbs)[^\]]*\]\s*`,
      DOTNET_MODIFIERS
    ),
  ]);

/** Names of C# method declarations, without duplicates. */
export const extractCSharpMethodNames = (text: string) =>
  uniqueCaptures(text, [
    methodDeclaration(String.raw`\b`, `${DOTNET_MODIFIERS}|virtual|override|sealed|partial`),
  ]);

/**
 * Type name without generic arguments and surrounding whitespace (`Repository<User>` becomes `Repository`).
 */
export const normalizeTypeName = (value: string) =>
  value
    .replace(/<.*>/g, '')
    .replace(/^\s*I(?=[A-Z])/, 'I')
    .trim();

/** NestJS provider bindings of the form `{ provide: Token, useClass: Implementation }`. */
export const extractNestProviderBindings = (text: string) =>
  Array.from(
    text.matchAll(
      /provide\s*:\s*([A-Za-z_][A-Za-z0-9_]*)[\s\S]*?useClass\s*:\s*([A-Z][A-Za-z0-9_]*)/g
    )
  ).map((match) => ({
    token: match[1],
    implementation: match[2],
  }));

/**
 * Spring `@Bean` methods with their declared return type and the class they instantiate with
 * `return new X(...)`; the implementation type is empty when the body does not do that.
 */
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

/** ASP.NET `AddScoped/AddSingleton/AddTransient<Contract, Implementation>()` registrations. */
export const extractAspNetServiceRegistrations = (text: string) =>
  Array.from(
    text.matchAll(
      /Add(?:Scoped|Singleton|Transient)\s*<\s*([A-Za-z_][A-Za-z0-9_<>]*)\s*,\s*([A-Za-z_][A-Za-z0-9_<>]*)\s*>\s*\(/g
    )
  ).map((match) => ({
    contract: normalizeTypeName(match[1]),
    implementation: normalizeTypeName(match[2]),
  }));

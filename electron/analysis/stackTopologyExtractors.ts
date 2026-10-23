export const getNearestNextLayouts = (routeFile: string, allLayouts: Set<string>) => {
  if (!routeFile.startsWith('app/') || routeFile.includes('/api/')) {
    return [];
  }

  const routeDir = routeFile.slice(0, routeFile.lastIndexOf('/'));
  const segments = routeDir.split('/');
  const layouts: string[] = [];

  for (let i = 1; i <= segments.length; i++) {
    const prefix = segments.slice(0, i).join('/');
    for (const extension of ['tsx', 'ts', 'jsx', 'js']) {
      const candidate = `${prefix}/layout.${extension}`;
      if (allLayouts.has(candidate)) {
        layouts.push(candidate);
      }
    }
  }

  return Array.from(new Set(layouts));
};

export const extractMethodNames = (text: string, patterns: RegExp[]) => {
  const names = new Set<string>();

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      if (match[1]) {
        names.add(match[1]);
      }
    }
  }

  return Array.from(names).sort();
};

export const extractNestRouteMethods = (text: string) =>
  extractMethodNames(text, [
    /@(?:Get|Post|Put|Patch|Delete|Options|Head|All)\s*\([^)]*\)\s*(?:public|private|protected|async|static|\s)*([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
    /@(?:Get|Post|Put|Patch|Delete|Options|Head|All)\s*\(\)\s*(?:public|private|protected|async|static|\s)*([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
  ]);

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
  Array.from(
    new Set([
      ...Array.from(
        text.matchAll(
          /\b(?:public|private|protected|internal|open|final|abstract|suspend|inline|static|async|\s)*fun\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g
        )
      )
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value)),
      ...Array.from(
        text.matchAll(
          /\b(?:public|private|protected|static|final|synchronized|abstract|\s)+[A-Za-z0-9_<>[\], ?]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g
        )
      )
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value)),
    ])
  );

export const extractKtorRouteFunctions = (text: string) =>
  Array.from(
    new Set([
      ...Array.from(
        text.matchAll(/\bfun\s+(?:Application\.|Route\.)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)
      )
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value)),
      ...Array.from(
        text.matchAll(
          /\b(?:get|post|put|patch|delete|options|head)\s*\([^)]*\)\s*\{[\s\S]*?([A-Za-z_][A-Za-z0-9_]*)\s*\(/g
        )
      )
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value)),
    ])
  );

export const extractAspNetRouteMethods = (text: string) =>
  extractMethodNames(text, [
    /\[(?:HttpGet|HttpPost|HttpPut|HttpPatch|HttpDelete|Route|AcceptVerbs)[^\]]*\]\s*(?:public|private|protected|internal|async|static|\s)+[A-Za-z0-9_<>[\], ?]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
  ]);

export const extractPythonFunctionNames = (text: string) =>
  Array.from(
    new Set(
      Array.from(text.matchAll(/\b(?:async\s+def|def)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g))
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value))
    )
  );

export const extractFastApiRouteFunctions = (text: string) =>
  Array.from(
    new Set(
      Array.from(
        text.matchAll(
          /@(?:[A-Za-z_][A-Za-z0-9_]*)\.(?:get|post|put|patch|delete|options|head|api_route)\s*\([^)]*\)\s*(?:async\s+def|def)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g
        )
      )
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value))
    )
  );

export const extractDjangoUrlTargets = (text: string) =>
  Array.from(
    new Set(
      Array.from(text.matchAll(/\b(?:path|re_path)\s*\([^,]+,\s*([A-Za-z_][A-Za-z0-9_.]*)/g))
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value))
        .map(
          (value) =>
            value
              .replace(/\.as_view$/, '')
              .split('.')
              .pop() || value
        )
        .filter((value) => value !== 'include')
    )
  );

export const extractRailsResourceTargets = (text: string) =>
  Array.from(
    new Set(
      Array.from(text.matchAll(/\bresources?\s+:([A-Za-z_][A-Za-z0-9_]*)/g))
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value))
    )
  );

export const extractLaravelControllerTargets = (text: string) =>
  Array.from(
    new Set([
      ...Array.from(text.matchAll(/([A-Z][A-Za-z0-9_]*Controller)::class/g))
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value)),
      ...Array.from(text.matchAll(/['"]([A-Z][A-Za-z0-9_]*Controller)@/g))
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value)),
    ])
  );

export const extractCSharpMethodNames = (text: string) =>
  Array.from(
    new Set(
      Array.from(
        text.matchAll(
          /\b(?:public|private|protected|internal|async|static|virtual|override|sealed|partial|\s)+[A-Za-z0-9_<>[\], ?]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g
        )
      )
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value))
    )
  );

export const extractRubyMethodNames = (text: string) =>
  Array.from(
    new Set(
      Array.from(text.matchAll(/\bdef\s+([A-Za-z_][A-Za-z0-9_!?=]*)/g))
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value))
    )
  );

export const extractPhpMethodNames = (text: string) =>
  Array.from(
    new Set(
      Array.from(
        text.matchAll(/\b(?:public|protected|private)?\s*function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)
      )
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value))
    )
  );

export const extractGoFunctionNames = (text: string) =>
  Array.from(
    new Set(
      Array.from(text.matchAll(/\bfunc\s+(?:\([^)]+\)\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/g))
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value))
    )
  );

export const extractGoRouteHandlers = (text: string) =>
  Array.from(
    new Set(
      Array.from(
        text.matchAll(
          /\.(?:GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD|Any|Get|Post|Put|Patch|Delete|Options|Head|All)\s*\([^,]+,\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/g
        )
      )
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value))
    )
  );

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
  Array.from(
    new Set(
      Array.from(text.matchAll(/\b(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g))
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value))
    )
  );

export const extractAxumHandlerNames = (text: string) =>
  Array.from(
    new Set(
      Array.from(
        text.matchAll(
          /\b(?:get|post|put|patch|delete|options|head|any)\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/g
        )
      )
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value))
    )
  );

export const extractActixHandlerNames = (text: string) =>
  Array.from(
    new Set([
      ...Array.from(
        text.matchAll(/\b(?:route|to|service)\s*\([^)]*?([A-Za-z_][A-Za-z0-9_]*)\s*\)?/g)
      )
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value)),
      ...Array.from(
        text.matchAll(
          /#\[(?:get|post|put|patch|delete|head|route)[^\]]*\]\s*(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g
        )
      )
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value)),
    ])
  );

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

import * as fs from 'fs/promises';
import * as path from 'path';
import { GraphData } from '../store';
import { DetectedStack, StackInsightResult } from './StackInsightService';

export type StackAdapterCategory = 'framework' | 'build';
export type StackRelationshipType = 'framework' | 'build';

export interface StackStructuralRelationship {
  source: string;
  target: string;
  type: StackRelationshipType;
  reason: string;
}

export interface StackStructuralInsight {
  adapterId: string;
  displayName: string;
  category: StackAdapterCategory;
  summary: string;
  evidence: string[];
  entryFiles: string[];
  configFiles: string[];
  components: string[];
  routes: string[];
  modules: string[];
  relationships: StackStructuralRelationship[];
}

export interface StackAdapterContext {
  graph: GraphData;
  stackProfile: StackInsightResult;
  getDetectedStack: (stackId: string) => DetectedStack | undefined;
  getAllFilePaths: () => string[];
  getProjectRelativePath: (filePath: string) => string;
  hasRelativePath: (relativePath: string) => boolean;
  findByRelativePrefix: (prefix: string) => string[];
  findBySuffix: (suffix: string) => string[];
  readText: (filePath: string) => Promise<string | null>;
  readTexts: (filePaths: string[]) => Promise<Array<{ filePath: string; text: string }>>;
}

export interface StackAdapter {
  id: string;
  displayName: string;
  category: StackAdapterCategory;
  supports: (context: StackAdapterContext) => boolean;
  analyze: (context: StackAdapterContext) => Promise<StackStructuralInsight | null>;
}

export class ProjectFileContext implements StackAdapterContext {
  private readonly filePaths: string[];
  private readonly relativePathByAbsolute = new Map<string, string>();
  private readonly relativeToAbsolute = new Map<string, string>();
  private readonly textCache = new Map<string, Promise<string | null>>();

  constructor(
    public readonly graph: GraphData,
    public readonly stackProfile: StackInsightResult
  ) {
    this.filePaths = graph.nodes.filter((node) => node.type === 'file').map((node) => node.id);

    for (const filePath of this.filePaths) {
      const relativePath = this.normalize(path.relative(graph.projectRoot, filePath));
      this.relativePathByAbsolute.set(filePath, relativePath);
      this.relativeToAbsolute.set(relativePath, filePath);
    }
  }

  getDetectedStack(stackId: string) {
    const all = [
      ...this.stackProfile.packageManagers,
      ...this.stackProfile.buildSystems,
      ...this.stackProfile.frameworks,
    ];
    return all.find((entry) => entry.id === stackId);
  }

  getAllFilePaths() {
    return this.filePaths.slice();
  }

  getProjectRelativePath(filePath: string) {
    return (
      this.relativePathByAbsolute.get(filePath) ||
      this.normalize(path.relative(this.graph.projectRoot, filePath))
    );
  }

  hasRelativePath(relativePath: string) {
    return this.relativeToAbsolute.has(this.normalize(relativePath));
  }

  findByRelativePrefix(prefix: string) {
    const normalizedPrefix = this.normalize(prefix);
    return this.filePaths.filter((filePath) =>
      this.getProjectRelativePath(filePath).startsWith(normalizedPrefix)
    );
  }

  findBySuffix(suffix: string) {
    const normalizedSuffix = suffix.toLowerCase();
    return this.filePaths.filter((filePath) =>
      this.getProjectRelativePath(filePath).toLowerCase().endsWith(normalizedSuffix)
    );
  }

  async readText(filePath: string) {
    if (!this.textCache.has(filePath)) {
      this.textCache.set(
        filePath,
        fs.readFile(filePath, 'utf-8').catch(() => null)
      );
    }

    return this.textCache.get(filePath)!;
  }

  async readTexts(filePaths: string[]) {
    const results = await Promise.all(
      filePaths.map(async (filePath) => {
        const text = await this.readText(filePath);
        return text ? { filePath, text } : null;
      })
    );

    return results.filter((entry): entry is { filePath: string; text: string } => !!entry);
  }

  private normalize(value: string) {
    return value.replace(/\\/g, '/');
  }
}

export const basename = (filePath: string) => path.basename(filePath);

export const toRelativeList = (context: StackAdapterContext, filePaths: string[]) =>
  Array.from(new Set(filePaths.map((filePath) => context.getProjectRelativePath(filePath)))).sort();

export type FileContentEntry = { filePath: string; text: string };
export type GraphSymbolIndex = Map<string, Set<string>>;

export const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const normalizeIdentifierForComparison = (value: string) =>
  value.replace(/[^A-Za-z0-9]+/g, '').toLowerCase();

export const splitIdentifierWords = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/g)
    .flatMap((part) =>
      part
        .split(/(?<=[A-Z])(?=[A-Z][a-z])|(?<=[a-z])(?=[A-Z])/g)
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean)
    );

export const toPascalCase = (parts: string[]) =>
  parts.map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join('');

export const buildIdentifierVariants = (value: string) => {
  const trimmed = value.trim();
  const words = splitIdentifierWords(trimmed);
  const variants = new Set<string>([trimmed]);

  if (words.length > 0) {
    const snakeCase = words.join('_');
    const kebabCase = words.join('-');
    const pascalCase = toPascalCase(words);
    const camelCase = `${words[0]}${words
      .slice(1)
      .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
      .join('')}`;
    const flatLower = words.join('');

    [snakeCase, kebabCase, pascalCase, camelCase, flatLower].forEach((candidate) => {
      if (candidate) {
        variants.add(candidate);
      }
    });
  }

  return Array.from(variants);
};

export const matchesIdentifierVariantInText = (text: string, identifier: string) =>
  buildIdentifierVariants(identifier).some((variant) =>
    new RegExp(`\\b${escapeRegExp(variant)}\\b`, 'i').test(text)
  );

export const containsIdentifierVariantInNormalizedText = (text: string, identifier: string) => {
  const normalizedText = normalizeIdentifierForComparison(text);
  return buildIdentifierVariants(identifier)
    .map((variant) => normalizeIdentifierForComparison(variant))
    .filter(Boolean)
    .some((variant) => normalizedText.includes(variant));
};

export const findMatchingIdentifierSymbols = (symbols: string[], identifier: string) => {
  const normalizedVariants = new Set(
    buildIdentifierVariants(identifier).map((variant) => normalizeIdentifierForComparison(variant))
  );

  return symbols.filter((symbol) =>
    normalizedVariants.has(normalizeIdentifierForComparison(symbol))
  );
};

export const findContainingIdentifierSymbols = (symbols: string[], identifier: string) => {
  const normalizedVariants = Array.from(
    new Set(
      buildIdentifierVariants(identifier).map((variant) =>
        normalizeIdentifierForComparison(variant)
      )
    )
  ).filter(Boolean);

  return symbols.filter((symbol) => {
    const normalizedSymbol = normalizeIdentifierForComparison(symbol);
    return normalizedVariants.some((variant) => normalizedSymbol.includes(variant));
  });
};

export const stripKnownExtension = (filePath: string) =>
  filePath.replace(/\.(tsx|ts|jsx|js|java|kt|cs)$/i, '');

export const inferSymbolsForFile = (filePath: string, text: string) => {
  const symbols = new Set<string>();
  const baseName = basename(stripKnownExtension(filePath));

  if (baseName) {
    symbols.add(baseName);
  }

  for (const match of text.matchAll(/\b(?:class|interface|enum|type)\s+([A-Z][A-Za-z0-9_]*)/g)) {
    if (match[1]) {
      symbols.add(match[1]);
    }
  }

  for (const match of text.matchAll(
    /\bexport\s+(?:default\s+)?(?:class|function|const)\s+([A-Z][A-Za-z0-9_]*)/g
  )) {
    if (match[1]) {
      symbols.add(match[1]);
    }
  }

  return Array.from(symbols);
};

export const inferClassSymbolsForFile = (text: string) =>
  Array.from(
    new Set(
      Array.from(text.matchAll(/\b(?:class|interface|enum|type)\s+([A-Z][A-Za-z0-9_]*)/g))
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value))
    )
  );

export const buildGraphSymbolIndex = (graph: GraphData): GraphSymbolIndex => {
  const index = new Map<string, Set<string>>();

  for (const node of graph.nodes) {
    if (!['class', 'function'].includes(node.type)) {
      continue;
    }

    const [fileId, symbolName] = node.id.split('#');
    if (!fileId || !symbolName) {
      continue;
    }

    const relativeFile = fileId
      .replace(/\\/g, '/')
      .startsWith(graph.projectRoot.replace(/\\/g, '/'))
      ? path.relative(graph.projectRoot, fileId).replace(/\\/g, '/')
      : fileId.replace(/\\/g, '/');
    const symbols = index.get(relativeFile) || new Set<string>();
    symbols.add(symbolName);
    index.set(relativeFile, symbols);
  }

  return index;
};

export const resolveSymbolEndpoint = (
  relativeFilePath: string,
  symbolIndex: GraphSymbolIndex,
  options: {
    preferredSymbols?: string[];
    text?: string;
  } = {}
) => {
  const availableSymbols = Array.from(symbolIndex.get(relativeFilePath) || []);
  if (availableSymbols.length === 0) {
    return relativeFilePath;
  }

  for (const candidate of options.preferredSymbols || []) {
    if (availableSymbols.includes(candidate)) {
      return `${relativeFilePath}#${candidate}`;
    }
  }

  if (options.text) {
    for (const inferredSymbol of inferSymbolsForFile(relativeFilePath, options.text)) {
      if (availableSymbols.includes(inferredSymbol)) {
        return `${relativeFilePath}#${inferredSymbol}`;
      }
    }
  }

  if (availableSymbols.length === 1) {
    return `${relativeFilePath}#${availableSymbols[0]}`;
  }

  return relativeFilePath;
};

export const buildSymbolToFileMap = (entries: FileContentEntry[]) => {
  const symbolToFile = new Map<string, string>();

  for (const entry of entries) {
    for (const symbol of inferSymbolsForFile(entry.filePath, entry.text)) {
      if (!symbolToFile.has(symbol)) {
        symbolToFile.set(symbol, entry.filePath);
      }
    }
  }

  return symbolToFile;
};

export const buildNamedSymbolToFileMap = (
  entries: FileContentEntry[],
  extractor: (text: string) => string[]
) => {
  const symbolToFile = new Map<string, string>();

  for (const entry of entries) {
    for (const symbol of extractor(entry.text)) {
      if (!symbolToFile.has(symbol)) {
        symbolToFile.set(symbol, entry.filePath);
      }
    }
  }

  return symbolToFile;
};

export const findReferencedSymbolMatches = (
  text: string,
  symbolToFileMap: Map<string, string>,
  excludeFiles: string[] = []
) => {
  const excludeSet = new Set(excludeFiles);
  const matches = new Map<string, { filePath: string; symbol: string }>();

  for (const [symbol, filePath] of symbolToFileMap.entries()) {
    if (excludeSet.has(filePath)) {
      continue;
    }

    if (new RegExp(`\\b${escapeRegExp(symbol)}\\b`).test(text)) {
      matches.set(`${filePath}#${symbol}`, { filePath, symbol });
    }
  }

  return Array.from(matches.values()).sort(
    (a, b) => a.filePath.localeCompare(b.filePath) || a.symbol.localeCompare(b.symbol)
  );
};

export const createRelationship = (
  source: string,
  target: string,
  type: StackRelationshipType,
  reason: string
): StackStructuralRelationship => ({
  source,
  target,
  type,
  reason,
});

export const getContentByRelativePath = (entries: FileContentEntry[]) =>
  new Map(entries.map((entry) => [entry.filePath, entry.text]));

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

export const createInsight = (
  adapterId: string,
  displayName: string,
  category: StackAdapterCategory,
  summary: string,
  {
    evidence = [],
    entryFiles = [],
    configFiles = [],
    components = [],
    routes = [],
    modules = [],
    relationships = [],
  }: Partial<
    Omit<StackStructuralInsight, 'adapterId' | 'displayName' | 'category' | 'summary'>
  > = {}
): StackStructuralInsight => ({
  adapterId,
  displayName,
  category,
  summary,
  evidence: Array.from(new Set(evidence)).sort(),
  entryFiles: Array.from(new Set(entryFiles)).sort(),
  configFiles: Array.from(new Set(configFiles)).sort(),
  components: Array.from(new Set(components)).sort(),
  routes: Array.from(new Set(routes)).sort(),
  modules: Array.from(new Set(modules)).sort(),
  relationships: relationships
    .filter(
      (relationship, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.source === relationship.source &&
            candidate.target === relationship.target &&
            candidate.type === relationship.type &&
            candidate.reason === relationship.reason
        ) === index
    )
    .sort(
      (a, b) =>
        a.source.localeCompare(b.source) ||
        a.target.localeCompare(b.target) ||
        a.type.localeCompare(b.type) ||
        a.reason.localeCompare(b.reason)
    ),
});

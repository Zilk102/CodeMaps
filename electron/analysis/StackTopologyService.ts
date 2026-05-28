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

class ProjectFileContext implements StackAdapterContext {
  private readonly filePaths: string[];
  private readonly relativePathByAbsolute = new Map<string, string>();
  private readonly relativeToAbsolute = new Map<string, string>();
  private readonly textCache = new Map<string, Promise<string | null>>();

  constructor(
    public readonly graph: GraphData,
    public readonly stackProfile: StackInsightResult
  ) {
    this.filePaths = graph.nodes
      .filter((node) => node.type === 'file')
      .map((node) => node.id);

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
    return this.relativePathByAbsolute.get(filePath) || this.normalize(path.relative(this.graph.projectRoot, filePath));
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
      this.textCache.set(filePath, fs.readFile(filePath, 'utf-8').catch(() => null));
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

const basename = (filePath: string) => path.basename(filePath);

const toRelativeList = (context: StackAdapterContext, filePaths: string[]) =>
  Array.from(new Set(filePaths.map((filePath) => context.getProjectRelativePath(filePath)))).sort();

type FileContentEntry = { filePath: string; text: string };
type GraphSymbolIndex = Map<string, Set<string>>;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeIdentifierForComparison = (value: string) =>
  value.replace(/[^A-Za-z0-9]+/g, '').toLowerCase();

const splitIdentifierWords = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/g)
    .flatMap((part) =>
      part
        .split(/(?<=[A-Z])(?=[A-Z][a-z])|(?<=[a-z])(?=[A-Z])/g)
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean)
    );

const toPascalCase = (parts: string[]) =>
  parts.map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join('');

const buildIdentifierVariants = (value: string) => {
  const trimmed = value.trim();
  const words = splitIdentifierWords(trimmed);
  const variants = new Set<string>([trimmed]);

  if (words.length > 0) {
    const snakeCase = words.join('_');
    const kebabCase = words.join('-');
    const pascalCase = toPascalCase(words);
    const camelCase = `${words[0]}${words.slice(1).map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join('')}`;
    const flatLower = words.join('');

    [snakeCase, kebabCase, pascalCase, camelCase, flatLower].forEach((candidate) => {
      if (candidate) {
        variants.add(candidate);
      }
    });
  }

  return Array.from(variants);
};

const matchesIdentifierVariantInText = (text: string, identifier: string) =>
  buildIdentifierVariants(identifier).some((variant) =>
    new RegExp(`\\b${escapeRegExp(variant)}\\b`, 'i').test(text)
  );

const containsIdentifierVariantInNormalizedText = (text: string, identifier: string) => {
  const normalizedText = normalizeIdentifierForComparison(text);
  return buildIdentifierVariants(identifier)
    .map((variant) => normalizeIdentifierForComparison(variant))
    .filter(Boolean)
    .some((variant) => normalizedText.includes(variant));
};

const findMatchingIdentifierSymbols = (symbols: string[], identifier: string) => {
  const normalizedVariants = new Set(
    buildIdentifierVariants(identifier).map((variant) => normalizeIdentifierForComparison(variant))
  );

  return symbols.filter((symbol) =>
    normalizedVariants.has(normalizeIdentifierForComparison(symbol))
  );
};

const findContainingIdentifierSymbols = (symbols: string[], identifier: string) => {
  const normalizedVariants = Array.from(
    new Set(
      buildIdentifierVariants(identifier).map((variant) => normalizeIdentifierForComparison(variant))
    )
  ).filter(Boolean);

  return symbols.filter((symbol) => {
    const normalizedSymbol = normalizeIdentifierForComparison(symbol);
    return normalizedVariants.some((variant) => normalizedSymbol.includes(variant));
  });
};

const stripKnownExtension = (filePath: string) =>
  filePath.replace(/\.(tsx|ts|jsx|js|java|kt|cs)$/i, '');

const inferSymbolsForFile = (filePath: string, text: string) => {
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

  for (const match of text.matchAll(/\bexport\s+(?:default\s+)?(?:class|function|const)\s+([A-Z][A-Za-z0-9_]*)/g)) {
    if (match[1]) {
      symbols.add(match[1]);
    }
  }

  return Array.from(symbols);
};

const inferClassSymbolsForFile = (text: string) =>
  Array.from(
    new Set(
      Array.from(text.matchAll(/\b(?:class|interface|enum|type)\s+([A-Z][A-Za-z0-9_]*)/g))
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value))
    )
  );

const buildGraphSymbolIndex = (graph: GraphData): GraphSymbolIndex => {
  const index = new Map<string, Set<string>>();

  for (const node of graph.nodes) {
    if (!['class', 'function'].includes(node.type)) {
      continue;
    }

    const [fileId, symbolName] = node.id.split('#');
    if (!fileId || !symbolName) {
      continue;
    }

    const relativeFile = fileId.replace(/\\/g, '/').startsWith(graph.projectRoot.replace(/\\/g, '/'))
      ? path.relative(graph.projectRoot, fileId).replace(/\\/g, '/')
      : fileId.replace(/\\/g, '/');
    const symbols = index.get(relativeFile) || new Set<string>();
    symbols.add(symbolName);
    index.set(relativeFile, symbols);
  }

  return index;
};

const resolveSymbolEndpoint = (
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

const buildSymbolToFileMap = (entries: FileContentEntry[]) => {
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

const buildNamedSymbolToFileMap = (
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

const findReferencedSymbolMatches = (
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

const createRelationship = (
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

const getContentByRelativePath = (entries: FileContentEntry[]) =>
  new Map(entries.map((entry) => [entry.filePath, entry.text]));

const getNearestNextLayouts = (routeFile: string, allLayouts: Set<string>) => {
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

const extractMethodNames = (text: string, patterns: RegExp[]) => {
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

const extractNestRouteMethods = (text: string) =>
  extractMethodNames(text, [
    /@(?:Get|Post|Put|Patch|Delete|Options|Head|All)\s*\([^)]*\)\s*(?:public|private|protected|async|static|\s)*([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
    /@(?:Get|Post|Put|Patch|Delete|Options|Head|All)\s*\(\)\s*(?:public|private|protected|async|static|\s)*([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
  ]);

const extractSpringRouteMethods = (text: string) =>
  extractMethodNames(text, [
    /@(?:GetMapping|PostMapping|PutMapping|PatchMapping|DeleteMapping|RequestMapping)\s*(?:\([^)]*\))?\s*(?:public|private|protected|static|final|synchronized|abstract|\s)+[A-Za-z0-9_<>[\], ?]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
  ]);

const extractMicronautRouteMethods = (text: string) =>
  extractMethodNames(text, [
    /@(?:Get|Post|Put|Patch|Delete|Head|Options)\s*(?:\([^)]*\))?\s*(?:public|private|protected|static|final|synchronized|abstract|\s)+[A-Za-z0-9_<>[\], ?]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
  ]);

const extractJakartaRouteMethods = (text: string) =>
  extractMethodNames(text, [
    /@(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*(?:\([^)]*\))?\s*(?:public|private|protected|static|final|synchronized|abstract|\s)+[A-Za-z0-9_<>[\], ?]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
  ]);

const extractJvmFunctionNames = (text: string) =>
  Array.from(
    new Set([
      ...Array.from(
        text.matchAll(/\b(?:public|private|protected|internal|open|final|abstract|suspend|inline|static|async|\s)*fun\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)
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

const extractKtorRouteFunctions = (text: string) =>
  Array.from(
    new Set([
      ...Array.from(
        text.matchAll(
          /\bfun\s+(?:Application\.|Route\.)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/g
        )
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

const extractAspNetRouteMethods = (text: string) =>
  extractMethodNames(text, [
    /\[(?:HttpGet|HttpPost|HttpPut|HttpPatch|HttpDelete|Route|AcceptVerbs)[^\]]*\]\s*(?:public|private|protected|internal|async|static|\s)+[A-Za-z0-9_<>[\], ?]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
  ]);

const extractPythonFunctionNames = (text: string) =>
  Array.from(
    new Set(
      Array.from(text.matchAll(/\b(?:async\s+def|def)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g))
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value))
    )
  );

const extractFastApiRouteFunctions = (text: string) =>
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

const extractDjangoUrlTargets = (text: string) =>
  Array.from(
    new Set(
      Array.from(text.matchAll(/\b(?:path|re_path)\s*\([^,]+,\s*([A-Za-z_][A-Za-z0-9_.]*)/g))
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value))
        .map((value) => value.replace(/\.as_view$/, '').split('.').pop() || value)
        .filter((value) => value !== 'include')
    )
  );

const extractRailsResourceTargets = (text: string) =>
  Array.from(
    new Set(
      Array.from(text.matchAll(/\bresources?\s+:([A-Za-z_][A-Za-z0-9_]*)/g))
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value))
    )
  );

const extractLaravelControllerTargets = (text: string) =>
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

const extractCSharpMethodNames = (text: string) =>
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

const extractRubyMethodNames = (text: string) =>
  Array.from(
    new Set(
      Array.from(text.matchAll(/\bdef\s+([A-Za-z_][A-Za-z0-9_!?=]*)/g))
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value))
    )
  );

const extractPhpMethodNames = (text: string) =>
  Array.from(
    new Set(
      Array.from(
        text.matchAll(
          /\b(?:public|protected|private)?\s*function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g
        )
      )
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value))
    )
  );

const extractGoFunctionNames = (text: string) =>
  Array.from(
    new Set(
      Array.from(text.matchAll(/\bfunc\s+(?:\([^)]+\)\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/g))
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value))
    )
  );

const extractGoRouteHandlers = (text: string) =>
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

const extractGrpcRegistrationTargets = (text: string) =>
  Array.from(
    text.matchAll(
      /Register([A-Z][A-Za-z0-9_]*)Server\s*\(\s*[^,]+,\s*(?:&\s*)?([A-Z][A-Za-z0-9_]*|[a-z_][A-Za-z0-9_]*)/g
    )
  ).map((match) => ({
    service: match[1],
    implementation: match[2],
  }));

const extractRustFunctionNames = (text: string) =>
  Array.from(
    new Set(
      Array.from(text.matchAll(/\b(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g))
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value))
    )
  );

const extractAxumHandlerNames = (text: string) =>
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

const extractActixHandlerNames = (text: string) =>
  Array.from(
    new Set([
      ...Array.from(
        text.matchAll(/\b(?:route|to|service)\s*\([^)]*?([A-Za-z_][A-Za-z0-9_]*)\s*\)?/g)
      )
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value)),
      ...Array.from(text.matchAll(/#\[(?:get|post|put|patch|delete|head|route)[^\]]*\]\s*(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g))
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value)),
    ])
  );

const normalizeTypeName = (value: string) =>
  value.replace(/<.*>/g, '').replace(/^\s*I(?=[A-Z])/, 'I').trim();

const extractNestProviderBindings = (text: string) =>
  Array.from(
    text.matchAll(
      /provide\s*:\s*([A-Za-z_][A-Za-z0-9_]*)[\s\S]*?useClass\s*:\s*([A-Z][A-Za-z0-9_]*)/g
    )
  ).map((match) => ({
    token: match[1],
    implementation: match[2],
  }));

const extractSpringBeanBindings = (text: string) =>
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

const extractAspNetServiceRegistrations = (text: string) =>
  Array.from(
    text.matchAll(
      /Add(?:Scoped|Singleton|Transient)\s*<\s*([A-Za-z_][A-Za-z0-9_<>]*)\s*,\s*([A-Za-z_][A-Za-z0-9_<>]*)\s*>\s*\(/g
    )
  ).map((match) => ({
    contract: normalizeTypeName(match[1]),
    implementation: normalizeTypeName(match[2]),
  }));

const createInsight = (
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
  }: Partial<Omit<StackStructuralInsight, 'adapterId' | 'displayName' | 'category' | 'summary'>> = {}
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
    .filter((relationship, index, all) =>
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

const nextJsAdapter: StackAdapter = {
  id: 'nextjs-topology',
  displayName: 'Next.js Topology',
  category: 'framework',
  supports: (context) => !!context.getDetectedStack('nextjs'),
  analyze: async (context) => {
    const graphSymbolIndex = buildGraphSymbolIndex(context.graph);
    const routeFiles = [
      ...context.findByRelativePrefix('app/').filter((filePath) =>
        /(?:^|\/)(page|layout|route)\.(tsx|ts|jsx|js)$/i.test(context.getProjectRelativePath(filePath))
      ),
      ...context.findByRelativePrefix('pages/').filter((filePath) =>
        /\.(tsx|ts|jsx|js)$/i.test(filePath)
      ),
    ];
    const apiRoutes = routeFiles
      .map((filePath) => context.getProjectRelativePath(filePath))
      .filter((relativePath) => relativePath.includes('/api/') || /\/route\.(tsx|ts|jsx|js)$/i.test(relativePath));
    const configFiles = context
      .getAllFilePaths()
      .filter((filePath) =>
        ['next.config.js', 'next.config.mjs', 'next.config.ts'].includes(
          context.getProjectRelativePath(filePath)
        )
      );
    const entryFiles = context
      .getAllFilePaths()
      .filter((filePath) =>
        [
          'app/layout.tsx',
          'app/layout.ts',
          'pages/_app.tsx',
          'pages/_app.ts',
          'pages/_document.tsx',
          'pages/_document.ts',
        ].includes(context.getProjectRelativePath(filePath))
      );
    const routePaths = routeFiles.map((filePath) => context.getProjectRelativePath(filePath));
    const layoutPaths = new Set(
      routePaths.filter((relativePath) => /(?:^|\/)layout\.(tsx|ts|jsx|js)$/i.test(relativePath))
    );
    const semanticRouteRelationships = routePaths.flatMap((relativePath) => {
      const nearestLayouts = getNearestNextLayouts(relativePath, layoutPaths).filter(
        (layoutPath) => layoutPath !== relativePath
      );
      const routeTarget = resolveSymbolEndpoint(relativePath, graphSymbolIndex);

      if (nearestLayouts.length > 0) {
        return nearestLayouts.map((layoutPath) =>
          createRelationship(
            resolveSymbolEndpoint(layoutPath, graphSymbolIndex),
            routeTarget,
            'framework',
            'nextjs_layout_route'
          )
        );
      }

      if (/\/page\.(tsx|ts|jsx|js)$/i.test(relativePath)) {
        return entryFiles.map((entryFile) =>
          createRelationship(
            resolveSymbolEndpoint(context.getProjectRelativePath(entryFile), graphSymbolIndex),
            routeTarget,
            'framework',
            'nextjs_route_handler'
          )
        );
      }

      return [];
    });

    return createInsight(
      nextJsAdapter.id,
      nextJsAdapter.displayName,
      nextJsAdapter.category,
      `Detected ${routeFiles.length} route-related files and ${apiRoutes.length} API route candidates in Next.js structure.`,
      {
        evidence: context.getDetectedStack('nextjs')?.evidence || [],
        routes: routePaths,
        modules: apiRoutes,
        entryFiles: toRelativeList(context, entryFiles),
        configFiles: toRelativeList(context, configFiles),
        relationships: [
          ...entryFiles.flatMap((entryFile) =>
            routeFiles.map((routeFile) =>
              createRelationship(
                resolveSymbolEndpoint(context.getProjectRelativePath(entryFile), graphSymbolIndex),
                resolveSymbolEndpoint(context.getProjectRelativePath(routeFile), graphSymbolIndex),
                'framework',
                'nextjs_entry_route'
              )
            )
          ),
          ...configFiles.flatMap((configFile) =>
            entryFiles.map((entryFile) => ({
              source: context.getProjectRelativePath(configFile),
              target: resolveSymbolEndpoint(context.getProjectRelativePath(entryFile), graphSymbolIndex),
              type: 'build' as const,
              reason: 'nextjs_config_entry',
            }))
          ),
          ...routePaths
            .filter((relativePath) => /\/route\.(tsx|ts|jsx|js)$/i.test(relativePath))
            .map((relativePath) =>
              createRelationship(
                entryFiles[0]
                  ? resolveSymbolEndpoint(context.getProjectRelativePath(entryFiles[0]), graphSymbolIndex)
                  : relativePath,
                resolveSymbolEndpoint(relativePath, graphSymbolIndex, {
                  preferredSymbols: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
                }),
                'framework',
                'nextjs_api_route_handler'
              )
            ),
          ...semanticRouteRelationships,
        ].filter((relationship) => relationship.source !== relationship.target),
      }
    );
  },
};

const nestJsAdapter: StackAdapter = {
  id: 'nestjs-topology',
  displayName: 'NestJS Topology',
  category: 'framework',
  supports: (context) => !!context.getDetectedStack('nestjs'),
  analyze: async (context) => {
    const graphSymbolIndex = buildGraphSymbolIndex(context.graph);
    const candidateFiles = context
      .getAllFilePaths()
      .filter((filePath) => /\.(ts|tsx|js|jsx)$/i.test(filePath));
    const contents = await context.readTexts(candidateFiles);
    const relativeContentEntries = contents.map((entry) => ({
      filePath: context.getProjectRelativePath(entry.filePath),
      text: entry.text,
    }));
    const contentByRelativePath = getContentByRelativePath(relativeContentEntries);

    const modules = relativeContentEntries
      .filter(({ text }) => /@Module\s*\(/.test(text))
      .map(({ filePath }) => filePath);
    const controllers = relativeContentEntries
      .filter(({ text }) => /@Controller\s*\(/.test(text))
      .map(({ filePath }) => filePath);
    const providers = relativeContentEntries
      .filter(({ text }) => /@Injectable\s*\(/.test(text))
      .map(({ filePath }) => filePath);
    const entryFiles = candidateFiles
      .filter((filePath) => ['main.ts', 'main.js'].includes(basename(filePath)))
      .map((filePath) => context.getProjectRelativePath(filePath));
    const controllerSymbols = buildSymbolToFileMap(
      relativeContentEntries.filter((entry) => controllers.includes(entry.filePath))
    );
    const providerSymbols = buildSymbolToFileMap(
      relativeContentEntries.filter((entry) => providers.includes(entry.filePath))
    );
    const moduleSymbols = buildSymbolToFileMap(
      relativeContentEntries.filter((entry) => modules.includes(entry.filePath))
    );
    const controllerProviderLinks = controllers.flatMap((controllerFile) =>
      findReferencedSymbolMatches(
        contentByRelativePath.get(controllerFile) || '',
        providerSymbols,
        [controllerFile]
      ).map(({ filePath, symbol }) =>
        createRelationship(
          resolveSymbolEndpoint(controllerFile, graphSymbolIndex, {
            preferredSymbols: inferClassSymbolsForFile(contentByRelativePath.get(controllerFile) || ''),
          }),
          resolveSymbolEndpoint(filePath, graphSymbolIndex, { preferredSymbols: [symbol] }),
          'framework',
          'nestjs_controller_provider'
        )
      )
    );
    const moduleSemanticLinks = modules.flatMap((moduleFile) => {
      const moduleText = contentByRelativePath.get(moduleFile) || '';
      return [
        ...findReferencedSymbolMatches(moduleText, controllerSymbols, [moduleFile]).map(
          ({ filePath, symbol }) =>
            createRelationship(
              resolveSymbolEndpoint(moduleFile, graphSymbolIndex, {
                preferredSymbols: inferClassSymbolsForFile(moduleText),
              }),
              resolveSymbolEndpoint(filePath, graphSymbolIndex, { preferredSymbols: [symbol] }),
              'framework',
              'nestjs_module_controller'
            )
        ),
        ...findReferencedSymbolMatches(moduleText, providerSymbols, [moduleFile]).map(
          ({ filePath, symbol }) =>
            createRelationship(
              resolveSymbolEndpoint(moduleFile, graphSymbolIndex, {
                preferredSymbols: inferClassSymbolsForFile(moduleText),
              }),
              resolveSymbolEndpoint(filePath, graphSymbolIndex, { preferredSymbols: [symbol] }),
              'framework',
              'nestjs_module_provider'
            )
        ),
        ...findReferencedSymbolMatches(moduleText, moduleSymbols, [moduleFile]).map(
          ({ filePath, symbol }) =>
            createRelationship(
              resolveSymbolEndpoint(moduleFile, graphSymbolIndex, {
                preferredSymbols: inferClassSymbolsForFile(moduleText),
              }),
              resolveSymbolEndpoint(filePath, graphSymbolIndex, { preferredSymbols: [symbol] }),
              'framework',
              'nestjs_module_import'
            )
        ),
      ];
    });
    const controllerMethodLinks = controllers.flatMap((controllerFile) =>
      extractNestRouteMethods(contentByRelativePath.get(controllerFile) || '').map((methodName) =>
        createRelationship(
          resolveSymbolEndpoint(controllerFile, graphSymbolIndex, {
            preferredSymbols: inferClassSymbolsForFile(contentByRelativePath.get(controllerFile) || ''),
          }),
          resolveSymbolEndpoint(controllerFile, graphSymbolIndex, { preferredSymbols: [methodName] }),
          'framework',
          'nestjs_controller_method'
        )
      )
    );
    const providerBindingLinks = modules.flatMap((moduleFile) => {
      const moduleText = contentByRelativePath.get(moduleFile) || '';
      const moduleEndpoint = resolveSymbolEndpoint(moduleFile, graphSymbolIndex, {
        preferredSymbols: inferClassSymbolsForFile(moduleText),
      });

      return extractNestProviderBindings(moduleText).flatMap(({ implementation }) =>
        Array.from(providerSymbols.entries())
          .filter(([symbol]) => symbol === implementation)
          .map(([, filePath]) =>
            createRelationship(
              moduleEndpoint,
              resolveSymbolEndpoint(filePath, graphSymbolIndex, { preferredSymbols: [implementation] }),
              'framework',
              'nestjs_provider_binding'
            )
          )
      );
    });

    return createInsight(
      nestJsAdapter.id,
      nestJsAdapter.displayName,
      nestJsAdapter.category,
      `Detected ${modules.length} Nest modules, ${controllers.length} controllers, and ${providers.length} injectable providers.`,
      {
        evidence: context.getDetectedStack('nestjs')?.evidence || [],
        entryFiles,
        components: controllers,
        modules: [...modules, ...providers],
        relationships: [
          ...entryFiles.flatMap((entryFile) =>
            modules.map((moduleFile) =>
              createRelationship(
                entryFile,
                resolveSymbolEndpoint(moduleFile, graphSymbolIndex, {
                  preferredSymbols: inferClassSymbolsForFile(contentByRelativePath.get(moduleFile) || ''),
                }),
                'framework',
                'nestjs_entry_module'
              )
            )
          ),
          ...moduleSemanticLinks,
          ...controllerProviderLinks,
          ...controllerMethodLinks,
          ...providerBindingLinks,
        ],
      }
    );
  },
};

const springBootAdapter: StackAdapter = {
  id: 'spring-boot-topology',
  displayName: 'Spring Boot Topology',
  category: 'framework',
  supports: (context) => !!context.getDetectedStack('spring-boot'),
  analyze: async (context) => {
    const graphSymbolIndex = buildGraphSymbolIndex(context.graph);
    const candidateFiles = context
      .getAllFilePaths()
      .filter((filePath) => /\.(java|kt)$/i.test(filePath));
    const contents = await context.readTexts(candidateFiles);
    const relativeContentEntries = contents.map((entry) => ({
      filePath: context.getProjectRelativePath(entry.filePath),
      text: entry.text,
    }));
    const contentByRelativePath = getContentByRelativePath(relativeContentEntries);

    const applications = relativeContentEntries
      .filter(({ text }) => /@SpringBootApplication\b/.test(text))
      .map(({ filePath }) => filePath);
    const controllers = relativeContentEntries
      .filter(({ text }) => /@(RestController|Controller)\b/.test(text))
      .map(({ filePath }) => filePath);
    const services = relativeContentEntries
      .filter(({ text }) => /@Service\b/.test(text))
      .map(({ filePath }) => filePath);
    const repositories = relativeContentEntries
      .filter(({ text }) => /@Repository\b/.test(text))
      .map(({ filePath }) => filePath);
    const configs = context
      .getAllFilePaths()
      .filter((filePath) =>
        ['pom.xml', 'build.gradle', 'build.gradle.kts', 'src/main/resources/application.yml', 'src/main/resources/application.properties'].includes(
          context.getProjectRelativePath(filePath)
        )
      );
    const serviceSymbols = buildSymbolToFileMap(
      relativeContentEntries.filter((entry) => services.includes(entry.filePath))
    );
    const repositorySymbols = buildSymbolToFileMap(
      relativeContentEntries.filter((entry) => repositories.includes(entry.filePath))
    );
    const controllerServiceLinks = controllers.flatMap((controllerFile) =>
      findReferencedSymbolMatches(
        contentByRelativePath.get(controllerFile) || '',
        serviceSymbols,
        [controllerFile]
      ).map(({ filePath, symbol }) =>
        createRelationship(
          resolveSymbolEndpoint(controllerFile, graphSymbolIndex, {
            preferredSymbols: inferClassSymbolsForFile(contentByRelativePath.get(controllerFile) || ''),
          }),
          resolveSymbolEndpoint(filePath, graphSymbolIndex, { preferredSymbols: [symbol] }),
          'framework',
          'springboot_controller_service'
        )
      )
    );
    const serviceRepositoryLinks = services.flatMap((serviceFile) =>
      findReferencedSymbolMatches(
        contentByRelativePath.get(serviceFile) || '',
        repositorySymbols,
        [serviceFile]
      ).map(({ filePath, symbol }) =>
        createRelationship(
          resolveSymbolEndpoint(serviceFile, graphSymbolIndex, {
            preferredSymbols: inferClassSymbolsForFile(contentByRelativePath.get(serviceFile) || ''),
          }),
          resolveSymbolEndpoint(filePath, graphSymbolIndex, { preferredSymbols: [symbol] }),
          'framework',
          'springboot_service_repository'
        )
      )
    );
    const controllerMethodLinks = controllers.flatMap((controllerFile) =>
      extractSpringRouteMethods(contentByRelativePath.get(controllerFile) || '').map((methodName) =>
        createRelationship(
          resolveSymbolEndpoint(controllerFile, graphSymbolIndex, {
            preferredSymbols: inferClassSymbolsForFile(contentByRelativePath.get(controllerFile) || ''),
          }),
          resolveSymbolEndpoint(controllerFile, graphSymbolIndex, { preferredSymbols: [methodName] }),
          'framework',
          'springboot_controller_method'
        )
      )
    );
    const beanBindingLinks = applications.flatMap((entryFile) => {
      const entryText = contentByRelativePath.get(entryFile) || '';
      const entryEndpoint = resolveSymbolEndpoint(entryFile, graphSymbolIndex, {
        preferredSymbols: inferClassSymbolsForFile(entryText),
      });

      return extractSpringBeanBindings(entryText).flatMap(({ returnType, methodName, implementationType }) => {
        const methodEndpoint = resolveSymbolEndpoint(entryFile, graphSymbolIndex, {
          preferredSymbols: [methodName],
        });
        const bindingTarget = implementationType || returnType;
        const matchingService = Array.from(serviceSymbols.entries()).find(
          ([symbol]) => symbol === bindingTarget
        );

        return [
          createRelationship(entryEndpoint, methodEndpoint, 'framework', 'springboot_bean_method'),
          ...(matchingService
            ? [
                createRelationship(
                  methodEndpoint,
                  resolveSymbolEndpoint(matchingService[1], graphSymbolIndex, {
                    preferredSymbols: [bindingTarget],
                  }),
                  'framework',
                  'springboot_bean_binding'
                ),
              ]
            : []),
        ];
      });
    });

    return createInsight(
      springBootAdapter.id,
      springBootAdapter.displayName,
      springBootAdapter.category,
      `Detected ${applications.length} application entrypoints, ${controllers.length} controllers, ${services.length} services, and ${repositories.length} repositories.`,
      {
        evidence: context.getDetectedStack('spring-boot')?.evidence || [],
        entryFiles: applications,
        configFiles: toRelativeList(context, configs),
        components: controllers,
        modules: [...services, ...repositories],
        relationships: [
          ...applications.flatMap((entryFile) =>
            controllers.map((controllerFile) =>
              createRelationship(
                resolveSymbolEndpoint(entryFile, graphSymbolIndex, {
                  preferredSymbols: inferClassSymbolsForFile(contentByRelativePath.get(entryFile) || ''),
                }),
                resolveSymbolEndpoint(controllerFile, graphSymbolIndex, {
                  preferredSymbols: inferClassSymbolsForFile(contentByRelativePath.get(controllerFile) || ''),
                }),
                'framework',
                'springboot_entry_controller'
              )
            )
          ),
          ...controllerServiceLinks,
          ...serviceRepositoryLinks,
          ...controllerMethodLinks,
          ...beanBindingLinks,
          ...configs.flatMap((configFile) =>
            applications.map((entryFile) => ({
              source: context.getProjectRelativePath(configFile),
              target: resolveSymbolEndpoint(entryFile, graphSymbolIndex),
              type: 'build' as const,
              reason: 'springboot_config_entry',
            }))
          ),
        ],
      }
    );
  },
};

const ktorAdapter: StackAdapter = {
  id: 'ktor-topology',
  displayName: 'Ktor Topology',
  category: 'framework',
  supports: (context) => !!context.getDetectedStack('ktor'),
  analyze: async (context) => {
    const graphSymbolIndex = buildGraphSymbolIndex(context.graph);
    const candidateFiles = context.getAllFilePaths().filter((filePath) => /\.(kt|java)$/i.test(filePath));
    const contents = await context.readTexts(candidateFiles);
    const relativeContentEntries = contents.map((entry) => ({
      filePath: context.getProjectRelativePath(entry.filePath),
      text: entry.text,
    }));
    const contentByRelativePath = getContentByRelativePath(relativeContentEntries);
    const functionSymbols = buildNamedSymbolToFileMap(relativeContentEntries, extractJvmFunctionNames);

    const entryFiles = relativeContentEntries
      .filter(({ text }) => /\bembeddedServer\s*\(|\bEngineMain\b|fun\s+Application\.module\s*\(/.test(text))
      .map(({ filePath }) => filePath);
    const routeFiles = relativeContentEntries
      .filter(({ text }) => /\brouting\s*\{|\broute\s*\(|\b(?:get|post|put|patch|delete)\s*\(/.test(text))
      .map(({ filePath }) => filePath);
    const configFiles = context
      .getAllFilePaths()
      .filter((filePath) =>
        [
          'pom.xml',
          'build.gradle',
          'build.gradle.kts',
          'src/main/resources/application.conf',
          'src/main/resources/application.yml',
          'src/main/resources/application.properties',
        ].includes(context.getProjectRelativePath(filePath))
      );

    const routeFunctionLinks = routeFiles.flatMap((routeFile) =>
      extractKtorRouteFunctions(contentByRelativePath.get(routeFile) || '')
        .map((functionName) => ({ functionName, filePath: functionSymbols.get(functionName) || routeFile }))
        .map(({ functionName, filePath }) =>
          createRelationship(
            resolveSymbolEndpoint(routeFile, graphSymbolIndex),
            resolveSymbolEndpoint(filePath, graphSymbolIndex, { preferredSymbols: [functionName] }),
            'framework',
            'ktor_route_function'
          )
        )
    );

    return createInsight(
      ktorAdapter.id,
      ktorAdapter.displayName,
      ktorAdapter.category,
      `Detected ${entryFiles.length} Ktor entry files and ${routeFiles.length} route-bearing modules.`,
      {
        evidence: context.getDetectedStack('ktor')?.evidence || [],
        entryFiles,
        configFiles: toRelativeList(context, configFiles),
        routes: routeFiles,
        relationships: [
          ...entryFiles.flatMap((entryFile) =>
            routeFiles.map((routeFile) =>
              createRelationship(
                resolveSymbolEndpoint(entryFile, graphSymbolIndex),
                resolveSymbolEndpoint(routeFile, graphSymbolIndex),
                'framework',
                'ktor_entry_routes'
              )
            )
          ),
          ...routeFunctionLinks,
          ...configFiles.flatMap((configFile) =>
            entryFiles.map((entryFile) => ({
              source: context.getProjectRelativePath(configFile),
              target: resolveSymbolEndpoint(entryFile, graphSymbolIndex),
              type: 'build' as const,
              reason: 'ktor_config_entry',
            }))
          ),
        ],
      }
    );
  },
};

const micronautAdapter: StackAdapter = {
  id: 'micronaut-topology',
  displayName: 'Micronaut Topology',
  category: 'framework',
  supports: (context) => !!context.getDetectedStack('micronaut'),
  analyze: async (context) => {
    const graphSymbolIndex = buildGraphSymbolIndex(context.graph);
    const candidateFiles = context.getAllFilePaths().filter((filePath) => /\.(java|kt)$/i.test(filePath));
    const contents = await context.readTexts(candidateFiles);
    const relativeContentEntries = contents.map((entry) => ({
      filePath: context.getProjectRelativePath(entry.filePath),
      text: entry.text,
    }));
    const contentByRelativePath = getContentByRelativePath(relativeContentEntries);

    const entryFiles = relativeContentEntries
      .filter(({ text }) => /\bMicronaut\.run\s*\(/.test(text))
      .map(({ filePath }) => filePath);
    const controllers = relativeContentEntries
      .filter(({ text }) => /@Controller\b/.test(text))
      .map(({ filePath }) => filePath);
    const services = relativeContentEntries
      .filter(({ text }) => /@(Singleton|Service)\b/.test(text))
      .map(({ filePath }) => filePath);
    const repositories = relativeContentEntries
      .filter(({ text }) => /@Repository\b/.test(text))
      .map(({ filePath }) => filePath);
    const configFiles = context
      .getAllFilePaths()
      .filter((filePath) =>
        [
          'pom.xml',
          'build.gradle',
          'build.gradle.kts',
          'src/main/resources/application.yml',
          'src/main/resources/application.properties',
        ].includes(context.getProjectRelativePath(filePath))
      );

    const serviceSymbols = buildSymbolToFileMap(
      relativeContentEntries.filter((entry) => services.includes(entry.filePath))
    );
    const repositorySymbols = buildSymbolToFileMap(
      relativeContentEntries.filter((entry) => repositories.includes(entry.filePath))
    );

    const controllerServiceLinks = controllers.flatMap((controllerFile) =>
      findReferencedSymbolMatches(contentByRelativePath.get(controllerFile) || '', serviceSymbols, [controllerFile]).map(
        ({ filePath, symbol }) =>
          createRelationship(
            resolveSymbolEndpoint(controllerFile, graphSymbolIndex, {
              preferredSymbols: inferClassSymbolsForFile(contentByRelativePath.get(controllerFile) || ''),
            }),
            resolveSymbolEndpoint(filePath, graphSymbolIndex, { preferredSymbols: [symbol] }),
            'framework',
            'micronaut_controller_service'
          )
      )
    );

    const serviceRepositoryLinks = services.flatMap((serviceFile) =>
      findReferencedSymbolMatches(contentByRelativePath.get(serviceFile) || '', repositorySymbols, [serviceFile]).map(
        ({ filePath, symbol }) =>
          createRelationship(
            resolveSymbolEndpoint(serviceFile, graphSymbolIndex, {
              preferredSymbols: inferClassSymbolsForFile(contentByRelativePath.get(serviceFile) || ''),
            }),
            resolveSymbolEndpoint(filePath, graphSymbolIndex, { preferredSymbols: [symbol] }),
            'framework',
            'micronaut_service_repository'
          )
      )
    );

    const controllerMethodLinks = controllers.flatMap((controllerFile) =>
      extractMicronautRouteMethods(contentByRelativePath.get(controllerFile) || '').map((methodName) =>
        createRelationship(
          resolveSymbolEndpoint(controllerFile, graphSymbolIndex, {
            preferredSymbols: inferClassSymbolsForFile(contentByRelativePath.get(controllerFile) || ''),
          }),
          resolveSymbolEndpoint(controllerFile, graphSymbolIndex, { preferredSymbols: [methodName] }),
          'framework',
          'micronaut_controller_method'
        )
      )
    );

    return createInsight(
      micronautAdapter.id,
      micronautAdapter.displayName,
      micronautAdapter.category,
      `Detected ${entryFiles.length} Micronaut entry files, ${controllers.length} controllers, ${services.length} services, and ${repositories.length} repositories.`,
      {
        evidence: context.getDetectedStack('micronaut')?.evidence || [],
        entryFiles,
        configFiles: toRelativeList(context, configFiles),
        components: controllers,
        modules: [...services, ...repositories],
        relationships: [
          ...entryFiles.flatMap((entryFile) =>
            controllers.map((controllerFile) =>
              createRelationship(
                resolveSymbolEndpoint(entryFile, graphSymbolIndex),
                resolveSymbolEndpoint(controllerFile, graphSymbolIndex, {
                  preferredSymbols: inferClassSymbolsForFile(contentByRelativePath.get(controllerFile) || ''),
                }),
                'framework',
                'micronaut_entry_controller'
              )
            )
          ),
          ...controllerServiceLinks,
          ...serviceRepositoryLinks,
          ...controllerMethodLinks,
          ...configFiles.flatMap((configFile) =>
            entryFiles.map((entryFile) => ({
              source: context.getProjectRelativePath(configFile),
              target: resolveSymbolEndpoint(entryFile, graphSymbolIndex),
              type: 'build' as const,
              reason: 'micronaut_config_entry',
            }))
          ),
        ],
      }
    );
  },
};

const quarkusAdapter: StackAdapter = {
  id: 'quarkus-topology',
  displayName: 'Quarkus Topology',
  category: 'framework',
  supports: (context) => !!context.getDetectedStack('quarkus'),
  analyze: async (context) => {
    const graphSymbolIndex = buildGraphSymbolIndex(context.graph);
    const candidateFiles = context.getAllFilePaths().filter((filePath) => /\.(java|kt)$/i.test(filePath));
    const contents = await context.readTexts(candidateFiles);
    const relativeContentEntries = contents.map((entry) => ({
      filePath: context.getProjectRelativePath(entry.filePath),
      text: entry.text,
    }));
    const contentByRelativePath = getContentByRelativePath(relativeContentEntries);

    const entryFiles = relativeContentEntries
      .filter(({ text }) => /\bQuarkus\.run\s*\(|@QuarkusMain\b|\bimplements\s+QuarkusApplication\b/.test(text))
      .map(({ filePath }) => filePath);
    const resources = relativeContentEntries
      .filter(({ text }) => /@Path\s*\(/.test(text))
      .map(({ filePath }) => filePath);
    const services = relativeContentEntries
      .filter(({ text }) => /@(ApplicationScoped|Singleton)\b/.test(text))
      .map(({ filePath }) => filePath);
    const configFiles = context
      .getAllFilePaths()
      .filter((filePath) =>
        [
          'pom.xml',
          'build.gradle',
          'build.gradle.kts',
          'src/main/resources/application.yml',
          'src/main/resources/application.properties',
        ].includes(context.getProjectRelativePath(filePath))
      );

    const serviceSymbols = buildSymbolToFileMap(
      relativeContentEntries.filter((entry) => services.includes(entry.filePath))
    );

    const resourceServiceLinks = resources.flatMap((resourceFile) =>
      findReferencedSymbolMatches(contentByRelativePath.get(resourceFile) || '', serviceSymbols, [resourceFile]).map(
        ({ filePath, symbol }) =>
          createRelationship(
            resolveSymbolEndpoint(resourceFile, graphSymbolIndex, {
              preferredSymbols: inferClassSymbolsForFile(contentByRelativePath.get(resourceFile) || ''),
            }),
            resolveSymbolEndpoint(filePath, graphSymbolIndex, { preferredSymbols: [symbol] }),
            'framework',
            'quarkus_resource_service'
          )
      )
    );

    const resourceMethodLinks = resources.flatMap((resourceFile) =>
      extractJakartaRouteMethods(contentByRelativePath.get(resourceFile) || '').map((methodName) =>
        createRelationship(
          resolveSymbolEndpoint(resourceFile, graphSymbolIndex, {
            preferredSymbols: inferClassSymbolsForFile(contentByRelativePath.get(resourceFile) || ''),
          }),
          resolveSymbolEndpoint(resourceFile, graphSymbolIndex, { preferredSymbols: [methodName] }),
          'framework',
          'quarkus_resource_method'
        )
      )
    );

    return createInsight(
      quarkusAdapter.id,
      quarkusAdapter.displayName,
      quarkusAdapter.category,
      `Detected ${entryFiles.length} Quarkus entry files, ${resources.length} REST resources, and ${services.length} scoped services.`,
      {
        evidence: context.getDetectedStack('quarkus')?.evidence || [],
        entryFiles,
        configFiles: toRelativeList(context, configFiles),
        components: resources,
        modules: services,
        relationships: [
          ...entryFiles.flatMap((entryFile) =>
            resources.map((resourceFile) =>
              createRelationship(
                resolveSymbolEndpoint(entryFile, graphSymbolIndex),
                resolveSymbolEndpoint(resourceFile, graphSymbolIndex, {
                  preferredSymbols: inferClassSymbolsForFile(contentByRelativePath.get(resourceFile) || ''),
                }),
                'framework',
                'quarkus_entry_resource'
              )
            )
          ),
          ...resourceServiceLinks,
          ...resourceMethodLinks,
          ...configFiles.flatMap((configFile) =>
            entryFiles.map((entryFile) => ({
              source: context.getProjectRelativePath(configFile),
              target: resolveSymbolEndpoint(entryFile, graphSymbolIndex),
              type: 'build' as const,
              reason: 'quarkus_config_entry',
            }))
          ),
        ],
      }
    );
  },
};

const aspNetAdapter: StackAdapter = {
  id: 'aspnet-core-topology',
  displayName: 'ASP.NET Core Topology',
  category: 'framework',
  supports: (context) => !!context.getDetectedStack('aspnet-core'),
  analyze: async (context) => {
    const graphSymbolIndex = buildGraphSymbolIndex(context.graph);
    const candidateFiles = context
      .getAllFilePaths()
      .filter((filePath) => /\.(cs)$/i.test(filePath));
    const contents = await context.readTexts(candidateFiles);
    const relativeContentEntries = contents.map((entry) => ({
      filePath: context.getProjectRelativePath(entry.filePath),
      text: entry.text,
    }));
    const contentByRelativePath = getContentByRelativePath(relativeContentEntries);

    const programFiles = relativeContentEntries
      .filter(({ text }) => /WebApplication\.CreateBuilder|Host\.CreateDefaultBuilder|CreateHostBuilder/.test(text))
      .map(({ filePath }) => filePath);
    const controllers = relativeContentEntries
      .filter(({ text }) => /\[ApiController\]|ControllerBase|: Controller\b/.test(text))
      .map(({ filePath }) => filePath);
    const minimalApis = relativeContentEntries
      .filter(({ text }) => /Map(Get|Post|Put|Delete|Group)\s*\(/.test(text))
      .map(({ filePath }) => filePath);
    const serviceCandidates = relativeContentEntries
      .filter(
        ({ filePath, text }) =>
          /service/i.test(filePath) ||
          /\b(?:class|interface)\s+I?[A-Z][A-Za-z0-9_]*Service\b/.test(text)
      )
      .map(({ filePath }) => filePath);
    const projectFiles = context
      .getAllFilePaths()
      .filter((filePath) => /\.(csproj|sln)$/i.test(filePath));
    const serviceSymbols = buildSymbolToFileMap(
      relativeContentEntries.filter((entry) => serviceCandidates.includes(entry.filePath))
    );
    const controllerServiceLinks = controllers.flatMap((controllerFile) =>
      findReferencedSymbolMatches(
        contentByRelativePath.get(controllerFile) || '',
        serviceSymbols,
        [controllerFile]
      ).map(({ filePath, symbol }) =>
        createRelationship(
          resolveSymbolEndpoint(controllerFile, graphSymbolIndex, {
            preferredSymbols: inferClassSymbolsForFile(contentByRelativePath.get(controllerFile) || ''),
          }),
          resolveSymbolEndpoint(filePath, graphSymbolIndex, { preferredSymbols: [symbol] }),
          'framework',
          'aspnet_controller_service'
        )
      )
    );
    const controllerMethodLinks = controllers.flatMap((controllerFile) =>
      extractAspNetRouteMethods(contentByRelativePath.get(controllerFile) || '').map((methodName) =>
        createRelationship(
          resolveSymbolEndpoint(controllerFile, graphSymbolIndex, {
            preferredSymbols: inferClassSymbolsForFile(contentByRelativePath.get(controllerFile) || ''),
          }),
          resolveSymbolEndpoint(controllerFile, graphSymbolIndex, { preferredSymbols: [methodName] }),
          'framework',
          'aspnet_controller_method'
        )
      )
    );
    const serviceRegistrationLinks = programFiles.flatMap((programFile) => {
      const programText = contentByRelativePath.get(programFile) || '';
      const programEndpoint = resolveSymbolEndpoint(programFile, graphSymbolIndex, {
        preferredSymbols: inferClassSymbolsForFile(programText),
      });

      return extractAspNetServiceRegistrations(programText).flatMap(({ contract, implementation }) => {
        const matchingContract = Array.from(serviceSymbols.entries()).find(([symbol]) => symbol === contract);
        const matchingImplementation = Array.from(serviceSymbols.entries()).find(
          ([symbol]) => symbol === implementation
        );

        return [
          ...(matchingContract
            ? [
                createRelationship(
                  programEndpoint,
                  resolveSymbolEndpoint(matchingContract[1], graphSymbolIndex, {
                    preferredSymbols: [contract],
                  }),
                  'framework',
                  'aspnet_service_contract'
                ),
              ]
            : []),
          ...(matchingImplementation
            ? [
                createRelationship(
                  programEndpoint,
                  resolveSymbolEndpoint(matchingImplementation[1], graphSymbolIndex, {
                    preferredSymbols: [implementation],
                  }),
                  'framework',
                  'aspnet_service_registration'
                ),
              ]
            : []),
        ];
      });
    });

    return createInsight(
      aspNetAdapter.id,
      aspNetAdapter.displayName,
      aspNetAdapter.category,
      `Detected ${controllers.length} controller files, ${minimalApis.length} minimal API candidates, and ${projectFiles.length} .NET project descriptors.`,
      {
        evidence: context.getDetectedStack('aspnet-core')?.evidence || [],
        entryFiles: programFiles,
        configFiles: toRelativeList(context, projectFiles),
        components: controllers,
        routes: minimalApis,
        relationships: [
          ...programFiles.flatMap((entryFile) =>
            [...controllers, ...minimalApis].map((targetFile) =>
              createRelationship(
                resolveSymbolEndpoint(entryFile, graphSymbolIndex, {
                  preferredSymbols: inferClassSymbolsForFile(contentByRelativePath.get(entryFile) || ''),
                }),
                resolveSymbolEndpoint(targetFile, graphSymbolIndex, {
                  preferredSymbols: inferClassSymbolsForFile(contentByRelativePath.get(targetFile) || ''),
                }),
                'framework',
                'aspnet_entry_runtime'
              )
            )
          ),
          ...controllerServiceLinks,
          ...controllerMethodLinks,
          ...serviceRegistrationLinks,
          ...projectFiles.map((projectFile) => ({
            source: context.getProjectRelativePath(projectFile),
            target: programFiles[0]
              ? resolveSymbolEndpoint(programFiles[0], graphSymbolIndex)
              : context.getProjectRelativePath(projectFile),
            type: 'build' as const,
            reason: 'dotnet_project_entry',
          })),
        ],
      }
    );
  },
};

const fastApiAdapter: StackAdapter = {
  id: 'fastapi-topology',
  displayName: 'FastAPI Topology',
  category: 'framework',
  supports: (context) => !!context.getDetectedStack('fastapi'),
  analyze: async (context) => {
    const graphSymbolIndex = buildGraphSymbolIndex(context.graph);
    const candidateFiles = context.getAllFilePaths().filter((filePath) => /\.py$/i.test(filePath));
    const contents = await context.readTexts(candidateFiles);
    const relativeContentEntries = contents.map((entry) => ({
      filePath: context.getProjectRelativePath(entry.filePath),
      text: entry.text,
    }));
    const contentByRelativePath = getContentByRelativePath(relativeContentEntries);

    const entryFiles = relativeContentEntries
      .filter(({ text }) => /\bFastAPI\s*\(/.test(text))
      .map(({ filePath }) => filePath);
    const routerFiles = relativeContentEntries
      .filter(({ text }) => /\bAPIRouter\s*\(/.test(text))
      .map(({ filePath }) => filePath);
    const routeFiles = relativeContentEntries
      .filter(({ text }) =>
        /@(?:[A-Za-z_][A-Za-z0-9_]*)\.(?:get|post|put|patch|delete|options|head|api_route)\s*\(/.test(
          text
        )
      )
      .map(({ filePath }) => filePath);
    const configFiles = context
      .getAllFilePaths()
      .filter((filePath) =>
        ['requirements.txt', 'requirements-dev.txt', 'pyproject.toml'].includes(
          context.getProjectRelativePath(filePath)
        )
      );

    const routerHandlerLinks = routeFiles.flatMap((routeFile) =>
      extractFastApiRouteFunctions(contentByRelativePath.get(routeFile) || '').map((handlerName) =>
        createRelationship(
          resolveSymbolEndpoint(routeFile, graphSymbolIndex),
          resolveSymbolEndpoint(routeFile, graphSymbolIndex, { preferredSymbols: [handlerName] }),
          'framework',
          routerFiles.includes(routeFile) ? 'fastapi_router_handler' : 'fastapi_app_handler'
        )
      )
    );

    const entryRouterLinks = entryFiles.flatMap((entryFile) =>
      routerFiles
        .filter((routerFile) => routerFile !== entryFile)
        .map((routerFile) =>
          createRelationship(
            resolveSymbolEndpoint(entryFile, graphSymbolIndex),
            resolveSymbolEndpoint(routerFile, graphSymbolIndex),
            'framework',
            'fastapi_entry_router'
          )
        )
    );

    return createInsight(
      fastApiAdapter.id,
      fastApiAdapter.displayName,
      fastApiAdapter.category,
      `Detected ${entryFiles.length} FastAPI app entrypoints, ${routerFiles.length} router files, and ${routeFiles.length} route-bearing modules.`,
      {
        evidence: context.getDetectedStack('fastapi')?.evidence || [],
        entryFiles,
        configFiles: toRelativeList(context, configFiles),
        routes: routeFiles,
        modules: routerFiles,
        relationships: [
          ...entryRouterLinks,
          ...routerHandlerLinks,
          ...configFiles.flatMap((configFile) =>
            entryFiles.map((entryFile) => ({
              source: context.getProjectRelativePath(configFile),
              target: resolveSymbolEndpoint(entryFile, graphSymbolIndex),
              type: 'build' as const,
              reason: 'fastapi_config_entry',
            }))
          ),
        ],
      }
    );
  },
};

const djangoAdapter: StackAdapter = {
  id: 'django-topology',
  displayName: 'Django Topology',
  category: 'framework',
  supports: (context) => !!context.getDetectedStack('django'),
  analyze: async (context) => {
    const graphSymbolIndex = buildGraphSymbolIndex(context.graph);
    const candidateFiles = context.getAllFilePaths().filter((filePath) => /\.py$/i.test(filePath));
    const contents = await context.readTexts(candidateFiles);
    const relativeContentEntries = contents.map((entry) => ({
      filePath: context.getProjectRelativePath(entry.filePath),
      text: entry.text,
    }));
    const contentByRelativePath = getContentByRelativePath(relativeContentEntries);

    const manageFiles = relativeContentEntries
      .filter(({ filePath }) => basename(filePath) === 'manage.py')
      .map(({ filePath }) => filePath);
    const settingsFiles = relativeContentEntries
      .filter(({ filePath }) => basename(filePath) === 'settings.py')
      .map(({ filePath }) => filePath);
    const urlFiles = relativeContentEntries
      .filter(({ filePath, text }) => basename(filePath) === 'urls.py' || /\burlpatterns\s*=/.test(text))
      .map(({ filePath }) => filePath);
    const viewFiles = relativeContentEntries
      .filter(
        ({ filePath, text }) =>
          basename(filePath) === 'views.py' ||
          /\b(?:async\s+def|def)\s+[A-Za-z_][A-Za-z0-9_]*\s*\(/.test(text) ||
          /\bclass\s+[A-Z][A-Za-z0-9_]*(?:View|ViewSet)\b/.test(text)
      )
      .map(({ filePath }) => filePath);
    const modelFiles = relativeContentEntries
      .filter(({ filePath, text }) => basename(filePath) === 'models.py' || /\bmodels\.Model\b/.test(text))
      .map(({ filePath }) => filePath);
    const configFiles = context
      .getAllFilePaths()
      .filter((filePath) =>
        ['requirements.txt', 'requirements-dev.txt', 'pyproject.toml'].includes(
          context.getProjectRelativePath(filePath)
        )
      );

    const viewSymbols = buildNamedSymbolToFileMap(
      relativeContentEntries.filter((entry) => viewFiles.includes(entry.filePath)),
      (text) => [...extractPythonFunctionNames(text), ...inferClassSymbolsForFile(text)]
    );
    const modelSymbols = buildSymbolToFileMap(
      relativeContentEntries.filter((entry) => modelFiles.includes(entry.filePath))
    );

    const urlViewLinks = urlFiles.flatMap((urlFile) =>
      extractDjangoUrlTargets(contentByRelativePath.get(urlFile) || '')
        .map((symbol) => ({ symbol, filePath: viewSymbols.get(symbol) }))
        .filter((entry): entry is { symbol: string; filePath: string } => Boolean(entry.filePath))
        .map(({ symbol, filePath }) =>
          createRelationship(
            resolveSymbolEndpoint(urlFile, graphSymbolIndex),
            resolveSymbolEndpoint(filePath, graphSymbolIndex, { preferredSymbols: [symbol] }),
            'framework',
            'django_url_view'
          )
        )
    );

    const participatingViewFiles = new Set(
      urlViewLinks.map((relationship) => relationship.target.split('#')[0])
    );
    const viewModelLinks = Array.from(participatingViewFiles).flatMap((viewFile) =>
      findReferencedSymbolMatches(contentByRelativePath.get(viewFile) || '', modelSymbols, [viewFile]).map(
        ({ filePath, symbol }) =>
          createRelationship(
            resolveSymbolEndpoint(viewFile, graphSymbolIndex),
            resolveSymbolEndpoint(filePath, graphSymbolIndex, { preferredSymbols: [symbol] }),
            'framework',
            'django_view_model'
          )
      )
    );

    return createInsight(
      djangoAdapter.id,
      djangoAdapter.displayName,
      djangoAdapter.category,
      `Detected ${manageFiles.length} Django entry files, ${urlFiles.length} URL modules, ${viewFiles.length} view modules, and ${modelFiles.length} model modules.`,
      {
        evidence: context.getDetectedStack('django')?.evidence || [],
        entryFiles: manageFiles,
        configFiles: toRelativeList(context, [...configFiles, ...settingsFiles]),
        components: viewFiles,
        modules: [...urlFiles, ...modelFiles],
        relationships: [
          ...manageFiles.flatMap((manageFile) =>
            settingsFiles.map((settingsFile) =>
              createRelationship(
                resolveSymbolEndpoint(manageFile, graphSymbolIndex),
                resolveSymbolEndpoint(settingsFile, graphSymbolIndex),
                'framework',
                'django_manage_settings'
              )
            )
          ),
          ...settingsFiles.flatMap((settingsFile) =>
            urlFiles.map((urlFile) =>
              createRelationship(
                resolveSymbolEndpoint(settingsFile, graphSymbolIndex),
                resolveSymbolEndpoint(urlFile, graphSymbolIndex),
                'framework',
                'django_settings_urls'
              )
            )
          ),
          ...urlViewLinks,
          ...viewModelLinks,
          ...configFiles.flatMap((configFile) =>
            manageFiles.map((manageFile) => ({
              source: context.getProjectRelativePath(configFile),
              target: resolveSymbolEndpoint(manageFile, graphSymbolIndex),
              type: 'build' as const,
              reason: 'django_config_entry',
            }))
          ),
        ],
      }
    );
  },
};

const railsAdapter: StackAdapter = {
  id: 'rails-topology',
  displayName: 'Rails Topology',
  category: 'framework',
  supports: (context) => !!context.getDetectedStack('rails'),
  analyze: async (context) => {
    const graphSymbolIndex = buildGraphSymbolIndex(context.graph);
    const candidateFiles = context.getAllFilePaths().filter((filePath) => /\.rb$/i.test(filePath));
    const contents = await context.readTexts(candidateFiles);
    const relativeContentEntries = contents.map((entry) => ({
      filePath: context.getProjectRelativePath(entry.filePath),
      text: entry.text,
    }));
    const contentByRelativePath = getContentByRelativePath(relativeContentEntries);

    const routeFiles = relativeContentEntries
      .filter(({ filePath }) => filePath === 'config/routes.rb')
      .map(({ filePath }) => filePath);
    const entryFiles = relativeContentEntries
      .filter(({ filePath }) => ['config/application.rb', 'config/environment.rb'].includes(filePath))
      .map(({ filePath }) => filePath);
    const controllerFiles = relativeContentEntries
      .filter(({ filePath }) => /^app\/controllers\/.+_controller\.rb$/i.test(filePath))
      .map(({ filePath }) => filePath);
    const modelFiles = relativeContentEntries
      .filter(({ filePath }) => /^app\/models\/.+\.rb$/i.test(filePath))
      .map(({ filePath }) => filePath);
    const modelSymbols = buildSymbolToFileMap(
      relativeContentEntries.filter((entry) => modelFiles.includes(entry.filePath))
    );

    const routeControllerLinks = routeFiles.flatMap((routeFile) =>
      extractRailsResourceTargets(contentByRelativePath.get(routeFile) || '').flatMap((resourceName) =>
        controllerFiles
          .filter((controllerFile) =>
            basename(controllerFile).toLowerCase() === `${resourceName.toLowerCase()}_controller.rb`
          )
          .map((controllerFile) =>
            createRelationship(
              resolveSymbolEndpoint(routeFile, graphSymbolIndex),
              resolveSymbolEndpoint(controllerFile, graphSymbolIndex),
              'framework',
              'rails_routes_controller'
            )
          )
      )
    );

    const controllerModelLinks = controllerFiles.flatMap((controllerFile) =>
      findReferencedSymbolMatches(
        contentByRelativePath.get(controllerFile) || '',
        modelSymbols,
        [controllerFile]
      ).map(({ filePath, symbol }) =>
        createRelationship(
          resolveSymbolEndpoint(controllerFile, graphSymbolIndex),
          resolveSymbolEndpoint(filePath, graphSymbolIndex, { preferredSymbols: [symbol] }),
          'framework',
          'rails_controller_model'
        )
      )
    );

    return createInsight(
      railsAdapter.id,
      railsAdapter.displayName,
      railsAdapter.category,
      `Detected ${routeFiles.length} Rails route descriptors, ${controllerFiles.length} controllers, and ${modelFiles.length} models.`,
      {
        evidence: context.getDetectedStack('rails')?.evidence || [],
        entryFiles,
        configFiles: ['Gemfile', ...routeFiles],
        components: controllerFiles,
        modules: modelFiles,
        relationships: [
          ...entryFiles.flatMap((entryFile) =>
            routeFiles.map((routeFile) =>
              createRelationship(
                resolveSymbolEndpoint(entryFile, graphSymbolIndex),
                resolveSymbolEndpoint(routeFile, graphSymbolIndex),
                'framework',
                'rails_entry_routes'
              )
            )
          ),
          ...routeControllerLinks,
          ...controllerModelLinks,
        ],
      }
    );
  },
};

const laravelAdapter: StackAdapter = {
  id: 'laravel-topology',
  displayName: 'Laravel Topology',
  category: 'framework',
  supports: (context) => !!context.getDetectedStack('laravel'),
  analyze: async (context) => {
    const graphSymbolIndex = buildGraphSymbolIndex(context.graph);
    const candidateFiles = context.getAllFilePaths().filter((filePath) => /\.php$/i.test(filePath));
    const contents = await context.readTexts(candidateFiles);
    const relativeContentEntries = contents.map((entry) => ({
      filePath: context.getProjectRelativePath(entry.filePath),
      text: entry.text,
    }));
    const contentByRelativePath = getContentByRelativePath(relativeContentEntries);

    const entryFiles = context
      .getAllFilePaths()
      .filter((filePath) => context.getProjectRelativePath(filePath) === 'artisan')
      .map((filePath) => context.getProjectRelativePath(filePath));
    const routeFiles = relativeContentEntries
      .filter(({ filePath }) => /^routes\/.+\.php$/i.test(filePath))
      .map(({ filePath }) => filePath);
    const controllerFiles = relativeContentEntries
      .filter(({ filePath }) => /^app\/Http\/Controllers\/.+\.php$/i.test(filePath))
      .map(({ filePath }) => filePath);
    const modelFiles = relativeContentEntries
      .filter(
        ({ filePath, text }) =>
          /^app\/Models\/.+\.php$/i.test(filePath) || /\bextends\s+Model\b/.test(text)
      )
      .map(({ filePath }) => filePath);
    const configFiles = context
      .getAllFilePaths()
      .filter((filePath) =>
        ['composer.json'].includes(context.getProjectRelativePath(filePath))
      );

    const controllerSymbols = buildSymbolToFileMap(
      relativeContentEntries.filter((entry) => controllerFiles.includes(entry.filePath))
    );
    const modelSymbols = buildSymbolToFileMap(
      relativeContentEntries.filter((entry) => modelFiles.includes(entry.filePath))
    );

    const routeControllerLinks = routeFiles.flatMap((routeFile) =>
      extractLaravelControllerTargets(contentByRelativePath.get(routeFile) || '')
        .map((symbol) => ({ symbol, filePath: controllerSymbols.get(symbol) }))
        .filter((entry): entry is { symbol: string; filePath: string } => Boolean(entry.filePath))
        .map(({ symbol, filePath }) =>
          createRelationship(
            resolveSymbolEndpoint(routeFile, graphSymbolIndex),
            resolveSymbolEndpoint(filePath, graphSymbolIndex, { preferredSymbols: [symbol] }),
            'framework',
            'laravel_route_controller'
          )
        )
    );

    const controllerModelLinks = controllerFiles.flatMap((controllerFile) =>
      findReferencedSymbolMatches(
        contentByRelativePath.get(controllerFile) || '',
        modelSymbols,
        [controllerFile]
      ).map(({ filePath, symbol }) =>
        createRelationship(
          resolveSymbolEndpoint(controllerFile, graphSymbolIndex),
          resolveSymbolEndpoint(filePath, graphSymbolIndex, { preferredSymbols: [symbol] }),
          'framework',
          'laravel_controller_model'
        )
      )
    );

    return createInsight(
      laravelAdapter.id,
      laravelAdapter.displayName,
      laravelAdapter.category,
      `Detected ${routeFiles.length} Laravel route files, ${controllerFiles.length} controllers, and ${modelFiles.length} models.`,
      {
        evidence: context.getDetectedStack('laravel')?.evidence || [],
        entryFiles,
        configFiles: toRelativeList(context, configFiles),
        components: controllerFiles,
        modules: modelFiles,
        relationships: [
          ...entryFiles.flatMap((entryFile) =>
            routeFiles.map((routeFile) =>
              createRelationship(
                resolveSymbolEndpoint(entryFile, graphSymbolIndex),
                resolveSymbolEndpoint(routeFile, graphSymbolIndex),
                'framework',
                'laravel_artisan_routes'
              )
            )
          ),
          ...routeControllerLinks,
          ...controllerModelLinks,
          ...configFiles.flatMap((configFile) =>
            entryFiles.map((entryFile) => ({
              source: context.getProjectRelativePath(configFile),
              target: resolveSymbolEndpoint(entryFile, graphSymbolIndex),
              type: 'build' as const,
              reason: 'laravel_config_entry',
            }))
          ),
        ],
      }
    );
  },
};

const createGoWebAdapter = (options: {
  stackId: string;
  adapterId: string;
  displayName: string;
  entryPattern: RegExp;
  routePattern: RegExp;
  entryReason: string;
  handlerReason: string;
  configReason: string;
}) =>
  ({
    id: options.adapterId,
    displayName: options.displayName,
    category: 'framework',
    supports: (context) => !!context.getDetectedStack(options.stackId),
    analyze: async (context) => {
      const graphSymbolIndex = buildGraphSymbolIndex(context.graph);
      const candidateFiles = context.getAllFilePaths().filter((filePath) => /\.go$/i.test(filePath));
      const contents = await context.readTexts(candidateFiles);
      const relativeContentEntries = contents.map((entry) => ({
        filePath: context.getProjectRelativePath(entry.filePath),
        text: entry.text,
      }));
      const contentByRelativePath = getContentByRelativePath(relativeContentEntries);
      const functionSymbols = buildNamedSymbolToFileMap(relativeContentEntries, extractGoFunctionNames);
      const configFiles = context
        .getAllFilePaths()
        .filter((filePath) => context.getProjectRelativePath(filePath) === 'go.mod');
      const entryFiles = relativeContentEntries
        .filter(({ text }) => options.entryPattern.test(text))
        .map(({ filePath }) => filePath);
      const routeFiles = relativeContentEntries
        .filter(({ text }) => options.routePattern.test(text))
        .map(({ filePath }) => filePath);

      const routeHandlerLinks = routeFiles.flatMap((routeFile) =>
        extractGoRouteHandlers(contentByRelativePath.get(routeFile) || '')
          .map((handlerName) => ({ handlerName, filePath: functionSymbols.get(handlerName) || routeFile }))
          .map(({ handlerName, filePath }) =>
            createRelationship(
              resolveSymbolEndpoint(routeFile, graphSymbolIndex),
              resolveSymbolEndpoint(filePath, graphSymbolIndex, { preferredSymbols: [handlerName] }),
              'framework',
              options.handlerReason
            )
          )
      );

      return createInsight(
        options.adapterId,
        options.displayName,
        'framework',
        `Detected ${entryFiles.length} ${options.displayName} entry files and ${routeFiles.length} route-bearing modules.`,
        {
          evidence: context.getDetectedStack(options.stackId)?.evidence || [],
          entryFiles,
          configFiles: toRelativeList(context, configFiles),
          routes: routeFiles,
          relationships: [
            ...entryFiles.flatMap((entryFile) =>
              routeFiles.map((routeFile) =>
                createRelationship(
                  resolveSymbolEndpoint(entryFile, graphSymbolIndex),
                  resolveSymbolEndpoint(routeFile, graphSymbolIndex),
                  'framework',
                  options.entryReason
                )
              )
            ),
            ...routeHandlerLinks,
            ...configFiles.flatMap((configFile) =>
              entryFiles.map((entryFile) => ({
                source: context.getProjectRelativePath(configFile),
                target: resolveSymbolEndpoint(entryFile, graphSymbolIndex),
                type: 'build' as const,
                reason: options.configReason,
              }))
            ),
          ],
        }
      );
    },
  }) satisfies StackAdapter;

const ginAdapter = createGoWebAdapter({
  stackId: 'gin',
  adapterId: 'gin-topology',
  displayName: 'Gin Topology',
  entryPattern: /\bgin\.(?:Default|New)\s*\(/,
  routePattern:
    /\.(?:GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD|Any)\s*\([^,]+,\s*[A-Za-z_][A-Za-z0-9_]*\s*\)/,
  entryReason: 'gin_entry_router',
  handlerReason: 'gin_router_handler',
  configReason: 'gomod_gin_entry',
});

const fiberAdapter = createGoWebAdapter({
  stackId: 'fiber',
  adapterId: 'fiber-topology',
  displayName: 'Fiber Topology',
  entryPattern: /\bfiber\.New\s*\(/,
  routePattern:
    /\.(?:Get|Post|Put|Patch|Delete|Options|Head|All)\s*\([^,]+,\s*[A-Za-z_][A-Za-z0-9_]*\s*\)/,
  entryReason: 'fiber_entry_router',
  handlerReason: 'fiber_router_handler',
  configReason: 'gomod_fiber_entry',
});

const echoAdapter = createGoWebAdapter({
  stackId: 'echo',
  adapterId: 'echo-topology',
  displayName: 'Echo Topology',
  entryPattern: /\becho\.New\s*\(/,
  routePattern:
    /\.(?:GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD|Any)\s*\([^,]+,\s*[A-Za-z_][A-Za-z0-9_]*\s*\)/,
  entryReason: 'echo_entry_router',
  handlerReason: 'echo_router_handler',
  configReason: 'gomod_echo_entry',
});

const axumAdapter: StackAdapter = {
  id: 'axum-topology',
  displayName: 'Axum Topology',
  category: 'framework',
  supports: (context) => !!context.getDetectedStack('axum'),
  analyze: async (context) => {
    const graphSymbolIndex = buildGraphSymbolIndex(context.graph);
    const candidateFiles = context.getAllFilePaths().filter((filePath) => /\.rs$/i.test(filePath));
    const contents = await context.readTexts(candidateFiles);
    const relativeContentEntries = contents.map((entry) => ({
      filePath: context.getProjectRelativePath(entry.filePath),
      text: entry.text,
    }));
    const contentByRelativePath = getContentByRelativePath(relativeContentEntries);
    const functionSymbols = buildNamedSymbolToFileMap(relativeContentEntries, extractRustFunctionNames);
    const configFiles = context
      .getAllFilePaths()
      .filter((filePath) => context.getProjectRelativePath(filePath) === 'Cargo.toml');
    const entryFiles = relativeContentEntries
      .filter(({ text }) => /\bRouter::new\s*\(|\baxum::serve\s*\(/.test(text))
      .map(({ filePath }) => filePath);
    const routeFiles = relativeContentEntries
      .filter(({ text }) =>
        /\.route\s*\([^,]+,\s*(?:get|post|put|patch|delete|options|head|any)\s*\(/.test(text)
      )
      .map(({ filePath }) => filePath);

    const routeHandlerLinks = routeFiles.flatMap((routeFile) =>
      extractAxumHandlerNames(contentByRelativePath.get(routeFile) || '')
        .map((handlerName) => ({ handlerName, filePath: functionSymbols.get(handlerName) || routeFile }))
        .map(({ handlerName, filePath }) =>
          createRelationship(
            resolveSymbolEndpoint(routeFile, graphSymbolIndex),
            resolveSymbolEndpoint(filePath, graphSymbolIndex, { preferredSymbols: [handlerName] }),
            'framework',
            'axum_router_handler'
          )
        )
    );

    return createInsight(
      axumAdapter.id,
      axumAdapter.displayName,
      axumAdapter.category,
      `Detected ${entryFiles.length} Axum entry files and ${routeFiles.length} route-bearing modules.`,
      {
        evidence: context.getDetectedStack('axum')?.evidence || [],
        entryFiles,
        configFiles: toRelativeList(context, configFiles),
        routes: routeFiles,
        relationships: [
          ...entryFiles.flatMap((entryFile) =>
            routeFiles.map((routeFile) =>
              createRelationship(
                resolveSymbolEndpoint(entryFile, graphSymbolIndex),
                resolveSymbolEndpoint(routeFile, graphSymbolIndex),
                'framework',
                'axum_entry_router'
              )
            )
          ),
          ...routeHandlerLinks,
          ...configFiles.flatMap((configFile) =>
            entryFiles.map((entryFile) => ({
              source: context.getProjectRelativePath(configFile),
              target: resolveSymbolEndpoint(entryFile, graphSymbolIndex),
              type: 'build' as const,
              reason: 'cargo_axum_entry',
            }))
          ),
        ],
      }
    );
  },
};

const actixAdapter: StackAdapter = {
  id: 'actix-web-topology',
  displayName: 'Actix Web Topology',
  category: 'framework',
  supports: (context) => !!context.getDetectedStack('actix-web'),
  analyze: async (context) => {
    const graphSymbolIndex = buildGraphSymbolIndex(context.graph);
    const candidateFiles = context.getAllFilePaths().filter((filePath) => /\.rs$/i.test(filePath));
    const contents = await context.readTexts(candidateFiles);
    const relativeContentEntries = contents.map((entry) => ({
      filePath: context.getProjectRelativePath(entry.filePath),
      text: entry.text,
    }));
    const contentByRelativePath = getContentByRelativePath(relativeContentEntries);
    const functionSymbols = buildNamedSymbolToFileMap(relativeContentEntries, extractRustFunctionNames);
    const configFiles = context
      .getAllFilePaths()
      .filter((filePath) => context.getProjectRelativePath(filePath) === 'Cargo.toml');
    const entryFiles = relativeContentEntries
      .filter(({ text }) => /\bHttpServer::new\s*\(|\bApp::new\s*\(/.test(text))
      .map(({ filePath }) => filePath);
    const routeFiles = relativeContentEntries
      .filter(({ text }) =>
        /\b(?:web::(?:get|post|put|patch|delete)\s*\(\)\.to\s*\(|#\[(?:get|post|put|patch|delete|route))/.test(
          text
        )
      )
      .map(({ filePath }) => filePath);

    const routeHandlerLinks = routeFiles.flatMap((routeFile) =>
      extractActixHandlerNames(contentByRelativePath.get(routeFile) || '')
        .map((handlerName) => ({ handlerName, filePath: functionSymbols.get(handlerName) || routeFile }))
        .map(({ handlerName, filePath }) =>
          createRelationship(
            resolveSymbolEndpoint(routeFile, graphSymbolIndex),
            resolveSymbolEndpoint(filePath, graphSymbolIndex, { preferredSymbols: [handlerName] }),
            'framework',
            'actix_route_handler'
          )
        )
    );

    return createInsight(
      actixAdapter.id,
      actixAdapter.displayName,
      actixAdapter.category,
      `Detected ${entryFiles.length} Actix entry files and ${routeFiles.length} route-bearing modules.`,
      {
        evidence: context.getDetectedStack('actix-web')?.evidence || [],
        entryFiles,
        configFiles: toRelativeList(context, configFiles),
        routes: routeFiles,
        relationships: [
          ...entryFiles.flatMap((entryFile) =>
            routeFiles.map((routeFile) =>
              createRelationship(
                resolveSymbolEndpoint(entryFile, graphSymbolIndex),
                resolveSymbolEndpoint(routeFile, graphSymbolIndex),
                'framework',
                'actix_entry_routes'
              )
            )
          ),
          ...routeHandlerLinks,
          ...configFiles.flatMap((configFile) =>
            entryFiles.map((entryFile) => ({
              source: context.getProjectRelativePath(configFile),
              target: resolveSymbolEndpoint(entryFile, graphSymbolIndex),
              type: 'build' as const,
              reason: 'cargo_actix_entry',
            }))
          ),
        ],
      }
    );
  },
};

const chiAdapter = createGoWebAdapter({
  stackId: 'chi',
  adapterId: 'chi-topology',
  displayName: 'Chi Topology',
  entryPattern: /\bchi\.NewRouter\s*\(/,
  routePattern:
    /\.(?:Get|Post|Put|Patch|Delete|Method|Handle|Mount)\s*\([^,]+,\s*[A-Za-z_][A-Za-z0-9_]*\s*\)/,
  entryReason: 'chi_entry_router',
  handlerReason: 'chi_router_handler',
  configReason: 'gomod_chi_entry',
});

const grpcGoAdapter: StackAdapter = {
  id: 'grpc-go-topology',
  displayName: 'gRPC-Go Topology',
  category: 'framework',
  supports: (context) => !!context.getDetectedStack('grpc-go'),
  analyze: async (context) => {
    const graphSymbolIndex = buildGraphSymbolIndex(context.graph);
    const candidateFiles = context.getAllFilePaths().filter((filePath) => /\.go$/i.test(filePath));
    const contents = await context.readTexts(candidateFiles);
    const relativeContentEntries = contents.map((entry) => ({
      filePath: context.getProjectRelativePath(entry.filePath),
      text: entry.text,
    }));
    const contentByRelativePath = getContentByRelativePath(relativeContentEntries);
    const goSymbols = buildNamedSymbolToFileMap(relativeContentEntries, extractGoFunctionNames);
    const typeSymbols = buildSymbolToFileMap(relativeContentEntries);
    const configFiles = context
      .getAllFilePaths()
      .filter((filePath) => context.getProjectRelativePath(filePath) === 'go.mod');
    const entryFiles = relativeContentEntries
      .filter(({ text }) => /\bgrpc\.NewServer\s*\(/.test(text))
      .map(({ filePath }) => filePath);
    const registrationFiles = relativeContentEntries
      .filter(({ text }) => /\bRegister[A-Z][A-Za-z0-9_]*Server\s*\(/.test(text))
      .map(({ filePath }) => filePath);

    const registrationLinks = registrationFiles.flatMap((registrationFile) =>
      extractGrpcRegistrationTargets(contentByRelativePath.get(registrationFile) || '').flatMap(
        ({ implementation }) => {
          const matchedFile =
            typeSymbols.get(implementation) || goSymbols.get(implementation.replace(/Server$/, 'Server'));
          if (!matchedFile) {
            return [];
          }

          return [
            createRelationship(
              resolveSymbolEndpoint(registrationFile, graphSymbolIndex),
              resolveSymbolEndpoint(matchedFile, graphSymbolIndex, { preferredSymbols: [implementation] }),
              'framework',
              'grpc_registration_handler'
            ),
          ];
        }
      )
    );

    return createInsight(
      grpcGoAdapter.id,
      grpcGoAdapter.displayName,
      grpcGoAdapter.category,
      `Detected ${entryFiles.length} gRPC server entry files and ${registrationFiles.length} registration-bearing modules.`,
      {
        evidence: context.getDetectedStack('grpc-go')?.evidence || [],
        entryFiles,
        configFiles: toRelativeList(context, configFiles),
        modules: registrationFiles,
        relationships: [
          ...entryFiles.flatMap((entryFile) =>
            registrationFiles.map((registrationFile) =>
              createRelationship(
                resolveSymbolEndpoint(entryFile, graphSymbolIndex),
                resolveSymbolEndpoint(registrationFile, graphSymbolIndex),
                'framework',
                'grpc_entry_registration'
              )
            )
          ),
          ...registrationLinks,
          ...configFiles.flatMap((configFile) =>
            entryFiles.map((entryFile) => ({
              source: context.getProjectRelativePath(configFile),
              target: resolveSymbolEndpoint(entryFile, graphSymbolIndex),
              type: 'build' as const,
              reason: 'gomod_grpc_entry',
            }))
          ),
        ],
      }
    );
  },
};

const viteAdapter: StackAdapter = {
  id: 'vite-build-topology',
  displayName: 'Vite Build Topology',
  category: 'build',
  supports: (context) => !!context.getDetectedStack('vite'),
  analyze: async (context) => {
    const configFiles = context
      .getAllFilePaths()
      .filter((filePath) =>
        ['vite.config.ts', 'vite.config.js', 'vite.config.mjs'].includes(
          context.getProjectRelativePath(filePath)
        )
      );
    const entryFiles = context
      .getAllFilePaths()
      .filter((filePath) =>
        ['index.html', 'src/main.ts', 'src/main.tsx', 'src/main.js', 'src/main.jsx'].includes(
          context.getProjectRelativePath(filePath)
        )
      );
    const modules = context
      .getAllFilePaths()
      .filter((filePath) =>
        context.getProjectRelativePath(filePath).startsWith('src/') &&
        /\.(ts|tsx|js|jsx)$/.test(filePath)
      )
      .slice(0, 25)
      .map((filePath) => context.getProjectRelativePath(filePath));

    return createInsight(
      viteAdapter.id,
      viteAdapter.displayName,
      viteAdapter.category,
      `Detected ${configFiles.length} Vite config files and ${entryFiles.length} likely web entrypoints.`,
      {
        evidence: context.getDetectedStack('vite')?.evidence || [],
        entryFiles: toRelativeList(context, entryFiles),
        configFiles: toRelativeList(context, configFiles),
        modules,
        relationships: [
          ...configFiles.flatMap((configFile) =>
            entryFiles.map((entryFile) => ({
              source: context.getProjectRelativePath(configFile),
              target: context.getProjectRelativePath(entryFile),
              type: 'build' as const,
              reason: 'vite_config_entry',
            }))
          ),
        ],
      }
    );
  },
};

type ParsedJsonValue = Record<string, unknown> | null;
type WorkspacePackageManifest = {
  filePath: string;
  name: string;
  dependencies: string[];
  scripts: string[];
};

const parseJsonObject = (text: string): ParsedJsonValue => {
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const getObjectRecord = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const getStringArray = (value: unknown) =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

const extractPackageJsonWorkspacePatterns = (text: string) => {
  const parsed = parseJsonObject(text);
  if (!parsed) {
    return [];
  }

  const workspaces = parsed.workspaces;
  if (Array.isArray(workspaces)) {
    return getStringArray(workspaces);
  }

  const workspaceRecord = getObjectRecord(workspaces);
  return workspaceRecord ? getStringArray(workspaceRecord.packages) : [];
};

const extractPnpmWorkspacePatterns = (text: string) => {
  const lines = text.split(/\r?\n/);
  const patterns: string[] = [];
  let inPackagesBlock = false;

  for (const line of lines) {
    if (/^\s*packages\s*:\s*$/.test(line)) {
      inPackagesBlock = true;
      continue;
    }

    if (inPackagesBlock) {
      const match = line.match(/^\s*-\s*['"]?([^'"]+)['"]?\s*$/);
      if (match?.[1]) {
        patterns.push(match[1].trim());
        continue;
      }

      if (line.trim() && !/^\s/.test(line)) {
        break;
      }
    }
  }

  return patterns;
};

const workspacePatternToRegExp = (pattern: string) => {
  const normalized = pattern.replace(/\\/g, '/').replace(/\/package\.json$/i, '');
  const escaped = escapeRegExp(normalized)
    .replace(/\\\*\\\*/g, '.*')
    .replace(/\\\*/g, '[^/]+');
  return new RegExp(`^${escaped}$`);
};

const matchesWorkspacePattern = (relativePackageJsonPath: string, pattern: string) => {
  const normalizedPath = relativePackageJsonPath.replace(/\\/g, '/');
  const packageDirectory = path.posix.dirname(normalizedPath);
  const matcher = workspacePatternToRegExp(pattern);
  return matcher.test(packageDirectory) || matcher.test(normalizedPath);
};

const collectWorkspacePackageManifests = async (
  context: StackAdapterContext,
  workspacePatterns: string[]
): Promise<{
  manifests: WorkspacePackageManifest[];
  byName: Map<string, WorkspacePackageManifest>;
  relativeEntries: FileContentEntry[];
}> => {
  const packageFiles = context.findBySuffix('package.json');
  const packageContents = await context.readTexts(packageFiles);
  const relativeEntries = packageContents.map((entry) => ({
    filePath: context.getProjectRelativePath(entry.filePath),
    text: entry.text,
  }));

  const manifests = relativeEntries
    .filter((entry) => entry.filePath !== 'package.json')
    .filter((entry) => workspacePatterns.some((pattern) => matchesWorkspacePattern(entry.filePath, pattern)))
    .map((entry) => {
      const parsed = parseJsonObject(entry.text);
      const dependencies = [
        ...Object.keys(getObjectRecord(parsed?.dependencies) || {}),
        ...Object.keys(getObjectRecord(parsed?.devDependencies) || {}),
        ...Object.keys(getObjectRecord(parsed?.peerDependencies) || {}),
      ];
      const scripts = Object.keys(getObjectRecord(parsed?.scripts) || {});
      return {
        filePath: entry.filePath,
        name: typeof parsed?.name === 'string' ? parsed.name : path.posix.basename(path.posix.dirname(entry.filePath)),
        dependencies,
        scripts,
      };
    });

  const byName = new Map(manifests.map((manifest) => [manifest.name, manifest]));
  return { manifests, byName, relativeEntries };
};

const pnpmWorkspaceAdapter: StackAdapter = {
  id: 'pnpm-workspace-topology',
  displayName: 'pnpm Workspace Topology',
  category: 'build',
  supports: (context) =>
    !!context.getDetectedStack('pnpm-workspace') ||
    (!!context.getDetectedStack('pnpm') && context.hasRelativePath('pnpm-workspace.yaml')),
  analyze: async (context) => {
    const configFiles = context
      .getAllFilePaths()
      .filter((filePath) =>
        ['pnpm-workspace.yaml', 'package.json', 'pnpm-lock.yaml'].includes(
          context.getProjectRelativePath(filePath)
        )
      );
    const workspaceYaml = context
      .getAllFilePaths()
      .find((filePath) => context.getProjectRelativePath(filePath) === 'pnpm-workspace.yaml');
    const rootPackageJson = context
      .getAllFilePaths()
      .find((filePath) => context.getProjectRelativePath(filePath) === 'package.json');
    const workspacePatterns = new Set<string>();
    const workspaceRootDescriptor = workspaceYaml ? 'pnpm-workspace.yaml' : 'package.json';

    if (workspaceYaml) {
      const text = await context.readText(workspaceYaml);
      for (const pattern of extractPnpmWorkspacePatterns(text || '')) {
        workspacePatterns.add(pattern);
      }
    }

    if (rootPackageJson) {
      const text = await context.readText(rootPackageJson);
      for (const pattern of extractPackageJsonWorkspacePatterns(text || '')) {
        workspacePatterns.add(pattern);
      }
    }

    const { manifests, byName } = await collectWorkspacePackageManifests(context, Array.from(workspacePatterns));
    const relationships = [
      ...manifests.map((manifest) =>
        createRelationship(workspaceRootDescriptor, manifest.filePath, 'build', 'pnpm_workspace_package')
      ),
      ...manifests.flatMap((manifest) =>
        manifest.dependencies.flatMap((dependencyName) => {
          const target = byName.get(dependencyName);
          if (!target || target.filePath === manifest.filePath) {
            return [];
          }
          return [
            createRelationship(
              manifest.filePath,
              target.filePath,
              'build',
              'pnpm_workspace_dependency'
            ),
          ];
        })
      ),
    ];

    return createInsight(
      pnpmWorkspaceAdapter.id,
      pnpmWorkspaceAdapter.displayName,
      pnpmWorkspaceAdapter.category,
      `Detected ${manifests.length} workspace packages and ${relationships.length} pnpm workspace relationships.`,
      {
        evidence: [
          ...(context.getDetectedStack('pnpm-workspace')?.evidence || []),
          ...(context.getDetectedStack('pnpm')?.evidence || []),
        ],
        entryFiles: [workspaceRootDescriptor],
        configFiles: toRelativeList(context, configFiles),
        modules: manifests.map((manifest) => manifest.filePath),
        relationships,
      }
    );
  },
};

const extractNxImplicitDependencies = (text: string) => {
  const parsed = parseJsonObject(text);
  return getStringArray(parsed?.implicitDependencies);
};

const nxWorkspaceAdapter: StackAdapter = {
  id: 'nx-workspace-topology',
  displayName: 'Nx Workspace Topology',
  category: 'build',
  supports: (context) => !!context.getDetectedStack('nx'),
  analyze: async (context) => {
    const nxJson = context
      .getAllFilePaths()
      .find((filePath) => context.getProjectRelativePath(filePath) === 'nx.json');
    if (!nxJson) {
      return null;
    }

    const projectJsonFiles = context
      .getAllFilePaths()
      .filter((filePath) => /(?:^|\/)project\.json$/i.test(context.getProjectRelativePath(filePath)));
    const projectContents = await context.readTexts(projectJsonFiles);
    const relativeProjectEntries = projectContents.map((entry) => ({
      filePath: context.getProjectRelativePath(entry.filePath),
      text: entry.text,
    }));
    const projectByName = new Map<string, string>();
    for (const entry of relativeProjectEntries) {
      const parsed = parseJsonObject(entry.text);
      const explicitName = typeof parsed?.name === 'string' ? parsed.name : null;
      const inferredName = path.posix.basename(path.posix.dirname(entry.filePath));
      projectByName.set(explicitName || inferredName, entry.filePath);
    }

    const relationships = [
      ...relativeProjectEntries.map((entry) =>
        createRelationship('nx.json', entry.filePath, 'build', 'nx_workspace_project')
      ),
      ...relativeProjectEntries.flatMap((entry) =>
        extractNxImplicitDependencies(entry.text).flatMap((dependencyName) => {
          const target = projectByName.get(dependencyName);
          if (!target || target === entry.filePath) {
            return [];
          }
          return [
            createRelationship(entry.filePath, target, 'build', 'nx_implicit_dependency'),
          ];
        })
      ),
      ...relativeProjectEntries.flatMap((entry) => {
        const packageJsonCandidate = path.posix.join(path.posix.dirname(entry.filePath), 'package.json');
        return context.hasRelativePath(packageJsonCandidate)
          ? [createRelationship(entry.filePath, packageJsonCandidate, 'build', 'nx_project_package')]
          : [];
      }),
    ];

    return createInsight(
      nxWorkspaceAdapter.id,
      nxWorkspaceAdapter.displayName,
      nxWorkspaceAdapter.category,
      `Detected ${relativeProjectEntries.length} Nx projects and ${relationships.length} workspace relationships.`,
      {
        evidence: context.getDetectedStack('nx')?.evidence || [],
        entryFiles: ['nx.json'],
        configFiles: ['nx.json'],
        modules: relativeProjectEntries.map((entry) => entry.filePath),
        relationships,
      }
    );
  },
};

const extractTurboTaskNames = (text: string) => {
  const parsed = parseJsonObject(text);
  const taskRecord = getObjectRecord(parsed?.tasks) || getObjectRecord(parsed?.pipeline);
  return taskRecord ? Object.keys(taskRecord) : [];
};

const turborepoAdapter: StackAdapter = {
  id: 'turborepo-build-topology',
  displayName: 'Turborepo Build Topology',
  category: 'build',
  supports: (context) => !!context.getDetectedStack('turborepo'),
  analyze: async (context) => {
    const turboJson = context
      .getAllFilePaths()
      .find((filePath) => context.getProjectRelativePath(filePath) === 'turbo.json');
    const rootPackageJson = context
      .getAllFilePaths()
      .find((filePath) => context.getProjectRelativePath(filePath) === 'package.json');
    if (!turboJson || !rootPackageJson) {
      return null;
    }

    const turboText = (await context.readText(turboJson)) || '';
    const packageText = (await context.readText(rootPackageJson)) || '';
    const taskNames = extractTurboTaskNames(turboText);
    const workspacePatterns = extractPackageJsonWorkspacePatterns(packageText);
    const { manifests, byName } = await collectWorkspacePackageManifests(context, workspacePatterns);
    const taskAwarePackages = manifests.filter((manifest) =>
      taskNames.length === 0 ? true : manifest.scripts.some((script) => taskNames.includes(script))
    );

    const relationships = [
      ...taskAwarePackages.map((manifest) =>
        createRelationship('turbo.json', manifest.filePath, 'build', 'turbo_pipeline_package')
      ),
      ...taskAwarePackages.flatMap((manifest) =>
        manifest.dependencies.flatMap((dependencyName) => {
          const target = byName.get(dependencyName);
          if (!target || target.filePath === manifest.filePath) {
            return [];
          }
          return [
            createRelationship(
              manifest.filePath,
              target.filePath,
              'build',
              'turbo_workspace_dependency'
            ),
          ];
        })
      ),
    ];

    return createInsight(
      turborepoAdapter.id,
      turborepoAdapter.displayName,
      turborepoAdapter.category,
      `Detected ${taskAwarePackages.length} Turborepo packages participating in the pipeline and ${relationships.length} related build links.`,
      {
        evidence: context.getDetectedStack('turborepo')?.evidence || [],
        entryFiles: ['turbo.json'],
        configFiles: ['turbo.json', 'package.json'],
        modules: taskAwarePackages.map((manifest) => manifest.filePath),
        relationships,
      }
    );
  },
};

const extractQuotedValues = (text: string) =>
  Array.from(text.matchAll(/["']([^"'\\]+)["']/g))
    .map((match) => match[1])
    .filter((value): value is string => Boolean(value));

const extractNamedListValues = (text: string, fieldNames: string[]) =>
  fieldNames.flatMap((fieldName) =>
    Array.from(
      text.matchAll(new RegExp(`\\b${escapeRegExp(fieldName)}\\s*=\\s*\\[([\\s\\S]*?)\\]`, 'g'))
    ).flatMap((match) => extractQuotedValues(match[1] || ''))
  );

const extractBazelSrcs = (text: string) => extractNamedListValues(text, ['srcs', 'outs', 'hdrs']);
const extractBazelDeps = (text: string) => extractNamedListValues(text, ['deps', 'exports', 'runtime_deps']);

const resolveBazelBuildFile = (context: StackAdapterContext, packagePath: string) => {
  const normalizedPackage = packagePath.replace(/^\/+|\/+$/g, '');
  const candidates = [
    normalizedPackage ? `${normalizedPackage}/BUILD.bazel` : 'BUILD.bazel',
    normalizedPackage ? `${normalizedPackage}/BUILD` : 'BUILD',
  ];

  return candidates.find((candidate) => context.hasRelativePath(candidate)) || null;
};

const resolveBazelLabel = (
  context: StackAdapterContext,
  sourceRelativePath: string,
  rawLabel: string
): { descriptor?: string; file?: string } | null => {
  const label = rawLabel.trim();
  if (!label || label.startsWith('@')) {
    return null;
  }

  const sourceDir = path.posix.dirname(sourceRelativePath);

  if (!label.startsWith('//') && !label.startsWith(':')) {
    const fileCandidate = path.posix.normalize(path.posix.join(sourceDir, label));
    return context.hasRelativePath(fileCandidate) ? { file: fileCandidate } : null;
  }

  let packagePath = '';
  let target = '';

  if (label.startsWith('//')) {
    const [, body] = label.split('//');
    const [pkg, targetName = ''] = (body || '').split(':');
    packagePath = pkg || '';
    target = targetName;
  } else {
    packagePath = sourceDir === '.' ? '' : sourceDir;
    target = label.slice(1);
  }

  if (target && /[./]/.test(target)) {
    const fileCandidate = path.posix.normalize(path.posix.join(packagePath, target));
    if (context.hasRelativePath(fileCandidate)) {
      return { file: fileCandidate };
    }
  }

  const descriptor = resolveBazelBuildFile(context, packagePath);
  return descriptor ? { descriptor } : null;
};

const extractPantsSources = (text: string) => extractNamedListValues(text, ['sources']);
const extractPantsDependencies = (text: string) => extractNamedListValues(text, ['dependencies']);

const resolvePantsBuildFile = (context: StackAdapterContext, packagePath: string) => {
  const normalizedPackage = packagePath.replace(/^\/+|\/+$/g, '');
  const candidates = [
    normalizedPackage ? `${normalizedPackage}/BUILD` : 'BUILD',
    normalizedPackage ? `${normalizedPackage}/BUILD.pants` : 'BUILD.pants',
  ];

  return candidates.find((candidate) => context.hasRelativePath(candidate)) || null;
};

const resolvePantsAddress = (
  context: StackAdapterContext,
  sourceRelativePath: string,
  rawAddress: string
): { descriptor?: string; file?: string } | null => {
  const address = rawAddress.trim();
  if (!address || address.startsWith('//') || address.includes('@')) {
    return null;
  }

  const sourceDir = path.posix.dirname(sourceRelativePath);

  if (!address.includes(':')) {
    const fileCandidate = path.posix.normalize(path.posix.join(sourceDir, address));
    return context.hasRelativePath(fileCandidate) ? { file: fileCandidate } : null;
  }

  const [maybePath, target = ''] = address.split(':');
  const packagePath = maybePath ? maybePath : sourceDir === '.' ? '' : sourceDir;

  if (target && /[./]/.test(target)) {
    const fileCandidate = path.posix.normalize(path.posix.join(packagePath, target));
    if (context.hasRelativePath(fileCandidate)) {
      return { file: fileCandidate };
    }
  }

  const descriptor = resolvePantsBuildFile(context, packagePath);
  return descriptor ? { descriptor } : null;
};

const bazelAdapter: StackAdapter = {
  id: 'bazel-build-topology',
  displayName: 'Bazel Build Topology',
  category: 'build',
  supports: (context) => !!context.getDetectedStack('bazel'),
  analyze: async (context) => {
    const configFiles = context
      .getAllFilePaths()
      .filter((filePath) =>
        ['WORKSPACE', 'WORKSPACE.bazel', 'MODULE.bazel'].includes(context.getProjectRelativePath(filePath))
      );
    const buildFiles = context
      .getAllFilePaths()
      .filter((filePath) =>
        ['BUILD', 'BUILD.bazel'].includes(path.posix.basename(context.getProjectRelativePath(filePath)))
      );
    const buildContents = await context.readTexts(buildFiles);
    const relativeEntries = buildContents.map((entry) => ({
      filePath: context.getProjectRelativePath(entry.filePath),
      text: entry.text,
    }));

    const relationships: StackStructuralRelationship[] = [
      ...configFiles.flatMap((configFile) =>
        relativeEntries.map((entry) =>
          createRelationship(context.getProjectRelativePath(configFile), entry.filePath, 'build', 'bazel_workspace_package')
        )
      ),
      ...relativeEntries.flatMap((entry) =>
        extractBazelSrcs(entry.text).flatMap((sourceValue) => {
          const resolved = resolveBazelLabel(context, entry.filePath, sourceValue);
          return resolved?.file
            ? [createRelationship(entry.filePath, resolved.file, 'build', 'bazel_target_source')]
            : [];
        })
      ),
      ...relativeEntries.flatMap((entry) =>
        extractBazelDeps(entry.text).flatMap((dependencyLabel) => {
          const resolved = resolveBazelLabel(context, entry.filePath, dependencyLabel);
          if (resolved?.descriptor && resolved.descriptor !== entry.filePath) {
            return [
              createRelationship(entry.filePath, resolved.descriptor, 'build', 'bazel_target_dependency'),
            ];
          }
          return resolved?.file
            ? [createRelationship(entry.filePath, resolved.file, 'build', 'bazel_target_dependency')]
            : [];
        })
      ),
    ];

    return createInsight(
      bazelAdapter.id,
      bazelAdapter.displayName,
      bazelAdapter.category,
      `Detected ${buildFiles.length} Bazel BUILD descriptors and ${relationships.length} workspace/dependency/source relationships.`,
      {
        evidence: context.getDetectedStack('bazel')?.evidence || [],
        entryFiles: toRelativeList(context, configFiles),
        configFiles: toRelativeList(context, [...configFiles, ...buildFiles]),
        modules: relativeEntries.map((entry) => entry.filePath),
        relationships,
      }
    );
  },
};

const pantsAdapter: StackAdapter = {
  id: 'pants-build-topology',
  displayName: 'Pants Build Topology',
  category: 'build',
  supports: (context) => !!context.getDetectedStack('pants'),
  analyze: async (context) => {
    const configFiles = context
      .getAllFilePaths()
      .filter((filePath) =>
        ['pants.toml', 'BUILDROOT', 'pyproject.toml'].includes(context.getProjectRelativePath(filePath))
      );
    const buildFiles = context
      .getAllFilePaths()
      .filter((filePath) =>
        ['BUILD', 'BUILD.pants'].includes(path.posix.basename(context.getProjectRelativePath(filePath)))
      );
    const buildContents = await context.readTexts(buildFiles);
    const relativeEntries = buildContents.map((entry) => ({
      filePath: context.getProjectRelativePath(entry.filePath),
      text: entry.text,
    }));

    const relationships: StackStructuralRelationship[] = [
      ...configFiles.flatMap((configFile) =>
        relativeEntries.map((entry) =>
          createRelationship(context.getProjectRelativePath(configFile), entry.filePath, 'build', 'pants_workspace_package')
        )
      ),
      ...relativeEntries.flatMap((entry) =>
        extractPantsSources(entry.text).flatMap((sourceValue) => {
          const resolved = resolvePantsAddress(context, entry.filePath, sourceValue);
          return resolved?.file
            ? [createRelationship(entry.filePath, resolved.file, 'build', 'pants_target_source')]
            : [];
        })
      ),
      ...relativeEntries.flatMap((entry) =>
        extractPantsDependencies(entry.text).flatMap((dependencyAddress) => {
          const resolved = resolvePantsAddress(context, entry.filePath, dependencyAddress);
          if (resolved?.descriptor && resolved.descriptor !== entry.filePath) {
            return [
              createRelationship(entry.filePath, resolved.descriptor, 'build', 'pants_target_dependency'),
            ];
          }
          return resolved?.file
            ? [createRelationship(entry.filePath, resolved.file, 'build', 'pants_target_dependency')]
            : [];
        })
      ),
    ];

    return createInsight(
      pantsAdapter.id,
      pantsAdapter.displayName,
      pantsAdapter.category,
      `Detected ${buildFiles.length} Pants BUILD descriptors and ${relationships.length} workspace/dependency/source relationships.`,
      {
        evidence: context.getDetectedStack('pants')?.evidence || [],
        entryFiles: toRelativeList(context, configFiles),
        configFiles: toRelativeList(context, [...configFiles, ...buildFiles]),
        modules: relativeEntries.map((entry) => entry.filePath),
        relationships,
      }
    );
  },
};

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
      ...Array.from(
        text.matchAll(/\b(?:export\s+)?class\s+([A-Z][A-Za-z0-9_]*)\b/g)
      )
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
            `Register${escapeRegExp(serviceName)}Server\\s*\\(\\s*[^,]+,\\s*(?:&\\s*)?([A-Za-z_][A-Za-z0-9_]*)`,
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
      return Array.from(
        new Set([...serviceLikeSymbols, ...extractFastApiRouteFunctions(text)])
      );
    case '.cs':
      return Array.from(
        new Set([...serviceLikeSymbols, ...extractAspNetRouteMethods(text)])
      );
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

const openApiAdapter: StackAdapter = {
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
      (entry) => !specEntries.some((spec) => spec.filePath === entry.filePath) && isGeneratedOpenApiModule(entry.filePath, entry.text)
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

const protobufAdapter: StackAdapter = {
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
                      preferredSymbols: [
                        ...runtimeSymbols,
                        ...buildIdentifierVariants(serviceName),
                      ],
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

const mavenAdapter: StackAdapter = {
  id: 'maven-build-topology',
  displayName: 'Maven Build Topology',
  category: 'build',
  supports: (context) => !!context.getDetectedStack('maven'),
  analyze: async (context) => {
    const pomFiles = context.findBySuffix('pom.xml');
    const pomContents = await context.readTexts(pomFiles);
    const relativeEntries = pomContents.map((entry) => ({
      filePath: context.getProjectRelativePath(entry.filePath),
      text: entry.text,
    }));
    const coordinatesToPom = new Map<string, string>();
    const relationships: StackStructuralRelationship[] = [];
    const modules: string[] = [];

    for (const entry of relativeEntries) {
      const coordinates = extractMavenCoordinates(entry.text);
      if (coordinates) {
        coordinatesToPom.set(`${coordinates.groupId}:${coordinates.artifactId}`, entry.filePath);
      }
    }

    for (const entry of relativeEntries) {
      for (const moduleName of extractMavenModules(entry.text)) {
        const targetPom = toMavenPomPath(entry.filePath, moduleName);
        if (!context.hasRelativePath(targetPom)) {
          continue;
        }
        modules.push(targetPom);
        relationships.push(
          createRelationship(entry.filePath, targetPom, 'build', 'maven_module_descriptor')
        );
      }

      for (const dependency of extractMavenDependencies(entry.text)) {
        const targetPom = coordinatesToPom.get(`${dependency.groupId}:${dependency.artifactId}`);
        if (!targetPom || targetPom === entry.filePath) {
          continue;
        }
        modules.push(targetPom);
        relationships.push(
          createRelationship(entry.filePath, targetPom, 'build', 'maven_module_dependency')
        );
      }
    }

    return createInsight(
      mavenAdapter.id,
      mavenAdapter.displayName,
      mavenAdapter.category,
      `Detected ${pomFiles.length} Maven descriptors and ${relationships.length} reactor/module dependency relationships.`,
      {
        evidence: context.getDetectedStack('maven')?.evidence || [],
        configFiles: toRelativeList(context, pomFiles),
        modules,
        relationships,
      }
    );
  },
};

const gradleBuildAdapter: StackAdapter = {
  id: 'gradle-build-topology',
  displayName: 'Gradle Build Topology',
  category: 'build',
  supports: (context) => !!context.getDetectedStack('gradle'),
  analyze: async (context) => {
    const buildFiles = context
      .getAllFilePaths()
      .filter((filePath) => /(?:^|\/)(?:build|settings)\.gradle(?:\.kts)?$/i.test(context.getProjectRelativePath(filePath)));
    const buildContents = await context.readTexts(buildFiles);
    const relativeEntries = buildContents.map((entry) => ({
      filePath: context.getProjectRelativePath(entry.filePath),
      text: entry.text,
    }));
    const settingsEntries = relativeEntries.filter((entry) => /(?:^|\/)settings\.gradle(?:\.kts)?$/i.test(entry.filePath));
    const relationships: StackStructuralRelationship[] = [];
    const modules: string[] = [];

    for (const settingsEntry of settingsEntries) {
      for (const includeNotation of extractGradleIncludes(settingsEntry.text)) {
        const targetDescriptor = resolveGradleModuleDescriptor(context, settingsEntry.filePath, includeNotation);
        if (!targetDescriptor) {
          continue;
        }
        modules.push(targetDescriptor);
        relationships.push(
          createRelationship(settingsEntry.filePath, targetDescriptor, 'build', 'gradle_settings_module')
        );
      }
    }

    for (const entry of relativeEntries.filter((item) => /(?:^|\/)build\.gradle(?:\.kts)?$/i.test(item.filePath))) {
      for (const dependencyNotation of extractGradleProjectDependencies(entry.text)) {
        const targetDescriptor =
          settingsEntries
            .map((settingsEntry) => resolveGradleModuleDescriptor(context, settingsEntry.filePath, dependencyNotation))
            .find((candidate): candidate is string => Boolean(candidate)) || null;
        if (!targetDescriptor || targetDescriptor === entry.filePath) {
          continue;
        }
        modules.push(targetDescriptor);
        relationships.push(
          createRelationship(entry.filePath, targetDescriptor, 'build', 'gradle_project_dependency')
        );
      }
    }

    return createInsight(
      gradleBuildAdapter.id,
      gradleBuildAdapter.displayName,
      gradleBuildAdapter.category,
      `Detected ${buildFiles.length} Gradle descriptors and ${relationships.length} multi-module build relationships.`,
      {
        evidence: context.getDetectedStack('gradle')?.evidence || [],
        configFiles: toRelativeList(context, buildFiles),
        entryFiles: settingsEntries.map((entry) => entry.filePath),
        modules,
        relationships,
      }
    );
  },
};

const toCargoManifestPath = (sourceRelativePath: string, targetPath: string) => {
  const normalizedTarget = path.posix.normalize(
    path.posix.join(path.posix.dirname(sourceRelativePath), targetPath)
  );
  return normalizedTarget.endsWith('Cargo.toml') ? normalizedTarget : `${normalizedTarget}/Cargo.toml`;
};

const extractCargoWorkspaceMembers = (text: string) =>
  Array.from(
    (text.match(/\[workspace\][\s\S]*?members\s*=\s*\[([\s\S]*?)\]/)?.[1] || '').matchAll(/"([^"]+)"/g)
  )
    .map((match) => match[1])
    .filter((value): value is string => Boolean(value));

const extractCargoPathDependencies = (text: string) =>
  Array.from(text.matchAll(/[A-Za-z0-9_-]+\s*=\s*\{[^}]*path\s*=\s*"([^"]+)"[^}]*\}/g))
    .map((match) => match[1])
    .filter((value): value is string => Boolean(value));

const extractCargoBinPaths = (text: string) =>
  Array.from(text.matchAll(/\[\[bin\]\][\s\S]*?path\s*=\s*"([^"]+)"/g))
    .map((match) => match[1])
    .filter((value): value is string => Boolean(value));

const extractMavenModules = (text: string) =>
  Array.from(text.matchAll(/<module>([^<]+)<\/module>/g))
    .map((match) => match[1].trim())
    .filter((value): value is string => Boolean(value));

const extractMavenTagValue = (text: string, tag: string) =>
  text.match(new RegExp(`<${tag}>([^<]+)<\\/${tag}>`))?.[1]?.trim() || '';

const extractMavenCoordinates = (text: string) => {
  const artifactId = extractMavenTagValue(text, 'artifactId');
  const directGroupId = extractMavenTagValue(text, 'groupId');
  const parentGroupIdMatch = text.match(/<parent>[\s\S]*?<groupId>([^<]+)<\/groupId>/);
  const groupId = directGroupId || parentGroupIdMatch?.[1]?.trim() || '';

  if (!artifactId) {
    return null;
  }

  return { groupId, artifactId };
};

const extractMavenDependencies = (text: string) =>
  Array.from(
    text.matchAll(
      /<dependency>[\s\S]*?<groupId>([^<]+)<\/groupId>[\s\S]*?<artifactId>([^<]+)<\/artifactId>[\s\S]*?<\/dependency>/g
    )
  ).map((match) => ({
    groupId: match[1]?.trim() || '',
    artifactId: match[2]?.trim() || '',
  }));

const toMavenPomPath = (sourceRelativePath: string, modulePath: string) =>
  path.posix.normalize(path.posix.join(path.posix.dirname(sourceRelativePath), modulePath, 'pom.xml'));

const extractGradleIncludes = (text: string) => {
  const matches = Array.from(
    text.matchAll(/\binclude\s*\(([\s\S]*?)\)|\binclude\s+((?::[A-Za-z0-9_-]+(?:[:][A-Za-z0-9_-]+)*)+)/g)
  );
  const modules = new Set<string>();

  for (const match of matches) {
    const grouped = match[1] || match[2] || '';
    for (const candidate of grouped.matchAll(/['"](:[A-Za-z0-9_-]+(?::[A-Za-z0-9_-]+)*)['"]/g)) {
      if (candidate[1]) {
        modules.add(candidate[1]);
      }
    }
    if (match[2]) {
      modules.add(match[2]);
    }
  }

  return Array.from(modules);
};

const extractGradleProjectDependencies = (text: string) =>
  Array.from(text.matchAll(/project\s*\(\s*['"](:[A-Za-z0-9_-]+(?::[A-Za-z0-9_-]+)*)['"]\s*\)/g))
    .map((match) => match[1])
    .filter((value): value is string => Boolean(value));

const gradleModuleNotationToPath = (moduleNotation: string) => moduleNotation.replace(/^:/, '').replace(/:/g, '/');

const resolveGradleModuleDescriptor = (
  context: StackAdapterContext,
  settingsRelativePath: string,
  moduleNotation: string
) => {
  const modulePath = gradleModuleNotationToPath(moduleNotation);
  const baseDir = path.posix.dirname(settingsRelativePath);
  const candidates = [
    path.posix.normalize(path.posix.join(baseDir, modulePath, 'build.gradle.kts')),
    path.posix.normalize(path.posix.join(baseDir, modulePath, 'build.gradle')),
  ];

  return candidates.find((candidate) => context.hasRelativePath(candidate)) || null;
};

const cargoBuildAdapter: StackAdapter = {
  id: 'cargo-build-topology',
  displayName: 'Cargo Build Topology',
  category: 'build',
  supports: (context) => !!context.getDetectedStack('cargo'),
  analyze: async (context) => {
    const cargoFiles = context.findBySuffix('Cargo.toml');
    const contents = await context.readTexts(cargoFiles);
    const relativeContentEntries = contents.map((entry) => ({
      filePath: context.getProjectRelativePath(entry.filePath),
      text: entry.text,
    }));
    const workspaceRoot = relativeContentEntries.find((entry) => /\[workspace\]/.test(entry.text));
    const relationships: StackStructuralRelationship[] = [];
    const modules: string[] = [];
    const configFiles = toRelativeList(context, cargoFiles);

    for (const entry of relativeContentEntries) {
      for (const member of extractCargoWorkspaceMembers(entry.text)) {
        if (member.includes('*')) {
          continue;
        }
        const targetManifest = toCargoManifestPath(entry.filePath, member);
        if (!context.hasRelativePath(targetManifest)) {
          continue;
        }
        modules.push(targetManifest);
        relationships.push(
          createRelationship(entry.filePath, targetManifest, 'build', 'cargo_workspace_member')
        );
      }

      for (const dependencyPath of extractCargoPathDependencies(entry.text)) {
        const targetManifest = toCargoManifestPath(entry.filePath, dependencyPath);
        if (!context.hasRelativePath(targetManifest)) {
          continue;
        }
        modules.push(targetManifest);
        relationships.push(
          createRelationship(entry.filePath, targetManifest, 'build', 'cargo_path_dependency')
        );
      }

      for (const binPath of extractCargoBinPaths(entry.text)) {
        const targetFile = path.posix.normalize(path.posix.join(path.posix.dirname(entry.filePath), binPath));
        if (!context.hasRelativePath(targetFile)) {
          continue;
        }
        modules.push(targetFile);
        relationships.push(createRelationship(entry.filePath, targetFile, 'build', 'cargo_bin_target'));
      }
    }

    return createInsight(
      cargoBuildAdapter.id,
      cargoBuildAdapter.displayName,
      cargoBuildAdapter.category,
      `Detected ${cargoFiles.length} Cargo manifests and ${relationships.length} workspace/path/bin build relationships.`,
      {
        evidence: context.getDetectedStack('cargo')?.evidence || [],
        configFiles,
        entryFiles: workspaceRoot ? [workspaceRoot.filePath] : [],
        modules,
        relationships,
      }
    );
  },
};

const dotnetAdapter: StackAdapter = {
  id: 'dotnet-build-topology',
  displayName: '.NET Build Topology',
  category: 'build',
  supports: (context) => !!context.getDetectedStack('dotnet'),
  analyze: async (context) => {
    const projectFiles = context
      .getAllFilePaths()
      .filter((filePath) => /\.(csproj|fsproj|vbproj|sln)$/i.test(filePath));
    const projectContents = await context.readTexts(
      projectFiles.filter((filePath) => /\.(csproj|fsproj|vbproj)$/i.test(filePath))
    );
    const projectReferences = projectContents.flatMap(({ filePath, text }) =>
      Array.from(text.matchAll(/<ProjectReference\s+Include="([^"]+)"/g)).map(
        (match) => `${context.getProjectRelativePath(filePath)} -> ${match[1]}`
      )
    );

    return createInsight(
      dotnetAdapter.id,
      dotnetAdapter.displayName,
      dotnetAdapter.category,
      `Detected ${projectFiles.length} .NET project descriptors and ${projectReferences.length} explicit project references.`,
      {
        evidence: context.getDetectedStack('dotnet')?.evidence || [],
        configFiles: toRelativeList(context, projectFiles),
        modules: projectReferences,
        relationships: projectReferences.reduce<StackStructuralRelationship[]>((acc, reference) => {
          const [source, target] = reference.split(' -> ');
          if (!source || !target) {
            return acc;
          }

          acc.push({
            source,
            target,
            type: 'build',
            reason: 'dotnet_project_reference',
          });
          return acc;
        }, []),
      }
    );
  },
};

const BUILTIN_STACK_ADAPTERS: StackAdapter[] = [
  nextJsAdapter,
  nestJsAdapter,
  springBootAdapter,
  ktorAdapter,
  micronautAdapter,
  quarkusAdapter,
  aspNetAdapter,
  fastApiAdapter,
  djangoAdapter,
  railsAdapter,
  laravelAdapter,
  ginAdapter,
  fiberAdapter,
  echoAdapter,
  chiAdapter,
  grpcGoAdapter,
  axumAdapter,
  actixAdapter,
  viteAdapter,
  pnpmWorkspaceAdapter,
  nxWorkspaceAdapter,
  turborepoAdapter,
  bazelAdapter,
  pantsAdapter,
  openApiAdapter,
  protobufAdapter,
  cargoBuildAdapter,
  mavenAdapter,
  gradleBuildAdapter,
  dotnetAdapter,
];

export interface StackTopologyResult {
  frameworkInsights: StackStructuralInsight[];
  buildInsights: StackStructuralInsight[];
}

export class StackTopologyService {
  constructor(private readonly adapters: StackAdapter[] = BUILTIN_STACK_ADAPTERS) {}

  async analyze(graph: GraphData, stackProfile: StackInsightResult): Promise<StackTopologyResult> {
    const context = new ProjectFileContext(graph, stackProfile);
    const insights = (
      await Promise.all(
        this.adapters
          .filter((adapter) => adapter.supports(context))
          .map((adapter) => adapter.analyze(context))
      )
    ).filter((entry): entry is StackStructuralInsight => !!entry);

    return {
      frameworkInsights: insights.filter((entry) => entry.category === 'framework'),
      buildInsights: insights.filter((entry) => entry.category === 'build'),
    };
  }
}

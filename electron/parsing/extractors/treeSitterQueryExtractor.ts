import { Query, Tree, Language } from 'web-tree-sitter';
import { extractLanguageFacts } from '../facts';
import { LanguageDefinition, ParseResult, SourceLocation } from '../types';

const normalizeImportPath = (value: string) => value.replace(/['"`]/g, '').trim();

const normalizeImportEntity = (value: string) => {
  const cleaned = value.replace(/['"`]/g, '').trim();
  const segments = cleaned.split(/[.:]/).filter(Boolean);
  return segments[segments.length - 1] || cleaned;
};

type CaptureNode = {
  text: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
};

const toSourceLocation = (node: CaptureNode): SourceLocation => ({
  startLine: node.startPosition.row + 1,
  startColumn: node.startPosition.column + 1,
  endLine: node.endPosition.row + 1,
  endColumn: node.endPosition.column + 1,
});

/** Accumulates the de-duplicated results of every query match. */
class QueryCollector {
  readonly entities: ParseResult['entities'] = [];
  private readonly importsMap = new Map<string, Set<string>>();
  private readonly entityKeys = new Set<string>();
  private readonly variables = new Set<string>();
  private readonly calls = new Set<string>();
  private readonly comments = new Set<string>();
  /** Captures that only contribute trimmed text, by capture name. */
  private readonly textSets = new Map<string, Set<string>>([
    ['variable', this.variables],
    ['call', this.calls],
    ['comment', this.comments],
  ]);

  private pushEntity(type: 'class' | 'function', name: string, location?: SourceLocation) {
    const normalized = name.trim();
    if (!normalized) return;
    const key = `${type}:${normalized}`;
    if (this.entityKeys.has(key)) return;
    this.entityKeys.add(key);
    this.entities.push({ type, name: normalized, location });
  }

  private static addTrimmed(target: Set<string>, text: string) {
    if (text.trim()) target.add(text.trim());
  }

  /** Handles one capture; returns the import path or entity it contributed, if any. */
  private collectCapture(
    name: string,
    node: CaptureNode,
    match: { importPath: string | null; importEntities: Set<string> }
  ) {
    if (name === 'import_path') {
      match.importPath = normalizeImportPath(node.text);
    } else if (name === 'import_entity') {
      const normalizedEntity = normalizeImportEntity(node.text);
      if (normalizedEntity) match.importEntities.add(normalizedEntity);
    } else if (name === 'class' || name === 'function') {
      this.pushEntity(name, node.text, toSourceLocation(node));
    } else {
      const target = this.textSets.get(name);
      if (target) QueryCollector.addTrimmed(target, node.text);
    }
  }

  collectMatch(captures: { name: string; node: CaptureNode }[]) {
    const match = { importPath: null as string | null, importEntities: new Set<string>() };
    captures.forEach((capture) => this.collectCapture(capture.name, capture.node, match));
    if (!match.importPath) return;
    if (!this.importsMap.has(match.importPath)) this.importsMap.set(match.importPath, new Set());
    const bucket = this.importsMap.get(match.importPath)!;
    match.importEntities.forEach((entityName) => bucket.add(entityName));
  }

  get imports(): ParseResult['imports'] {
    return Array.from(this.importsMap, ([path, importedEntities]) => ({
      path,
      importedEntities: Array.from(importedEntities),
    }));
  }

  get variableList(): string[] {
    return [...this.variables];
  }

  get callList(): string[] {
    return [...this.calls];
  }

  get commentList(): string[] {
    return [...this.comments];
  }
}

const emptyResult = (definition: LanguageDefinition, adr?: string): ParseResult => ({
  sizeExceeded: false,
  imports: [],
  entities: [],
  exports: [],
  adr,
  variables: [],
  calls: [],
  comments: [],
  detectedLanguage: definition.id,
});

export const extractWithTreeSitterQuery = (
  tree: Tree,
  language: Language,
  definition: LanguageDefinition,
  adr?: string
): ParseResult => {
  if (!definition.query) return emptyResult(definition, adr);

  const collector = new QueryCollector();
  new Query(language, definition.query)
    .matches(tree.rootNode)
    .forEach((match) => collector.collectMatch(match.captures));

  const result: ParseResult = {
    ...emptyResult(definition, adr),
    imports: collector.imports,
    entities: collector.entities,
    variables: collector.variableList,
    calls: collector.callList,
    comments: collector.commentList,
  };

  // Go, Python, Java and Rust name packages and modules instead of relative paths, so their
  // imports are kept raw and resolved against the whole project once indexing is done.
  const facts = extractLanguageFacts(definition.id, tree.rootNode);
  if (!facts) return result;
  const { entities: factEntities, ...resolution } = facts;
  return { ...result, imports: [], entities: factEntities, resolution };
};

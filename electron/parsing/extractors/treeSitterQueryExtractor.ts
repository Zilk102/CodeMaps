import { Query, Tree, Language } from 'web-tree-sitter';
import { LanguageDefinition, ParseResult, SourceLocation } from '../types';

const normalizeImportPath = (value: string) => value.replace(/['"`]/g, '').trim();

const normalizeImportEntity = (value: string) => {
  const cleaned = value.replace(/['"`]/g, '').trim();
  const segments = cleaned.split(/[.:]/).filter(Boolean);
  return segments[segments.length - 1] || cleaned;
};

export const extractWithTreeSitterQuery = (
  tree: Tree,
  language: Language,
  definition: LanguageDefinition,
  adr?: string
): ParseResult => {
  const imports: ParseResult['imports'] = [];
  const entities: ParseResult['entities'] = [];
  const exports: ParseResult['exports'] = [];
  const variables: string[] = [];
  const calls: string[] = [];
  const comments: string[] = [];

  if (!definition.query) {
    return {
      sizeExceeded: false,
      imports,
      entities,
      exports,
      adr,
      variables,
      calls,
      comments,
      detectedLanguage: definition.id,
    };
  }

  const query = new Query(language, definition.query);
  const importsMap = new Map<string, Set<string>>();
  const entityKeys = new Set<string>();
  const variableSet = new Set<string>();
  const callSet = new Set<string>();
  const commentSet = new Set<string>();

  const toSourceLocation = (node: {
    startPosition: { row: number; column: number };
    endPosition: { row: number; column: number };
  }): SourceLocation => ({
    startLine: node.startPosition.row + 1,
    startColumn: node.startPosition.column + 1,
    endLine: node.endPosition.row + 1,
    endColumn: node.endPosition.column + 1,
  });

  const pushEntity = (type: 'class' | 'function', name: string, location?: SourceLocation) => {
    const normalized = name.trim();
    if (!normalized) return;
    const key = `${type}:${normalized}`;
    if (entityKeys.has(key)) return;
    entityKeys.add(key);
    entities.push({ type, name: normalized, location });
  };

  const matches = query.matches(tree.rootNode);
  matches.forEach((match) => {
    let importPath: string | null = null;
    const importEntities = new Set<string>();

    match.captures.forEach((capture) => {
      const captureText = capture.node.text;

      switch (capture.name) {
        case 'import_path':
          importPath = normalizeImportPath(captureText);
          break;
        case 'import_entity': {
          const normalizedEntity = normalizeImportEntity(captureText);
          if (normalizedEntity) importEntities.add(normalizedEntity);
          break;
        }
        case 'class':
          pushEntity('class', captureText, toSourceLocation(capture.node));
          break;
        case 'function':
          pushEntity('function', captureText, toSourceLocation(capture.node));
          break;
        case 'variable':
          if (captureText.trim()) variableSet.add(captureText.trim());
          break;
        case 'call':
          if (captureText.trim()) callSet.add(captureText.trim());
          break;
        case 'comment':
          if (captureText.trim()) commentSet.add(captureText.trim());
          break;
      }
    });

    if (importPath) {
      if (!importsMap.has(importPath)) importsMap.set(importPath, new Set());
      const bucket = importsMap.get(importPath)!;
      importEntities.forEach((entityName) => bucket.add(entityName));
    }
  });

  for (const [importPath, importedEntities] of importsMap) {
    imports.push({
      path: importPath,
      importedEntities: Array.from(importedEntities),
    });
  }

  variables.push(...variableSet);
  calls.push(...callSet);
  comments.push(...commentSet);

  return {
    sizeExceeded: false,
    imports,
    entities,
    exports,
    adr,
    variables,
    calls,
    comments,
    detectedLanguage: definition.id,
  };
};

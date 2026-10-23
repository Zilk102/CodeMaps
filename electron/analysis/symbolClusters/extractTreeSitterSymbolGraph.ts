import { Query, type Node } from 'web-tree-sitter';
import { extractLanguageFactsWithDeclarations, hasLanguageFacts } from '../../parsing/facts';
import { namedOf, walkNamed } from '../../parsing/facts/astUtils';
import type { DeclarationNode } from '../../parsing/facts/types';
import { getLanguageByExtension } from '../../parsing/languageRegistry';
import { getParserInstance, loadTreeSitterLanguage } from '../../parsing/treeSitterRuntime';
import { simpleName } from './clusterTokens';
import { lineCountOf, MAX_SYMBOLS, MAX_USES } from './symbolGraphCommon';
import type { SymbolGraph, SymbolInfo, SymbolKind } from './types';

/** A name shared by more than this many symbols (`new`, `get`) says nothing about who uses it. */
const MAX_AMBIGUOUS_TARGETS = 2;

const nodeLines = (node: Node) => ({
  start: node.startPosition.row + 1,
  end: node.endPosition.row + 1,
});

const declarationsFromQuery = (query: Query, root: Node): DeclarationNode[] => {
  const seen = new Set<string>();
  const result: DeclarationNode[] = [];
  for (const match of query.matches(root)) {
    for (const capture of match.captures) {
      if (capture.name !== 'class' && capture.name !== 'function') continue;
      const type = capture.name;
      const name = capture.node.text.trim();
      const key = `${type}:${name}`;
      if (!name || seen.has(key)) continue;
      seen.add(key);
      result.push({ type, name, node: capture.node.parent ?? capture.node });
    }
  }
  return result;
};

interface Declaration {
  name: string;
  kind: SymbolKind;
  node: Node;
}

/** Top-level statements that are not imports or comments. */
const NON_DECLARATION_TOP_LEVEL =
  /import|^use_declaration$|package|comment|include|using|namespace|^mod_item$|^extern_crate/;
const MIN_DATA_BLOCK_LINES = 6;

/**
 * Large module-level statements (lookup tables, config dictionaries, constant blocks) that no
 * function or class declaration covers: they are most of some "god files" and move as a unit.
 */
const dataBlocks = (root: Node, declarations: Declaration[]): Declaration[] => {
  const covered = declarations.map((declaration) => nodeLines(declaration.node));
  const taken = new Set(declarations.map((declaration) => declaration.name));
  const blocks: Declaration[] = [];
  for (const child of namedOf(root)) {
    const { start, end } = nodeLines(child);
    if (!isDataBlockCandidate(child, start, end, covered)) continue;
    const label = firstIdentifier(child);
    const name = uniqueBlockName(label, start, taken);
    taken.add(name);
    blocks.push({ name, kind: 'const', node: child });
  }
  return blocks;
};

interface LineRange {
  start: number;
  end: number;
}

/** Big enough, not an import, and not already a declaration or a wrapper around one. */
const isDataBlockCandidate = (child: Node, start: number, end: number, covered: LineRange[]) => {
  if (NON_DECLARATION_TOP_LEVEL.test(child.type)) return false;
  if (lineCountOf(start, end) < MIN_DATA_BLOCK_LINES) return false;
  // A wrapper around a declaration is a decorated Python class.
  return !covered.some(
    (range) =>
      (range.start <= start && end <= range.end) || (start <= range.start && range.end <= end)
  );
};

const firstIdentifier = (node: Node): string => {
  let label = '';
  walkNamed(node, (child) => {
    if (label) return false;
    if (child.childCount === 0 && /identifier/.test(child.type)) label = child.text;
    return true;
  });
  return label;
};

const uniqueBlockName = (label: string, start: number, taken: Set<string>): string => {
  let name = label || `block_${start}`;
  for (let suffix = 2; taken.has(name); suffix += 1) name = `${label || 'block'}_${suffix}`;
  return name;
};

/** An identifier either refers to declarations of the file or is an outside name the symbol uses. */
const noteIdentifier = (
  name: string,
  bySimpleName: Map<string, string[]>,
  refs: Set<string>,
  uses: Set<string>
): void => {
  const targets = bySimpleName.get(name);
  if (targets && targets.length <= MAX_AMBIGUOUS_TARGETS) {
    for (const target of targets) refs.add(target);
  } else if (!targets && name.length >= 3 && uses.size < MAX_USES) {
    uses.add(name);
  }
};

/** Which other declarations a declaration refers to, which outside names it uses, and the lines of nested declarations. */
const collectDeclarationUsage = (
  declaration: Declaration,
  declarationIds: Set<number>,
  bySimpleName: Map<string, string[]>
) => {
  const refs = new Set<string>();
  const uses = new Set<string>();
  let nestedLines = 0;
  walkNamed(declaration.node, (node) => {
    if (node.id !== declaration.node.id && declarationIds.has(node.id)) {
      const { start, end } = nodeLines(node);
      nestedLines += lineCountOf(start, end);
      return false;
    }
    if (node.childCount === 0 && /identifier/.test(node.type)) {
      noteIdentifier(node.text, bySimpleName, refs, uses);
    }
    return true;
  });
  refs.delete(declaration.name);
  return { refs, uses, nestedLines };
};

const buildFromDeclarations = (
  filePath: string,
  language: string,
  root: Node,
  declarations: DeclarationNode[]
): SymbolGraph => {
  const base: Declaration[] = declarations.slice(0, MAX_SYMBOLS).map((declaration) => ({
    name: declaration.name,
    kind: declaration.type === 'class' ? 'class' : 'function',
    node: declaration.node,
  }));
  const limited = [...base, ...dataBlocks(root, base)];
  const declarationIds = new Set(limited.map((declaration) => declaration.node.id));

  const bySimpleName = new Map<string, string[]>();
  for (const declaration of limited) {
    const key = simpleName(declaration.name);
    bySimpleName.set(key, [...(bySimpleName.get(key) ?? []), declaration.name]);
  }

  const symbols = limited.map((declaration): SymbolInfo => {
    const { refs, uses, nestedLines } = collectDeclarationUsage(
      declaration,
      declarationIds,
      bySimpleName
    );
    const { start, end } = nodeLines(declaration.node);
    return {
      name: declaration.name,
      kind: declaration.kind,
      startLine: start,
      endLine: end,
      lineCount: Math.max(1, lineCountOf(start, end) - nestedLines),
      refs: [...refs],
      uses: [...uses],
    };
  });

  return { filePath, language, lineCount: root.endPosition.row + 1, symbols };
};

export const extractWithTreeSitter = async (
  filePath: string,
  text: string,
  extension: string
): Promise<SymbolGraph | null> => {
  const definition = getLanguageByExtension(extension);
  if (!definition || definition.parserEngine !== 'tree-sitter' || !definition.query) return null;
  const language = await loadTreeSitterLanguage(definition);
  if (!language) return null;

  const parser = await getParserInstance();
  parser.setLanguage(language);
  const tree = parser.parse(text);
  if (!tree) return null;

  const withDeclarations = hasLanguageFacts(definition.id)
    ? extractLanguageFactsWithDeclarations(definition.id, tree.rootNode)?.declarations
    : undefined;
  const declarations =
    withDeclarations ?? declarationsFromQuery(new Query(language, definition.query), tree.rootNode);
  return buildFromDeclarations(filePath, definition.id, tree.rootNode, declarations);
};

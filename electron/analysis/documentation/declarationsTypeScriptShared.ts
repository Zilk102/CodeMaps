/**
 * Shared vocabulary of the TypeScript declaration scanner: the collector state, the description of
 * one declaration and the small node helpers every statement handler relies on.
 */
import ts from 'typescript';
import type { RawDeclaration } from './declarations';
import type { SymbolKind } from './types';

/** Mutable state of one scan: the source file, the names exported indirectly and the declarations found so far. */
export interface Collector {
  source: ts.SourceFile;
  /** Names exported through `export { a }`, `export default a` or `module.exports`. */
  exportedNames: Set<string>;
  out: RawDeclaration[];
}

/** What a handler knows about one declaration before it is recorded as a RawDeclaration. */
export interface Described {
  node: ts.Node;
  name: string;
  kind: SymbolKind;
  exported: boolean;
  exempt?: boolean;
  /** The node whose start the doc comment sits above, when it is not the node itself. */
  anchor?: ts.Node;
}

const modifiersOf = (node: ts.Node): readonly ts.Modifier[] =>
  (ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined) ?? [];

/** Whether the node carries the given modifier keyword (export, private, abstract, ...). */
export const hasModifier = (node: ts.Node, kind: ts.SyntaxKind): boolean =>
  modifiersOf(node).some((modifier) => modifier.kind === kind);

const lineOf = (source: ts.SourceFile, position: number): number =>
  source.getLineAndCharacterOfPosition(position).line + 1;

/** Appends a declaration to the collector with its line span and the anchor line its doc comment must precede. */
export const record = (collector: Collector, described: Described): void => {
  const { source, out } = collector;
  const start = described.node.getStart(source);
  out.push({
    name: described.name,
    kind: described.kind,
    line: lineOf(source, start),
    endLine: lineOf(source, described.node.getEnd()),
    anchorLine: lineOf(source, (described.anchor ?? described.node).getStart(source)),
    exported: described.exported,
    exempt: described.exempt ?? false,
  });
};

/** The declared name of a node, or `default` for anonymous default exports. */
export const nameOf = (node: { name?: ts.Node }, source: ts.SourceFile): string =>
  node.name ? node.name.getText(source) : 'default';

/** A declaration is exported by its own keyword or by an export list, CommonJS or default assignment naming it. */
export const isExportedStatement = (collector: Collector, node: ts.Node, name: string): boolean =>
  hasModifier(node, ts.SyntaxKind.ExportKeyword) || collector.exportedNames.has(name);

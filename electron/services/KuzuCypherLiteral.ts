/** Escaping of values embedded in Kuzu Cypher string literals. */

/**
 * Escapes a value for use inside a single-quoted Kuzu Cypher string literal.
 *
 * Kuzu follows openCypher, not SQL: a quote is escaped as `\'` and a backslash as `\\`. The SQL
 * style of doubling the quote (`''`) is a parse error in Kuzu, which used to abort the whole graph
 * persist for any project whose symbol names contain a quote (for example tree-sitter ids such as
 * `<file>#BinaryExpression[operator='in']`).
 *
 * The file name starts with `Kuzu` on purpose: `build.asarUnpack` unpacks `Kuzu*.js` next to the
 * Kuzu worker, which runs outside app.asar and must be able to load this module.
 */
export function escapeCypherString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
}

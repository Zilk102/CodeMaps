// Covers the escaping rules that keep Kuzu Cypher literals valid for symbol ids containing quotes
// and for Windows paths containing backslashes.
import { describe, expect, it } from 'vitest';
import { escapeCypherString } from '../KuzuCypherLiteral';

describe('escapeCypherString', () => {
  it('leaves plain values untouched', () => {
    expect(escapeCypherString('src/app.ts#main')).toBe('src/app.ts#main');
  });

  it('escapes single quotes the openCypher way, not by doubling them', () => {
    expect(escapeCypherString("BinaryExpression[operator='in']")).toBe(
      "BinaryExpression[operator=\\'in\\']"
    );
    expect(escapeCypherString("a'b")).not.toContain("''");
  });

  it('escapes backslashes before quotes so the result stays a valid literal', () => {
    expect(escapeCypherString('C:\\a\\b')).toBe('C:\\\\a\\\\b');
    expect(escapeCypherString("a\\'b")).toBe("a\\\\\\'b");
  });

  it('escapes line breaks so a multi-line value cannot end the statement', () => {
    expect(escapeCypherString('a\r\nb')).toBe('a\\r\\nb');
  });
});

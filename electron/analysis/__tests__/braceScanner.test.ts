import { describe, expect, it } from 'vitest';
import { findMatchingBrace, findNextOpenBrace } from '../sourceStructure/braceScanner';

describe('braceScanner', () => {
  it('finds the brace that closes the block', () => {
    const text = 'function a() { if (x) { y(); } }';
    const open = findNextOpenBrace(text, 0);
    expect(findMatchingBrace(text, open)).toBe(text.length - 1);
  });

  it('ignores braces in strings and comments', () => {
    const text = 'f() { const s = "}"; // }\n /* } */ return `{`; }';
    expect(findMatchingBrace(text, text.indexOf('{'))).toBe(text.length - 1);
  });

  it('returns -1 for an unbalanced block', () => {
    expect(findMatchingBrace('f() { {', 4)).toBe(-1);
  });
});

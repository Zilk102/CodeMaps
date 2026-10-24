import { describe, expect, it } from 'vitest';
import {
  BLOCK_END,
  FILE_MARKER_TOKEN,
  compareVersions,
  extractBlock,
  upsertBlock,
  upsertOwnedFile,
} from '../markers';

describe('compareVersions', () => {
  it('orders dotted versions numerically', () => {
    expect(compareVersions('1.2.0', '1.10.0')).toBeLessThan(0);
    expect(compareVersions('2.0.0', '1.99.99')).toBeGreaterThan(0);
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
    expect(compareVersions('1.2.0-beta', '1.2.0')).toBe(0);
  });
});

describe('upsertBlock', () => {
  it('creates the file with the block alone', () => {
    const result = upsertBlock(null, 'hello', '1.0.0', false);
    expect(result.outcome).toBe('created');
    expect(result.text).toBe('<!-- codemaps:start v1.0.0 -->\nhello\n<!-- codemaps:end -->\n');
  });

  it('appends after the user text without touching it', () => {
    const result = upsertBlock('# Mine\n\nKeep this.\n', 'hello', '1.0.0', false);
    expect(result.outcome).toBe('appended');
    expect(result.text!.startsWith('# Mine\n\nKeep this.\n\n<!-- codemaps:start v1.0.0 -->')).toBe(
      true
    );
  });

  it('replaces an older block in place and keeps the text around it', () => {
    const old = `before\n\n<!-- codemaps:start v1.0.0 -->\nold\n${BLOCK_END}\n\nafter\n`;
    const result = upsertBlock(old, 'new', '1.1.0', false);
    expect(result.outcome).toBe('replaced');
    expect(result.text).toBe(
      `before\n\n<!-- codemaps:start v1.1.0 -->\nnew\n${BLOCK_END}\n\nafter\n`
    );
  });

  it('leaves a current or newer block alone', () => {
    const current = `<!-- codemaps:start v1.1.0 -->\nedited by hand\n${BLOCK_END}\n`;
    expect(upsertBlock(current, 'new', '1.1.0', false).outcome).toBe('unchanged');
    expect(upsertBlock(current, 'new', '1.0.0', false).outcome).toBe('newer');
  });

  it('rewrites a current block only with force', () => {
    const current = `<!-- codemaps:start v1.1.0 -->\nedited\n${BLOCK_END}\n`;
    const result = upsertBlock(current, 'fresh', '1.1.0', true);
    expect(result.outcome).toBe('replaced');
    expect(result.text).toContain('fresh');
  });

  it('refuses to touch a block that has no end marker', () => {
    const broken = 'text\n<!-- codemaps:start v1.0.0 -->\nno end\n';
    expect(upsertBlock(broken, 'new', '2.0.0', false)).toEqual({ outcome: 'malformed' });
  });

  it('keeps Windows line endings', () => {
    const result = upsertBlock('line one\r\nline two\r\n', 'a\nb', '1.0.0', false);
    expect(result.text).not.toMatch(/[^\r]\n/);
  });

  it('extracts the block it wrote', () => {
    const text = upsertBlock('mine\n', 'body', '1.0.0', false).text!;
    expect(extractBlock(text)).toBe(`<!-- codemaps:start v1.0.0 -->\nbody\n${BLOCK_END}`);
    expect(extractBlock('nothing')).toBeNull();
  });
});

describe('upsertOwnedFile', () => {
  const template = `---\nalwaysApply: true\n---\n${FILE_MARKER_TOKEN}\n\nrules\n`;

  it('creates the file with the marker in place of the token', () => {
    const result = upsertOwnedFile(null, template, '1.0.0', 'html', false);
    expect(result.outcome).toBe('created');
    expect(result.text).toContain('<!-- codemaps:file v1.0.0 -->');
    expect(result.text).not.toContain(FILE_MARKER_TOKEN);
  });

  it('never touches a file without the marker', () => {
    expect(upsertOwnedFile('my own rules', template, '1.0.0', 'html', true).outcome).toBe(
      'foreign'
    );
  });

  it('refreshes only older files', () => {
    const v1 = upsertOwnedFile(null, template, '1.0.0', 'html', false).text!;
    expect(upsertOwnedFile(v1, template, '1.0.0', 'html', false).outcome).toBe('unchanged');
    expect(upsertOwnedFile(v1, template, '1.1.0', 'html', false).outcome).toBe('replaced');
    const v2 = upsertOwnedFile(null, template, '2.0.0', 'html', false).text!;
    expect(upsertOwnedFile(v2, template, '1.0.0', 'html', false).outcome).toBe('newer');
  });

  it('uses the comment style of the format', () => {
    expect(upsertOwnedFile(null, FILE_MARKER_TOKEN, '1.0.0', 'slash', false).text).toBe(
      '// codemaps:file v1.0.0'
    );
    expect(upsertOwnedFile(null, FILE_MARKER_TOKEN, '1.0.0', 'hash', false).text).toBe(
      '# codemaps:file v1.0.0'
    );
  });
});

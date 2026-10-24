import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { UnsafePathError, resolveInsideRoot, writeTextAtomic } from '../projectFiles';
import { cleanTemp, listFiles, tempProject, tryLink } from './kit';

afterEach(cleanTemp);

describe('resolveInsideRoot', () => {
  it('accepts nested relative paths, also in folders that do not exist yet', () => {
    const root = tempProject();
    expect(resolveInsideRoot(root, '.claude/skills/x/SKILL.md')).toBe(
      path.resolve(root, '.claude/skills/x/SKILL.md')
    );
  });

  it.each(['../outside.md', 'a/../../outside.md', '/etc/passwd', 'C:/Windows/x', '', 'a\0b'])(
    'rejects %j',
    (relative) => {
      expect(() => resolveInsideRoot(tempProject(), relative)).toThrow(UnsafePathError);
    }
  );

  it('rejects a folder link that leaves the project', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'codemaps-outside-'));
    const root = tempProject();
    try {
      if (!tryLink(outside, path.join(root, '.claude'))) return;
      expect(() => resolveInsideRoot(root, '.claude/settings.json')).toThrow(/symbolic link/);
      expect(() => writeTextAtomic(path.join(root, 'ok.txt'), 'x')).not.toThrow();
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('allows a link whose target stays inside the project', () => {
    const root = tempProject({ 'real/file.txt': 'x' });
    if (!tryLink(path.join(root, 'real'), path.join(root, 'alias'))) return;
    expect(() => resolveInsideRoot(root, 'alias/new.txt')).not.toThrow();
  });
});

describe('writeTextAtomic', () => {
  it('creates folders and leaves no temporary file behind', () => {
    const root = tempProject();
    writeTextAtomic(path.join(root, 'a/b/c.txt'), 'hello');
    expect(listFiles(root)).toEqual(['a/b/c.txt']);
    expect(fs.readFileSync(path.join(root, 'a/b/c.txt'), 'utf-8')).toBe('hello');
  });
});

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { getBuiltinLanguageAdapters, getLanguageAdapter } from '../languageAdapters';
import { getAllLanguageDefinitions, getLanguageById } from '../languageRegistry';
import { parseFile } from '../parseFile';

const tempDirs: string[] = [];

const createTempProject = () => {
  const tempDir = path.join(
    os.tmpdir(),
    `codemaps-language-adapters-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
  fs.mkdirSync(tempDir, { recursive: true });
  tempDirs.push(tempDir);
  return tempDir;
};

afterEach(() => {
  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop();
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
});

describe('language adapter registry', () => {
  it('resolves an adapter for every declared language definition', () => {
    const adapterIds = new Set(getBuiltinLanguageAdapters().map((adapter) => adapter.id));

    for (const definition of getAllLanguageDefinitions()) {
      expect(adapterIds.has(definition.adapterId)).toBe(true);
      expect(getLanguageAdapter(definition)?.id).toBe(definition.adapterId);
    }
  });

  it('selects semantic adapter for TypeScript and metadata adapter for Markdown', () => {
    const typeScript = getLanguageById('typescript');
    const markdown = getLanguageById('markdown');

    expect(typeScript).toBeDefined();
    expect(markdown).toBeDefined();
    const typeScriptAdapter = getLanguageAdapter(typeScript!);
    const markdownAdapter = getLanguageAdapter(markdown!);

    expect(typeScriptAdapter).toBeDefined();
    expect(markdownAdapter).toBeDefined();
    expect(typeScriptAdapter?.id).toBe('typescript-semantic-adapter');
    expect(markdownAdapter?.id).toBe('markdown-adr-adapter');
  });
});

describe('parseFile through language adapters', () => {
  it('parses TypeScript files via semantic adapter', async () => {
    const tempDir = createTempProject();
    const filePath = path.join(tempDir, 'service.ts');
    fs.writeFileSync(
      filePath,
      [
        "import { helper } from './helper';",
        '// @adr Authentication flow',
        'export function runTask() {',
        '  const value = helper();',
        '  return value;',
        '}',
      ].join('\n')
    );
    fs.writeFileSync(path.join(tempDir, 'helper.ts'), 'export function helper() { return 1; }');

    const result = await parseFile({ filePath, baseDir: tempDir });

    expect(result.detectedLanguage).toBe('typescript');
    expect(result.adr).toBe('Authentication flow');
    expect(
      result.entities.some((entity) => entity.type === 'function' && entity.name === 'runTask')
    ).toBe(true);
    expect(result.exports.some((entry) => entry.exportedName === 'runTask')).toBe(true);
    expect(result.imports.some((entry) => entry.path === './helper')).toBe(true);
    expect(result.calls).toContain('helper');
  });

  it('parses markdown ADR files via markdown adapter', async () => {
    const tempDir = createTempProject();
    const filePath = path.join(tempDir, '0001-authentication.md');
    fs.writeFileSync(
      filePath,
      [
        '# Authentication Decision',
        '',
        'Status: accepted',
        '',
        'Context',
        '',
        'We use secure cookies.',
      ].join('\n')
    );

    const result = await parseFile({ filePath, baseDir: tempDir });

    expect(result.detectedLanguage).toBe('markdown');
    expect(result.isMarkdownADR).toBe(true);
    expect(result.adr).toBe('Authentication Decision');
  });
});

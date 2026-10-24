import { describe, expect, it } from 'vitest';
import { validateChanges } from '../ChangeValidationService';
import { buildDocumentationContext } from '../documentationContext';
import { buildDocumentationToolReport } from '../documentation';
import { docFile, reportOf, symbol } from './documentationFixtures';

const report = reportOf(
  docFile('D:/p/src/new.ts', [symbol('parse', false, { line: 12 }), symbol('ok', true)], {
    header: 'missing',
  }),
  docFile('D:/p/src/old.ts', [symbol('legacy', false), symbol('other', false)]),
  docFile('D:/p/lib/tool.py', [symbol('run', true), symbol('stop', false)], { language: 'python' })
);

describe('validateChanges: missing_documentation', () => {
  it('blocks and lists the undocumented symbols and header-less files among the changed files', () => {
    const result = validateChanges({
      patterns: [],
      changedFiles: ['D:\\p\\src\\new.ts'],
      healthScore: 90,
      documentation: report,
    });
    const found = result.findings.find((finding) => finding.id === 'missing_documentation');
    expect(found).toBeDefined();
    expect(found?.files).toEqual(['D:/p/src/new.ts']);
    expect(found?.evidence.map((item) => item.message).join('\n')).toContain('function parse');
    expect(found?.evidence[0].message).toContain('header');
    expect(found?.fix).toContain('purpose');
    expect(result.isValid).toBe(false);
  });

  it('stays silent when the changed files are documented or nothing was measured', () => {
    const clean = reportOf(docFile('D:/p/src/new.ts', [symbol('parse', true)]));
    const changedFiles = ['D:/p/src/new.ts'];
    for (const documentation of [clean, null, undefined]) {
      const result = validateChanges({
        patterns: [],
        changedFiles,
        healthScore: 90,
        documentation,
      });
      expect(result.findings).toEqual([]);
    }
  });

  it('ignores gaps in files that were not changed', () => {
    const result = validateChanges({
      patterns: [],
      changedFiles: ['D:/p/lib/tool.py'],
      healthScore: 90,
      documentation: report,
    });
    const found = result.findings.find((finding) => finding.id === 'missing_documentation');
    expect(found?.files).toEqual(['D:/p/lib/tool.py']);
  });

  it('reports the top offenders for the whole project', () => {
    const result = validateChanges({
      patterns: [],
      changedFiles: [],
      healthScore: 90,
      documentation: report,
    });
    const found = result.findings.find((finding) => finding.id === 'missing_documentation');
    expect(result.scope).toBe('project');
    expect(found?.files[0]).toBe('D:/p/src/old.ts');
    expect(found?.description).toContain('%');
    expect(found?.severity).toBe('medium');
  });
});

describe('buildDocumentationContext', () => {
  it('lists the undocumented symbols of the touched files, bounded', () => {
    const many = docFile(
      'D:/p/big.ts',
      Array.from({ length: 12 }, (_, index) => symbol(`fn${index}`, false, { line: index + 1 }))
    );
    const section = buildDocumentationContext(reportOf(many), ['D:/p/big.ts#fn1']);
    expect(section?.undocumented).toHaveLength(8);
    expect(section?.omitted).toBe(4);
    expect(section?.guidance).toContain('check_documentation');
  });

  it('falls back to the worst files when nothing specific is touched', () => {
    const section = buildDocumentationContext(report, []);
    expect(section?.undocumented.map((item) => item.name)).toContain('legacy');
  });

  it('is absent without a report or without gaps', () => {
    expect(buildDocumentationContext(null, ['D:/p/src/new.ts'])).toBeUndefined();
    expect(buildDocumentationContext(report, ['D:/p/elsewhere.ts'])).toBeUndefined();
  });
});

describe('buildDocumentationToolReport', () => {
  it('summarizes the project and hints what each comment must state', () => {
    const result = buildDocumentationToolReport(report);
    expect(result).toMatchObject({
      requiredSymbols: 6,
      documentedSymbols: 2,
      coveragePercent: 33.3,
    });
    expect(result.undocumented.total).toBe(4);
    expect(result.undocumented.items.every((item) => item.hint.includes('Do not repeat'))).toBe(
      true
    );
    expect(result.filesWithoutHeader).toMatchObject({ total: 1, files: ['D:/p/src/new.ts'] });
    expect(result.byLanguage.map((entry) => entry.language)).toEqual(['python', 'typescript']);
    expect(result.lowQuality).toBeUndefined();
    expect(result.guidance).toContain('4 public symbol');
  });

  it('restricts everything to a file or folder', () => {
    const folder = buildDocumentationToolReport(report, { scope: 'D:\\p\\src' });
    expect(folder.analyzedFiles).toBe(2);
    expect(folder.undocumented.items.every((item) => item.file.startsWith('D:/p/src/'))).toBe(true);
    expect(folder.byLanguage.map((entry) => entry.language)).toEqual(['typescript']);
    expect(folder.topOffenders[0].file).toBe('D:/p/src/old.ts');

    const single = buildDocumentationToolReport(report, { scope: 'D:/p/lib/tool.py' });
    expect(single).toMatchObject({ requiredSymbols: 2, coveragePercent: 50 });
    expect(buildDocumentationToolReport(report, { scope: 'D:/p/lib/too' }).analyzedFiles).toBe(0);
  });

  it('bounds the lists by the limit and counts what was left out', () => {
    const result = buildDocumentationToolReport(report, { limit: 1 });
    expect(result.undocumented.items).toHaveLength(1);
    expect(result.undocumented.omitted).toBe(3);
    expect(result.topOffenders).toHaveLength(1);
  });

  it('lists low-quality comments on request', () => {
    const weak = reportOf(
      docFile('D:/p/a.ts', [symbol('parse', true, { quality: 'echo' }), symbol('go', true)])
    );
    expect(buildDocumentationToolReport(weak).lowQuality).toBeUndefined();
    const result = buildDocumentationToolReport(weak, { includeLowQuality: true });
    expect(result.lowQuality?.items).toMatchObject([{ name: 'parse', quality: 'echo' }]);
    expect(result.guidance).toContain('rewrite 1 comment');
  });

  it('says so when everything is documented', () => {
    const clean = buildDocumentationToolReport(reportOf(docFile('D:/p/a.ts', [symbol('x', true)])));
    expect(clean.guidance).toBe('Documentation is complete; nothing to add.');
    expect(clean.coveragePercent).toBe(100);
  });
});

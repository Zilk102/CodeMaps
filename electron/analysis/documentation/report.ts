/**
 * Assembles the project report from the per-file results: the coverage of the required symbols,
 * the files without a header, the worst files, the per-language breakdown and the stable lists
 * of undocumented symbols and weak comments that gates and views are built on.
 */
import { compareText } from './ordering';
import { MAX_TOP_OFFENDERS } from './policy';
import type {
  DocumentationOffender,
  DocumentationReport,
  FileDocumentation,
  LanguageDocumentationStats,
  LowQualityDoc,
  SymbolDocumentation,
  UndocumentedSymbol,
} from './types';

/** Percent with one decimal; 100 when nothing is required, so an empty project is not failing. */
export const coveragePercent = (documented: number, required: number): number =>
  required === 0 ? 100 : Math.round((documented / required) * 1000) / 10;

const byFileThenLine = (
  a: { file: string; line: number; name: string },
  b: { file: string; line: number; name: string }
): number => compareText(a.file, b.file) || a.line - b.line || compareText(a.name, b.name);

const requiredSymbols = (file: FileDocumentation): SymbolDocumentation[] =>
  file.symbols.filter((symbol) => symbol.required);

const missingSymbols = (file: FileDocumentation): SymbolDocumentation[] =>
  requiredSymbols(file).filter((symbol) => !symbol.documented);

/** Summarizes one file for the top offenders list: how many required symbols it has, how many lack docs and its coverage. */
const offenderOf = (file: FileDocumentation): DocumentationOffender => {
  const required = requiredSymbols(file).length;
  const missing = missingSymbols(file).length;
  return {
    file: file.file,
    missing,
    required,
    coverage: coveragePercent(required - missing, required),
  };
};

const undocumentedOf = (file: FileDocumentation): UndocumentedSymbol[] =>
  missingSymbols(file).map(({ line, name, kind }) => ({ file: file.file, line, name, kind }));

/** Lists the documented required symbols of a file whose comment only echoes the name or is too short. */
const lowQualityOf = (file: FileDocumentation): LowQualityDoc[] =>
  requiredSymbols(file).flatMap((symbol) =>
    symbol.documented && symbol.quality !== 'ok'
      ? [
          {
            file: file.file,
            line: symbol.line,
            name: symbol.name,
            kind: symbol.kind,
            quality: symbol.quality,
          },
        ]
      : []
  );

/** Aggregates required and documented symbols, files and header gaps per language. */
const languageStats = (files: FileDocumentation[]): LanguageDocumentationStats[] => {
  const stats = new Map<string, LanguageDocumentationStats>();
  for (const file of files) {
    const entry = stats.get(file.language) ?? {
      language: file.language,
      files: 0,
      requiredSymbols: 0,
      documentedSymbols: 0,
      coverage: 100,
      filesWithoutHeader: 0,
    };
    const required = requiredSymbols(file).length;
    entry.files += 1;
    entry.requiredSymbols += required;
    entry.documentedSymbols += required - missingSymbols(file).length;
    entry.filesWithoutHeader += file.header === 'missing' ? 1 : 0;
    stats.set(file.language, entry);
  }
  return [...stats.values()]
    .map((entry) => ({
      ...entry,
      coverage: coveragePercent(entry.documentedSymbols, entry.requiredSymbols),
    }))
    .sort((a, b) => compareText(a.language, b.language));
};

/** Builds the project report. The input order does not matter; the output is deterministic. */
export const buildDocumentationReport = (results: FileDocumentation[]): DocumentationReport => {
  const files = [...results].sort((a, b) => compareText(a.file, b.file));
  const measured = files.filter((file) => !file.exempt);
  const offenders = measured.map(offenderOf);
  const required = offenders.reduce((sum, entry) => sum + entry.required, 0);
  const missing = offenders.reduce((sum, entry) => sum + entry.missing, 0);
  return {
    analyzedFiles: measured.length,
    exemptFiles: files.length - measured.length,
    requiredSymbols: required,
    documentedSymbols: required - missing,
    coveragePercent: coveragePercent(required - missing, required),
    filesWithoutHeader: measured.filter((file) => file.header === 'missing').map((f) => f.file),
    topOffenders: offenders
      .filter((entry) => entry.missing > 0)
      .sort((a, b) => b.missing - a.missing || compareText(a.file, b.file))
      .slice(0, MAX_TOP_OFFENDERS),
    byLanguage: languageStats(measured),
    undocumented: measured.flatMap(undocumentedOf).sort(byFileThenLine),
    lowQuality: measured.flatMap(lowQualityOf).sort(byFileThenLine),
    commentedOutCodeBlocks: measured.reduce((sum, file) => sum + file.commentedOutCode.length, 0),
    files,
  };
};

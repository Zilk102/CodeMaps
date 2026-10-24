/**
 * Documentation coverage engine: public API.
 *
 * Measures how well code is documented in every language CodeMaps parses (JavaScript, TypeScript,
 * TSX, Vue script blocks, Python, Go, Rust, Java, Kotlin, C/C++, C#, PHP, Ruby, Zig, Swift,
 * Bash). Markdown, HTML, CSS, YAML and JSON hold no declarations and are not measured.
 *
 * - `analyzeDocumentation(files)` or `documentationIndex.refreshFor(graph)` give the project
 *   `DocumentationReport` (coverage, offenders, the stable `undocumented` list for a gate).
 * - `analyzeDocumentationSource(file, text)` measures a single file without touching the disk.
 * - `policy.ts` holds every threshold; `conventions.ts` the per-language doc comment shapes.
 */
import { documentationIndex } from './DocumentationIndex';
import type { DocumentationReport } from './types';

export { analyzeDocumentationSource } from './fileAnalysis';
export { DocumentationIndex, documentationIndex } from './DocumentationIndex';
export { buildDocumentationReport, coveragePercent } from './report';
export * as documentationPolicy from './policy';
export type * from './types';

/**
 * Measures the documentation of a list of files (absolute paths). `root` names the project, so
 * repeated calls reuse the per-file cache and only re-read the files that changed.
 */
export const analyzeDocumentation = (files: string[], root = ''): Promise<DocumentationReport> =>
  documentationIndex.refresh(root, files);

import type {
  ModuleQualityMetric,
  ModuleQualitySummary,
  SourceClassMetric,
  SourceFunctionMetric,
} from './moduleQualityMetrics';
import type { DetectedPattern } from './patternDetectionTypes';
import { buildPattern, highWhenAny, runBuilders, type PatternSpec } from './patternBuilderRunner';

// Every copy of every group is evidence, so a change to any file can find the copies it touches.
const MAX_CLONE_EVIDENCE = 120;

type QualityBuilder = (quality: ModuleQualitySummary) => DetectedPattern | null;
type ClassFindings = ModuleQualitySummary['godClasses'][number];
type MethodFindings = ModuleQualitySummary['longMethods'][number];

const nodeIdsOf = (findings: Array<{ node: { id: string } }>) =>
  findings.map(({ node }) => node.id);

/** Flattens per-file matches into at most two evidence lines per file, capped at eight overall. */
function matchEvidence<M>(
  entries: Array<{ node: { id: string; label: string }; matches: M[] }>,
  describe: (fileName: string, match: M) => string
) {
  return entries
    .flatMap(({ node, matches }) =>
      matches.slice(0, 2).map((item) => ({
        nodeId: node.id,
        message: describe(node.label, item),
      }))
    )
    .slice(0, 8);
}

const methodEvidence = (entries: MethodFindings[]) =>
  matchEvidence(
    entries.map(({ node, matchedMethods }) => ({ node, matches: matchedMethods })),
    describeMethodEvidence
  );

/** One evidence line per file, five at most, each carrying the file's smell numbers. */
function smellEvidence(
  entries: ModuleQualityMetric[],
  detail: (entry: ModuleQualityMetric) => string
) {
  return entries.slice(0, 5).map((entry) => ({
    nodeId: entry.node.id,
    message: `${entry.node.label}: smell score ${entry.designSmellScore}, axes ${entry.responsibilityAxisCount}, ${detail(entry)}.`,
  }));
}

const OVERSIZED_MODULES: PatternSpec<ModuleQualityMetric> = {
  id: 'oversized_modules',
  title: 'Oversized Modules',
  description:
    'Some files are too large or too symbol-dense, making responsibilities unclear and architectural evolution harder.',
  severity: highWhenAny(
    ({ lineCount, symbolCount }) => (lineCount || 0) >= 1200 || symbolCount >= 40
  ),
  nodeIds: nodeIdsOf,
  evidence: (modules) =>
    modules.slice(0, 5).map(({ node, lineCount, symbolCount }) => ({
      nodeId: node.id,
      message: `${node.label}: ${lineCount || 0} LOC, ${symbolCount} symbols.`,
    })),
};

const GOD_FILES: PatternSpec<ModuleQualityMetric> = {
  id: 'god_files',
  title: 'God Files',
  description:
    'A few modules accumulate too much code, too many symbols, or too many architectural responsibilities, violating SRP and making safe changes harder.',
  severity: () => 'high',
  nodeIds: nodeIdsOf,
  evidence: (files) =>
    smellEvidence(files, ({ sourceMetrics }) => `god classes ${sourceMetrics.godClasses.length}`),
};

const GOD_CLASSES: PatternSpec<ClassFindings> = {
  id: 'god_classes',
  title: 'God Classes',
  description:
    'Some classes expose too many methods or span too many lines, suggesting broken encapsulation and SRP violations.',
  severity: highWhenAny(({ matchedClasses }) =>
    matchedClasses.some((item) => item.lineCount >= 400 || item.methodCount >= 16)
  ),
  nodeIds: nodeIdsOf,
  evidence: (files) =>
    matchEvidence(
      files.map(({ node, matchedClasses }) => ({ node, matches: matchedClasses })),
      describeClassEvidence
    ),
};

const LONG_METHODS: PatternSpec<MethodFindings> = {
  id: 'long_methods',
  title: 'Long Methods',
  description:
    'Some files contain methods or functions that are too long, making intent harder to follow and safe refactoring more expensive.',
  severity: highWhenAny(({ matchedMethods }) =>
    matchedMethods.some((item) => item.lineCount >= 120)
  ),
  nodeIds: nodeIdsOf,
  evidence: methodEvidence,
};

const COMPLEX_METHODS: PatternSpec<MethodFindings> = {
  id: 'complex_methods',
  title: 'Complex Methods',
  description:
    'Some methods contain too many branches or too much nesting, so behavior is harder to reason about and refactor safely.',
  severity: highWhenAny(({ matchedMethods }) =>
    matchedMethods.some((item) => item.complexity >= 15 || item.maxNesting >= 5)
  ),
  nodeIds: nodeIdsOf,
  evidence: methodEvidence,
};

const MIXED_RESPONSIBILITY: PatternSpec<ModuleQualityMetric> = {
  id: 'mixed_responsibility_modules',
  title: 'Mixed Responsibility Modules',
  description:
    'Some modules mix orchestration, runtime wiring, contracts, and helper logic in one place, making clean layering and future extraction harder.',
  severity: highWhenAny(
    ({ responsibilityAxisCount, lineCount }) =>
      responsibilityAxisCount >= 6 || (lineCount || 0) >= 800
  ),
  nodeIds: nodeIdsOf,
  evidence: (modules) =>
    smellEvidence(
      modules,
      ({ sourceMetrics }) =>
        `long methods ${sourceMetrics.longMethods.length}, complex methods ${sourceMetrics.complexMethods.length}`
    ),
};

type CodeClones = NonNullable<ModuleQualitySummary['codeClones']>;

/** One entry per copy, so a change to any of the files finds the copies it must reuse. */
function cloneEvidence(codeClones: CodeClones) {
  return codeClones
    .flatMap((clone) =>
      clone.instances.map((instance) => {
        const others = clone.instances
          .filter((other) => other !== instance)
          .map((other) => other.methodName);
        return {
          nodeId: instance.nodeId,
          message: `${clone.instances[0].lineCount} duplicated lines at ${instance.methodName}; the same code is also at ${others.join(', ')}. Extract it once and reuse it.`,
        };
      })
    )
    .slice(0, MAX_CLONE_EVIDENCE);
}

const CODE_CLONES: PatternSpec<CodeClones[number]> = {
  id: 'code_clones',
  title: 'Code Clones (Duplication)',
  description:
    'Identical or highly similar code structures were detected across multiple files. LLMs often duplicate logic instead of extracting reusable abstractions, bloating the codebase.',
  severity: highWhenAny(
    (clone) => clone.instances[0].lineCount >= 30 || clone.instances.length >= 4
  ),
  nodeIds: (clones) => Array.from(new Set(clones.flatMap((c) => c.instances.map((i) => i.nodeId)))),
  evidence: cloneEvidence,
};

const QUALITY_BUILDERS: QualityBuilder[] = [
  (quality) => buildPattern(quality.oversizedModules, OVERSIZED_MODULES),
  (quality) => buildPattern(quality.godFiles, GOD_FILES),
  (quality) => buildPattern(quality.godClasses, GOD_CLASSES),
  (quality) => buildPattern(quality.longMethods, LONG_METHODS),
  (quality) => buildPattern(quality.complexMethods, COMPLEX_METHODS),
  (quality) => buildPattern(quality.mixedResponsibilityModules, MIXED_RESPONSIBILITY),
  (quality) => buildPattern(quality.codeClones ?? [], CODE_CLONES),
];

export function buildQualityPatterns(quality: ModuleQualitySummary): DetectedPattern[] {
  return runBuilders(QUALITY_BUILDERS, quality);
}

function describeRange(item: { startLine: number; endLine: number }): string {
  return item.startLine > 0 && item.endLine >= item.startLine
    ? `L${item.startLine}-L${item.endLine}`
    : 'line range unavailable';
}

function describeClassEvidence(fileName: string, item: SourceClassMetric): string {
  return `${fileName} -> class ${item.name} (${describeRange(item)}): ${item.lineCount} LOC, ${item.methodCount} methods, ${item.publicMethodCount} public, max complexity ${item.maxMethodComplexity}.`;
}

function describeMethodEvidence(fileName: string, item: SourceFunctionMetric): string {
  return `${fileName} -> ${item.name} (${describeRange(item)}): ${item.lineCount} LOC, complexity ${item.complexity}, branches ${item.branchCount}, max nesting ${item.maxNesting}.`;
}

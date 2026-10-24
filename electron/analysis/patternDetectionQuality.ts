import type {
  ModuleQualityMetric,
  ModuleQualitySummary,
  SourceClassMetric,
  SourceFunctionMetric,
} from './moduleQualityMetrics';
import type { DetectedPattern } from './patternDetectionTypes';
import { buildPattern, highWhenAny, runBuilders, type PatternSpec } from './patternBuilderRunner';
import { DEFAULT_STRUCTURE_LIMITS, type StructureLimits } from './projectConfig/structureLimits';

// Every copy of every group is evidence, so a change to any file can find the copies it touches.
const MAX_CLONE_EVIDENCE = 120;

/** Whether a module is big enough that the oversized-modules finding is high severity. */
export const isSevereOversizedModule = ({
  lineCount,
  symbolCount,
}: Pick<ModuleQualityMetric, 'lineCount' | 'symbolCount'>): boolean =>
  (lineCount || 0) >= 1200 || symbolCount >= 40;

/** Whether a class is large enough that the god-classes finding is high severity. */
export const isSevereClass = (item: SourceClassMetric): boolean =>
  item.lineCount >= 400 || item.methodCount >= 16;

/** Whether a function is long enough, under the project's limits, for high severity. */
export const isSevereLongFunction = (
  item: SourceFunctionMetric,
  limits: StructureLimits = DEFAULT_STRUCTURE_LIMITS
): boolean => item.lineCount >= limits.severeLines;

/** Whether a function is complex or deep enough, under the project's limits, for high severity. */
export const isSevereComplexFunction = (
  item: SourceFunctionMetric,
  limits: StructureLimits = DEFAULT_STRUCTURE_LIMITS
): boolean => item.complexity >= limits.severeComplexity || item.maxNesting >= limits.severeNesting;

/** Whether a module mixes responsibilities so much that the finding is high severity. */
export const isSevereMixedResponsibility = ({
  responsibilityAxisCount,
  lineCount,
}: Pick<ModuleQualityMetric, 'responsibilityAxisCount' | 'lineCount'>): boolean =>
  responsibilityAxisCount >= 6 || (lineCount || 0) >= 800;

/** Whether a group of copies is big or wide enough for the clone finding to be high severity. */
export const isSevereClone = (lineCount: number, copies: number): boolean =>
  lineCount >= 30 || copies >= 4;

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
  severity: highWhenAny(isSevereOversizedModule),
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
  severity: highWhenAny(({ matchedClasses }) => matchedClasses.some(isSevereClass)),
  nodeIds: nodeIdsOf,
  evidence: (files) =>
    matchEvidence(
      files.map(({ node, matchedClasses }) => ({ node, matches: matchedClasses })),
      describeClassEvidence
    ),
};

/** The long-methods pattern, rated high from the project's severe line limit. */
const longMethodsSpec = (limits: StructureLimits): PatternSpec<MethodFindings> => ({
  id: 'long_methods',
  title: 'Long Methods',
  description:
    'Some files contain methods or functions that are too long, making intent harder to follow and safe refactoring more expensive.',
  severity: highWhenAny(({ matchedMethods }) =>
    matchedMethods.some((item) => isSevereLongFunction(item, limits))
  ),
  nodeIds: nodeIdsOf,
  evidence: methodEvidence,
});

/** The complex-methods pattern, rated high from the project's severe complexity or nesting limit. */
const complexMethodsSpec = (limits: StructureLimits): PatternSpec<MethodFindings> => ({
  id: 'complex_methods',
  title: 'Complex Methods',
  description:
    'Some methods contain too many branches or too much nesting, so behavior is harder to reason about and refactor safely.',
  severity: highWhenAny(({ matchedMethods }) =>
    matchedMethods.some((item) => isSevereComplexFunction(item, limits))
  ),
  nodeIds: nodeIdsOf,
  evidence: methodEvidence,
});

const MIXED_RESPONSIBILITY: PatternSpec<ModuleQualityMetric> = {
  id: 'mixed_responsibility_modules',
  title: 'Mixed Responsibility Modules',
  description:
    'Some modules mix orchestration, runtime wiring, contracts, and helper logic in one place, making clean layering and future extraction harder.',
  severity: highWhenAny(isSevereMixedResponsibility),
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
  severity: highWhenAny((clone) =>
    isSevereClone(clone.instances[0].lineCount, clone.instances.length)
  ),
  nodeIds: (clones) => Array.from(new Set(clones.flatMap((c) => c.instances.map((i) => i.nodeId)))),
  evidence: cloneEvidence,
};

const limitsOf = (quality: ModuleQualitySummary): StructureLimits =>
  quality.limits ?? DEFAULT_STRUCTURE_LIMITS;

const QUALITY_BUILDERS: QualityBuilder[] = [
  (quality) => buildPattern(quality.oversizedModules, OVERSIZED_MODULES),
  (quality) => buildPattern(quality.godFiles, GOD_FILES),
  (quality) => buildPattern(quality.godClasses, GOD_CLASSES),
  (quality) => buildPattern(quality.longMethods, longMethodsSpec(limitsOf(quality))),
  (quality) => buildPattern(quality.complexMethods, complexMethodsSpec(limitsOf(quality))),
  (quality) => buildPattern(quality.mixedResponsibilityModules, MIXED_RESPONSIBILITY),
  (quality) => buildPattern(quality.codeClones ?? [], CODE_CLONES),
];

/**
 * Turns the module quality findings into patterns (oversized modules, god files and classes, long
 * and complex methods, mixed responsibilities, code clones). A pattern is only returned for a kind
 * with at least one finding.
 */
export function buildQualityPatterns(quality: ModuleQualitySummary): DetectedPattern[] {
  return runBuilders(QUALITY_BUILDERS, quality);
}

function describeRange(item: { startLine: number; endLine: number }): string {
  return item.startLine > 0 && item.endLine >= item.startLine
    ? `L${item.startLine}-L${item.endLine}`
    : 'line range unavailable';
}

/** One evidence line about a class: size, method counts and complexity. */
export function describeClassEvidence(fileName: string, item: SourceClassMetric): string {
  return `${fileName} -> class ${item.name} (${describeRange(item)}): ${item.lineCount} LOC, ${item.methodCount} methods, ${item.publicMethodCount} public, max complexity ${item.maxMethodComplexity}.`;
}

/** One evidence line about a function: size, complexity, branches and nesting. */
export function describeMethodEvidence(fileName: string, item: SourceFunctionMetric): string {
  return `${fileName} -> ${item.name} (${describeRange(item)}): ${item.lineCount} LOC, complexity ${item.complexity}, branches ${item.branchCount}, max nesting ${item.maxNesting}.`;
}

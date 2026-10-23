import type {
  ModuleQualitySummary,
  SourceClassMetric,
  SourceFunctionMetric,
} from './moduleQualityMetrics';
import type { DetectedPattern } from './patternDetectionTypes';
import { runBuilders } from './patternBuilderRunner';

// Every copy of every group is evidence, so a change to any file can find the copies it touches.
const MAX_CLONE_EVIDENCE = 120;

type QualityBuilder = (quality: ModuleQualitySummary) => DetectedPattern | null;

/** Flattens per-file matches into at most two evidence lines per file, capped at eight overall. */
function methodEvidence(
  entries: Array<{ node: { id: string; label: string }; matchedMethods: SourceFunctionMetric[] }>
) {
  return entries
    .flatMap(({ node, matchedMethods }) =>
      matchedMethods.slice(0, 2).map((item) => ({
        nodeId: node.id,
        message: describeMethodEvidence(node.label, item),
      }))
    )
    .slice(0, 8);
}

function buildOversizedModulesPattern(quality: ModuleQualitySummary): DetectedPattern | null {
  if (quality.oversizedModules.length === 0) return null;
  return {
    id: 'oversized_modules',
    severity: quality.oversizedModules.some(
      ({ lineCount, symbolCount }) => (lineCount || 0) >= 1200 || symbolCount >= 40
    )
      ? 'high'
      : 'medium',
    title: 'Oversized Modules',
    description:
      'Some files are too large or too symbol-dense, making responsibilities unclear and architectural evolution harder.',
    nodeIds: quality.oversizedModules.map(({ node }) => node.id),
    evidence: quality.oversizedModules.slice(0, 5).map(({ node, lineCount, symbolCount }) => ({
      nodeId: node.id,
      message: `${node.label}: ${lineCount || 0} LOC, ${symbolCount} symbols.`,
    })),
  };
}

function buildGodFilesPattern(quality: ModuleQualitySummary): DetectedPattern | null {
  if (quality.godFiles.length === 0) return null;
  return {
    id: 'god_files',
    severity: 'high',
    title: 'God Files',
    description:
      'A few modules accumulate too much code, too many symbols, or too many architectural responsibilities, violating SRP and making safe changes harder.',
    nodeIds: quality.godFiles.map(({ node }) => node.id),
    evidence: quality.godFiles
      .slice(0, 5)
      .map(({ node, responsibilityAxisCount, designSmellScore, sourceMetrics }) => ({
        nodeId: node.id,
        message: `${node.label}: smell score ${designSmellScore}, axes ${responsibilityAxisCount}, god classes ${sourceMetrics.godClasses.length}.`,
      })),
  };
}

function buildGodClassesPattern(quality: ModuleQualitySummary): DetectedPattern | null {
  if (quality.godClasses.length === 0) return null;
  return {
    id: 'god_classes',
    severity: quality.godClasses.some(({ matchedClasses }) =>
      matchedClasses.some((item) => item.lineCount >= 400 || item.methodCount >= 16)
    )
      ? 'high'
      : 'medium',
    title: 'God Classes',
    description:
      'Some classes expose too many methods or span too many lines, suggesting broken encapsulation and SRP violations.',
    nodeIds: quality.godClasses.map(({ node }) => node.id),
    evidence: quality.godClasses
      .flatMap(({ node, matchedClasses }) =>
        matchedClasses.slice(0, 2).map((item) => ({
          nodeId: node.id,
          message: describeClassEvidence(node.label, item),
        }))
      )
      .slice(0, 8),
  };
}

function buildLongMethodsPattern(quality: ModuleQualitySummary): DetectedPattern | null {
  if (quality.longMethods.length === 0) return null;
  return {
    id: 'long_methods',
    severity: quality.longMethods.some(({ matchedMethods }) =>
      matchedMethods.some((item) => item.lineCount >= 120)
    )
      ? 'high'
      : 'medium',
    title: 'Long Methods',
    description:
      'Some files contain methods or functions that are too long, making intent harder to follow and safe refactoring more expensive.',
    nodeIds: quality.longMethods.map(({ node }) => node.id),
    evidence: methodEvidence(quality.longMethods),
  };
}

function buildComplexMethodsPattern(quality: ModuleQualitySummary): DetectedPattern | null {
  if (quality.complexMethods.length === 0) return null;
  return {
    id: 'complex_methods',
    severity: quality.complexMethods.some(({ matchedMethods }) =>
      matchedMethods.some((item) => item.complexity >= 15 || item.maxNesting >= 5)
    )
      ? 'high'
      : 'medium',
    title: 'Complex Methods',
    description:
      'Some methods contain too many branches or too much nesting, so behavior is harder to reason about and refactor safely.',
    nodeIds: quality.complexMethods.map(({ node }) => node.id),
    evidence: methodEvidence(quality.complexMethods),
  };
}

function buildMixedResponsibilityPattern(quality: ModuleQualitySummary): DetectedPattern | null {
  if (quality.mixedResponsibilityModules.length === 0) return null;
  return {
    id: 'mixed_responsibility_modules',
    severity: quality.mixedResponsibilityModules.some(
      ({ responsibilityAxisCount, lineCount }) =>
        responsibilityAxisCount >= 6 || (lineCount || 0) >= 800
    )
      ? 'high'
      : 'medium',
    title: 'Mixed Responsibility Modules',
    description:
      'Some modules mix orchestration, runtime wiring, contracts, and helper logic in one place, making clean layering and future extraction harder.',
    nodeIds: quality.mixedResponsibilityModules.map(({ node }) => node.id),
    evidence: quality.mixedResponsibilityModules
      .slice(0, 5)
      .map(({ node, responsibilityAxisCount, designSmellScore, sourceMetrics }) => ({
        nodeId: node.id,
        message: `${node.label}: smell score ${designSmellScore}, axes ${responsibilityAxisCount}, long methods ${sourceMetrics.longMethods.length}, complex methods ${sourceMetrics.complexMethods.length}.`,
      })),
  };
}

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

function buildCodeClonesPattern(quality: ModuleQualitySummary): DetectedPattern | null {
  const clones = quality.codeClones;
  if (!clones || clones.length === 0) return null;
  return {
    id: 'code_clones',
    severity: clones.some(
      (clone) => clone.instances[0].lineCount >= 30 || clone.instances.length >= 4
    )
      ? 'high'
      : 'medium',
    title: 'Code Clones (Duplication)',
    description:
      'Identical or highly similar code structures were detected across multiple files. LLMs often duplicate logic instead of extracting reusable abstractions, bloating the codebase.',
    nodeIds: Array.from(new Set(clones.flatMap((c) => c.instances.map((i) => i.nodeId)))),
    evidence: cloneEvidence(clones),
  };
}

const QUALITY_BUILDERS: QualityBuilder[] = [
  buildOversizedModulesPattern,
  buildGodFilesPattern,
  buildGodClassesPattern,
  buildLongMethodsPattern,
  buildComplexMethodsPattern,
  buildMixedResponsibilityPattern,
  buildCodeClonesPattern,
];

export function buildQualityPatterns(quality: ModuleQualitySummary): DetectedPattern[] {
  return runBuilders(QUALITY_BUILDERS, quality);
}

function describeClassEvidence(fileName: string, item: SourceClassMetric): string {
  const range =
    item.startLine > 0 && item.endLine >= item.startLine
      ? `L${item.startLine}-L${item.endLine}`
      : 'line range unavailable';
  return `${fileName} -> class ${item.name} (${range}): ${item.lineCount} LOC, ${item.methodCount} methods, ${item.publicMethodCount} public, max complexity ${item.maxMethodComplexity}.`;
}

function describeMethodEvidence(fileName: string, item: SourceFunctionMetric): string {
  const range =
    item.startLine > 0 && item.endLine >= item.startLine
      ? `L${item.startLine}-L${item.endLine}`
      : 'line range unavailable';
  return `${fileName} -> ${item.name} (${range}): ${item.lineCount} LOC, complexity ${item.complexity}, branches ${item.branchCount}, max nesting ${item.maxNesting}.`;
}

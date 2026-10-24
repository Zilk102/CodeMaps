/**
 * Baseline ("ratchet") API: lets strict rules run in an old codebase without drowning the agent
 * in old findings. Only new or worsened findings count; old debt is tracked and may only shrink.
 *
 * - `createProjectBaseline(graph)` measures a project and writes `.codemaps/baseline.json`.
 * - `readBaseline(root)`, `classifyFindings(findings, baseline)`, `shrinkBaseline(root, findings)`
 *   are the building blocks; `collectFindings(sources)` produces the findings they work on.
 * See docs/PROJECT_CONFIG.md.
 */
export { classifyFindings, reportable } from './classify';
export { collectFindings, type FindingSources } from './collectFindings';
export {
  BASELINE_FILE_NAME,
  baselineFromFindings,
  baselinePath,
  readBaseline,
  shrinkBaseline,
  writeBaseline,
  type ShrinkResult,
} from './baselineFile';
export {
  createBaseline,
  createProjectBaseline,
  loadRatchet,
  measureProject,
  refreshBaseline,
  type BaselineCreation,
} from './baselineService';
export { fingerprintFindings, kindOfFingerprint } from './fingerprint';
export { summarizeKinds, summarizeLegacyDebt } from './legacyDebt';
export {
  applyRatchetToDocumentation,
  applyRatchetToPatterns,
  buildRatchetContext,
  type RatchetContext,
} from './ratchet';
export type * from './types';

/**
 * Per-project configuration: public API.
 *
 * - `loadProjectConfig(root)` reads `<root>/.codemaps/config.json` tolerantly (never throws).
 * - `writeDefaultProjectConfig(root)` creates the default file for a setup tool.
 * - `structureLimitsOf(config)` gives the function limits the structure analysis applies.
 * See docs/PROJECT_CONFIG.md for the file format.
 */
export { clearProjectConfigCache, loadProjectConfig, projectConfigPath } from './configLoader';
export { parseProjectConfig } from './configParser';
export { writeDefaultProjectConfig, defaultProjectConfigText } from './defaultConfigFile';
export { compileGlobs } from './globMatcher';
export { CODEMAPS_DIRECTORY, codemapsFilePath, relativeToRoot, toPosix } from './projectPaths';
export {
  DEFAULT_STRUCTURE_LIMITS,
  structureLimitsOf,
  type StructureLimits,
} from './structureLimits';
export {
  DEFAULT_PROJECT_CONFIG,
  type DocumentationSettings,
  type LoadedProjectConfig,
  type ProjectConfig,
  type ProjectMode,
  type QualityThresholds,
} from './types';

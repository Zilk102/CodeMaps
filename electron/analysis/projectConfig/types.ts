/**
 * Types and defaults of the per-project configuration (`<project>/.codemaps/config.json`).
 *
 * The configuration lets one project tune what CodeMaps measures and how strictly it judges the
 * result, without touching the app. Every field has a default, so a project without the file
 * behaves exactly like CodeMaps always did.
 */

/**
 * How findings are judged. `ratchet` compares them with the baseline of the project, so only new
 * or worsened findings count; `strict` ignores the baseline and counts every finding.
 */
export type ProjectMode = 'ratchet' | 'strict';

/** Limits for a single function; a function over a limit is reported as long, complex or deep. */
export interface QualityThresholds {
  /** A function with more lines than this is long. */
  maxFunctionLines: number;
  /** A function with a higher cyclomatic complexity than this is complex. */
  maxComplexity: number;
  /** A function nested deeper than this is deep. */
  maxNesting: number;
}

/** What the documentation coverage measures. */
export interface DocumentationSettings {
  /** When false, documentation is not measured and produces no findings. */
  enabled: boolean;
  /** Files with fewer lines than this need no header comment. */
  headerMinLines: number;
  /** A private function of at least this many lines must be documented. */
  functionMinLines: number;
}

/** The resolved configuration of a project: every field is present. */
export interface ProjectConfig {
  version: 1;
  mode: ProjectMode;
  /** Globs relative to the project root of files that no analysis should look at. */
  exclude: string[];
  thresholds: QualityThresholds;
  documentation: DocumentationSettings;
  /**
   * The thresholds the file sets itself. Only these replace CodeMaps' built-in detection limits,
   * so a project that never wrote a threshold keeps the behavior it always had.
   */
  explicitThresholds: Partial<QualityThresholds>;
}

/** The configuration of a project without a config file. */
export const DEFAULT_PROJECT_CONFIG: ProjectConfig = {
  version: 1,
  mode: 'ratchet',
  exclude: [],
  thresholds: { maxFunctionLines: 60, maxComplexity: 8, maxNesting: 3 },
  documentation: { enabled: true, headerMinLines: 15, functionMinLines: 10 },
  explicitThresholds: {},
};

/** A configuration together with what the loader learned while reading it. */
export interface LoadedProjectConfig {
  config: ProjectConfig;
  /** Problems found in the file (invalid JSON, unknown or invalid fields); empty when clean. */
  warnings: string[];
  /** Whether a config file exists for the project. */
  present: boolean;
  /** Whether a file (absolute path, or relative to the project root) is excluded by the config. */
  isExcluded: (file: string) => boolean;
}

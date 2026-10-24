/**
 * Shared types of `setup_project`: which agents CodeMaps writes guardrails for, what it detected
 * in a project, how each file is written and what the tool reports back.
 */

/** Every agent family that has its own rules file. `codex` and unknown clients rely on AGENTS.md alone. */
export const AGENT_IDS = [
  'claude',
  'cursor',
  'codex',
  'copilot',
  'gemini',
  'windsurf',
  'cline',
] as const;

/** One agent family, see `AGENT_IDS`. */
export type AgentId = (typeof AGENT_IDS)[number];

/** Build, test and lint commands found in the project files; absent keys were not found. */
export interface ProjectCommands {
  test?: string;
  lint?: string;
  build?: string;
  typecheck?: string;
  format?: string;
}

/** A manifest file that identifies an ecosystem, and the usual commands of that ecosystem. */
export interface Ecosystem {
  /** Exact file name, or a regular expression matched against root entries. */
  marker: string | RegExp;
  language: string;
  packageManager: string;
  commands: ProjectCommands;
}

/** What `detectProject` learned from the files in the project root. */
export interface DetectedProject {
  languages: string[];
  packageManager: string | null;
  commands: ProjectCommands;
  /** Continuous-integration providers whose configuration exists in the project. */
  ci: string[];
}

/** Which agents were found and how, so the agent can see why files were written for it. */
export interface DetectedAgents {
  /** Agents whose files already exist in the project. */
  fromProject: AgentId[];
  /** The agent that is calling, from the MCP `clientInfo.name`; null when unknown. */
  fromClient: AgentId | null;
  /** The client name as reported, for diagnostics. */
  clientName: string | null;
  /** The final list guardrails are written for (explicit `agents` input wins over detection). */
  selected: AgentId[];
}

/** How a planned file is written, which decides what may be touched in an existing file. */
export type WriteStrategy = 'block' | 'owned' | 'claude-hook';

/** One file `setup_project` wants to write; `content` depends on the strategy (see `applyPlannedFile`). */
export interface PlannedFile {
  /** Path relative to the project root, forward slashes. */
  path: string;
  strategy: WriteStrategy;
  content: string;
  /** Comment style of the marker in an `owned` file. */
  style?: 'html' | 'slash' | 'hash';
}

/** What happened (or would happen) to one file. */
export type FileAction = 'created' | 'updated' | 'unchanged' | 'skipped';

/** The outcome for one file; `sha256` covers only the part CodeMaps wrote, never user content. */
export interface FileOutcome {
  path: string;
  action: FileAction;
  reason?: string;
  /** True for a skip a person has to act on (invalid JSON, unsafe path, broken marker). */
  problem?: boolean;
  sha256?: string;
  version?: string;
}

/** The state of the baseline after the tool ran. */
export interface BaselineSummary {
  status: 'created' | 'exists' | 'would-create' | 'skipped' | 'failed';
  path: string;
  reason?: string;
  /** Number of legacy findings frozen, present when known. */
  total?: number;
  /** Frozen findings per kind, present when known. */
  byKind?: Record<string, number>;
}

/** A CI suggestion; CodeMaps never writes workflow files. */
export interface CiSuggestion {
  provider: string;
  text: string;
}

/** The compact, bounded result of `setup_project`. */
export interface SetupResult {
  status: 'ok' | 'partial' | 'dry-run';
  upToDate: boolean;
  projectRoot: string;
  codemapsVersion: string;
  detected: DetectedProject & { agents: DetectedAgents };
  written: string[];
  updated: string[];
  unchanged: string[];
  skipped: Array<{ path: string; reason: string }>;
  /** Present in a dry run: the files an applying run would create or update. */
  wouldWrite?: Array<{ path: string; action: 'create' | 'update' }>;
  baseline: BaselineSummary;
  warnings: string[];
  nextSteps: string[];
  ciSuggestion: CiSuggestion;
}

/** The inputs of one setup run, already validated. */
export interface SetupOptions {
  root: string;
  /** Version of CodeMaps; marks every block and file so older ones can be refreshed. */
  version: string;
  /** Name the MCP client reported on connect. */
  clientName?: string | null;
  agents?: AgentId[];
  apply: boolean;
  force: boolean;
}

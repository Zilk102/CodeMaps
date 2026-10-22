export interface HookFinding {
  id?: string;
  severity: string;
  title: string;
  files: string[];
  fix: string;
  evidence?: Array<{ message: string }>;
}

export interface HookValidation {
  findings?: HookFinding[];
}

export interface HookResult {
  exitCode: number;
  stderr?: string;
}

export function isCandidateFile(filePath: string | undefined): boolean;
export function isInsideProject(filePath: string, projectRoot: string | null | undefined): boolean;
export function buildReport(
  validation: HookValidation,
  projectRoot: string,
  editedFile: string
): string | null;
export function isRepeat(
  stateFile: string,
  editedFile: string,
  report: string,
  now?: number
): boolean;
export function run(
  rawInput: string,
  env?: Record<string, string | undefined>
): Promise<HookResult>;

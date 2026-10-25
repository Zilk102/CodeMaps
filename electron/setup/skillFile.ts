/**
 * Builds the planned `SKILL.md` file shared by every agent that reads skills (Claude Code and
 * OpenCode): one template, one marker, a different folder.
 */
import { SKILL_TEMPLATE } from './templates/skillTemplate';
import type { PlannedFile } from './types';

/** The skill as a CodeMaps-owned file at `filePath`, with `endpoint` filled in. */
export const skillFile = (filePath: string, endpoint: string): PlannedFile => ({
  path: filePath,
  strategy: 'owned',
  style: 'html',
  content: SKILL_TEMPLATE.split('__ENDPOINT__').join(endpoint),
});

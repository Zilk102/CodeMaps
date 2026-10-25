/**
 * The DeepSeek Harness (`dsh`, developer preview) side of `setup_project`. DSH registers MCP
 * servers host-wide in a `cordis.patch.yml`, not per project, and CodeMaps never writes outside the
 * project, so it writes a ready overlay file inside `.codemaps/dsh/` and tells the user how to use
 * it. The format comes from the published documentation of the preview; it has not been run
 * against a real DSH install by CodeMaps.
 */
import { FILE_MARKER_TOKEN } from './markers';

/** Where the overlay is written, relative to the project root. */
export const DSH_OVERLAY_PATH = '.codemaps/dsh/cordis.patch.yml';

/** The command that starts DSH with the overlay for this project. */
export const DSH_OVERLAY_COMMAND = `npx @deepseek-ai/dsh web --patch ${DSH_OVERLAY_PATH}`;

/** The overlay file for `endpoint`; the marker token receives the version marker. */
export const dshOverlayTemplate = (endpoint: string): string => `${FILE_MARKER_TOKEN}
# CodeMaps MCP server for the DeepSeek Harness (developer preview). Written by setup_project.
# One-off use:   ${DSH_OVERLAY_COMMAND}
# Permanent use: copy the entry below into the cordis.patch.yml of your DSH home ($DSH_HOME; the default
# is probably ~/.dsh, unconfirmed) or of a profile. DSH has no per-project MCP configuration, so CodeMaps does not do that.
# Tools reach the model as mcp__codemaps__<tool>.
- insert:
  - id: mcp-codemaps
    name: '@deepseek-ai/dsh-mcp-client'
    config:
      serverName: codemaps
      transport: streamable-http
      url: ${endpoint}
`;

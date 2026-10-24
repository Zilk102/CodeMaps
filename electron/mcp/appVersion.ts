/** The CodeMaps version, shared by the MCP server identity and the markers `setup_project` writes. */

/**
 * Version reported to MCP clients and written into agent files: the Electron app version, or
 * `0.0.0` when Electron is unavailable (unit tests, plain Node).
 */
export const resolveAppVersion = (): string => {
  try {
    // Lazy require keeps this module loadable in unit tests, where Electron is unavailable.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron') as typeof import('electron');
    return app?.getVersion?.() || '0.0.0';
  } catch {
    return '0.0.0';
  }
};

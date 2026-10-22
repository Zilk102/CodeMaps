export type McpListenError = 'port_in_use' | 'listen_failed';

type ErrorEmitter = {
  on: (event: 'error', listener: (error: Error & { code?: string }) => void) => unknown;
};

export const classifyListenError = (error: Error & { code?: string }): McpListenError =>
  error.code === 'EADDRINUSE' ? 'port_in_use' : 'listen_failed';

/**
 * Reports failures to bind the MCP port instead of letting them escape. The `ws` server
 * re-emits the HTTP server's errors on itself, so both must have a listener; without one a busy
 * port (a second CodeMaps window, another program on 3005) surfaces as a "Critical Application
 * Error" dialog that takes the whole app down.
 */
export const watchListenErrors = (
  emitters: ErrorEmitter[],
  onFailure: (kind: McpListenError, error: Error) => void
) => {
  for (const emitter of emitters) {
    emitter.on('error', (error) => onFailure(classifyListenError(error), error));
  }
};

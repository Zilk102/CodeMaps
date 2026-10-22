/**
 * A session id this process does not know (typically one issued before CodeMaps restarted)
 * must be answered with 404 so spec-compliant clients start a fresh session on their own;
 * a missing id stays a plain 400.
 */
export const rejectUnknownSession = (
  res: { status: (code: number) => { json: (body: unknown) => unknown } },
  sessionId: string | string[] | undefined
) => {
  const stale = typeof sessionId === 'string' && sessionId.length > 0;
  res.status(stale ? 404 : 400).json({
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message: stale
        ? 'Session not found: re-initialize the MCP connection'
        : 'Bad Request: No valid MCP session id provided',
    },
    id: null,
  });
};

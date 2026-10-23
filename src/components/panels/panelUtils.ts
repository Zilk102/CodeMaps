/** Message to show for a failed analysis: the Error's own message, else the localized fallback. */
export function toErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    return err.message || fallback;
  }
  return fallback;
}

export interface IpcResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/** Returns the payload of a successful IPC response, or throws with its error. */
export function unwrapResponse<T>(response: IpcResponse<unknown>): T {
  if (response.success && response.data) {
    return response.data as T;
  }
  throw new Error(response.error || 'Unknown error');
}

/** "Label · type" line shown for the node currently selected in the graph. */
export function describeNode(node: { label: string; type: string } | null | undefined) {
  if (!node) return null;
  return `${node.label} · ${node.type}`;
}

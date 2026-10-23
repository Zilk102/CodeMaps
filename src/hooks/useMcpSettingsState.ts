import { useEffect, useState } from 'react';
import type { McpStatus } from '../components/mcp-settings/types';

/** Loads the MCP server status while the modal is open and handles Escape-to-close. */
export const useMcpSettingsState = (isOpen: boolean, setOpen: (open: boolean) => void) => {
  const [status, setStatus] = useState<McpStatus | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    window.api
      ?.getMcpStatus?.()
      .then((nextStatus) => setStatus(nextStatus as McpStatus))
      .catch(() => setStatus(null));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, setOpen]);

  const copyText = async (key: string, text?: string) => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 1500);
  };

  return { status, copiedKey, copyText };
};

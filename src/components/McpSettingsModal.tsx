import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGraphStore, useUIStore } from '../store/useStore';
import { SettingsTab } from './mcp-settings/types';
import { McpSettingsBody, McpSettingsHeader } from './mcp-settings/McpSettingsModalParts';
import { useMcpSettingsState } from '../hooks/useMcpSettingsState';

export const McpSettingsModal: React.FC = () => {
  const { t } = useTranslation();
  const { isMcpSettingsOpen: isOpen, setMcpSettingsOpen: setOpen } = useUIStore();
  const { graphData } = useGraphStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>('overview');
  const { status, copiedKey, copyText } = useMcpSettingsState(isOpen, setOpen);

  const endpoint = status?.endpoint || 'http://127.0.0.1:3005/mcp';

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={() => setOpen(false)}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mcp-settings-title"
        style={{ maxWidth: 1080, width: '96vw', maxHeight: '88vh', padding: 0 }}
      >
        <McpSettingsHeader activeTab={activeTab} onTabChange={setActiveTab} />

        <McpSettingsBody
          activeTab={activeTab}
          status={status}
          endpoint={endpoint}
          graphData={graphData}
          copiedKey={copiedKey}
          copyText={copyText}
        />

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            padding: '14px 20px 18px',
            borderTop: '1px solid var(--border)',
          }}
        >
          <button className="btn-glass" onClick={() => setOpen(false)}>
            {t('mcpSettings.close')}
          </button>
        </div>
      </div>
    </div>
  );
};

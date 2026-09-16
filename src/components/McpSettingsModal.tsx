import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGraphStore, useUIStore } from '../store/useStore';
import { McpStatus, SettingsTab } from './mcp-settings/types';
import { McpSettingsOverview } from './mcp-settings/McpSettingsOverview';
import { McpSettingsTools } from './mcp-settings/McpSettingsTools';
import { McpSettingsResources } from './mcp-settings/McpSettingsResources';
import { McpSettingsClients } from './mcp-settings/McpSettingsClients';
import { McpSettingsAgentSkill } from './mcp-settings/McpSettingsAgentSkill';

export const McpSettingsModal: React.FC = () => {
  const { t } = useTranslation();
  const { isMcpSettingsOpen: isOpen, setMcpSettingsOpen: setOpen } = useUIStore();
  const { graphData } = useGraphStore();
  const [status, setStatus] = useState<McpStatus | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>('overview');

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
        <div
          style={{
            padding: '20px 20px 14px',
            borderBottom: '1px solid var(--border)',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))',
          }}
        >
          <h2
            id="mcp-settings-title"
            style={{
              margin: '0 0 10px 0',
              fontSize: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
            {t('mcpSettings.title')}
          </h2>
          <div
            style={{
              marginBottom: '18px',
              color: 'var(--text-secondary)',
              fontSize: '12px',
              lineHeight: 1.5,
              maxWidth: '760px',
            }}
          >
            {t('mcpSettings.streamableHttpServerDescription')}
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>
              {t('mcpSettings.overview')}
            </TabButton>
            <TabButton active={activeTab === 'tools'} onClick={() => setActiveTab('tools')}>
              {t('mcpSettings.toolsTab')}
            </TabButton>
            <TabButton active={activeTab === 'resources'} onClick={() => setActiveTab('resources')}>
              {t('mcpSettings.resourcesTab')}
            </TabButton>
            <TabButton active={activeTab === 'clients'} onClick={() => setActiveTab('clients')}>
              {t('mcpSettings.clients')}
            </TabButton>
            <TabButton
              active={activeTab === 'agent-skill'}
              onClick={() => setActiveTab('agent-skill')}
            >
              {t('mcpSettings.agentSkill')}
            </TabButton>
          </div>
        </div>

        <div
          style={{
            padding: '18px 20px 20px',
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            background: 'transparent',
          }}
        >
          {activeTab === 'overview' && (
            <McpSettingsOverview
              status={status}
              endpoint={endpoint}
              graphData={graphData}
              copiedKey={copiedKey}
              copyText={copyText}
            />
          )}
          {activeTab === 'tools' && <McpSettingsTools toolDetails={status?.toolDetails || []} />}
          {activeTab === 'resources' && (
            <McpSettingsResources resourceDetails={status?.resourceDetails || []} />
          )}
          {activeTab === 'clients' && (
            <McpSettingsClients endpoint={endpoint} copiedKey={copiedKey} copyText={copyText} />
          )}
          {activeTab === 'agent-skill' && (
            <McpSettingsAgentSkill endpoint={endpoint} copiedKey={copiedKey} copyText={copyText} />
          )}
        </div>

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

const TabButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({
  active,
  onClick,
  children,
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
      active
        ? 'bg-(--bg3) text-(--t0) shadow-sm'
        : 'text-(--t2) hover:text-(--t0) hover:bg-(--hover)'
    }`}
  >
    {children}
  </button>
);

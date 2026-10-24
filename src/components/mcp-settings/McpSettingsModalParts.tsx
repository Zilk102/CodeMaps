// Header with tabs and body of the MCP settings modal, mapping each tab to its view.
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { GraphData } from '../../types/graph';
import type { McpStatus, SettingsTab } from './types';
import { McpSettingsOverview } from './McpSettingsOverview';
import { McpSettingsTools } from './McpSettingsTools';
import { McpSettingsResources } from './McpSettingsResources';
import { McpSettingsClients } from './McpSettingsClients';
import { McpSettingsAgentSkill } from './McpSettingsAgentSkill';

/** Tab button, highlighted when active. */
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

const TABS: Array<{ id: SettingsTab; labelKey: string }> = [
  { id: 'overview', labelKey: 'mcpSettings.overview' },
  { id: 'tools', labelKey: 'mcpSettings.toolsTab' },
  { id: 'resources', labelKey: 'mcpSettings.resourcesTab' },
  { id: 'clients', labelKey: 'mcpSettings.clients' },
  { id: 'agent-skill', labelKey: 'mcpSettings.agentSkill' },
];

const GEAR_PATH =
  'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z';

/** Gear icon beside the modal title. */
const GearIcon: React.FC = () => (
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
    <path d={GEAR_PATH}></path>
  </svg>
);

/**
 * Modal heading, one-line description of the server and the tab buttons (overview, tools,
 * resources, clients, agent skill).
 */
export const McpSettingsHeader: React.FC<{
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
}> = ({ activeTab, onTabChange }) => {
  const { t } = useTranslation();
  return (
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
        <GearIcon />
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
        {TABS.map((tab) => (
          <TabButton key={tab.id} active={activeTab === tab.id} onClick={() => onTabChange(tab.id)}>
            {t(tab.labelKey)}
          </TabButton>
        ))}
      </div>
    </div>
  );
};

interface BodyProps {
  status: McpStatus | null;
  endpoint: string;
  graphData: GraphData | null;
  copiedKey: string | null;
  copyText: (key: string, text?: string) => void;
}

const TAB_VIEWS: Record<SettingsTab, (props: BodyProps) => React.ReactNode> = {
  overview: (props) => <McpSettingsOverview {...props} />,
  tools: ({ status }) => <McpSettingsTools toolDetails={status?.toolDetails || []} />,
  resources: ({ status }) => (
    <McpSettingsResources resourceDetails={status?.resourceDetails || []} />
  ),
  clients: ({ endpoint, copiedKey, copyText }) => (
    <McpSettingsClients endpoint={endpoint} copiedKey={copiedKey} copyText={copyText} />
  ),
  'agent-skill': ({ endpoint, copiedKey, copyText }) => (
    <McpSettingsAgentSkill endpoint={endpoint} copiedKey={copiedKey} copyText={copyText} />
  ),
};

/** Scrollable body that renders the view of the active tab. */
export const McpSettingsBody: React.FC<BodyProps & { activeTab: SettingsTab }> = ({
  activeTab,
  ...props
}) => (
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
    {TAB_VIEWS[activeTab](props)}
  </div>
);

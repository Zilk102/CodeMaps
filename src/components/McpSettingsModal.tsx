import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store/useStore';

interface McpStatusToolDescriptor {
  name: string;
  title: string;
  description: string;
  preferredForAgents?: boolean;
  recommendedWhen?: string;
}

interface McpStatusResourceDescriptor {
  uri: string;
  title: string;
  description: string;
  preferredForAgents?: boolean;
}

interface McpStatus {
  enabled: boolean;
  host: string;
  port: number;
  path: string;
  endpoint: string;
  websocketUrl: string;
  resources: string[];
  tools: string[];
  resourceDetails?: McpStatusResourceDescriptor[];
  toolDetails?: McpStatusToolDescriptor[];
  projectRoot: string | null;
  nodesCount: number;
  linksCount: number;
}

type SettingsTab = 'overview' | 'tools' | 'resources' | 'clients' | 'agent-skill';

export const McpSettingsModal: React.FC = () => {
  const { t } = useTranslation();
  const isOpen = useStore(state => state.isMcpSettingsOpen);
  const setOpen = useStore(state => state.setMcpSettingsOpen);
  const graphData = useStore(state => state.graphData);
  const [status, setStatus] = useState<McpStatus | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>('overview');

  useEffect(() => {
    if (!isOpen) return;

    window.api?.getMcpStatus?.()
      .then((nextStatus: McpStatus) => setStatus(nextStatus))
      .catch(() => setStatus(null));
  }, [isOpen]);

  const copyText = async (key: string, text?: string) => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 1500);
  };

  const endpoint = status?.endpoint || 'http://127.0.0.1:3005/mcp';
  const toolDetails = status?.toolDetails || [];
  const resourceDetails = status?.resourceDetails || [];

  const clientExamples = useMemo(() => ([
    {
      id: 'trae',
      title: t('mcpSettings.trae'),
      description: t('mcpSettings.traeDescription'),
      snippet: `{\n  "mcpServers": {\n    "codemaps": {\n      "url": "${endpoint}"\n    }\n  }\n}`,
    },
    {
      id: 'cursor',
      title: t('mcpSettings.cursor'),
      description: t('mcpSettings.cursorDescription'),
      snippet: `{\n  "mcpServers": {\n    "codemaps": {\n      "transport": "streamable-http",\n      "url": "${endpoint}"\n    }\n  }\n}`,
    },
    {
      id: 'claude-code',
      title: t('mcpSettings.claudeCode'),
      description: t('mcpSettings.claudeCodeDescription'),
      snippet: `claude mcp add codemaps ${endpoint} --transport http`,
    },
  ]), [endpoint, t]);

  const skillSnippet = useMemo(() => `---
name: "codemaps-agent-autopilot"
description: "Uses CodeMaps MCP as the default architectural brain for project understanding, debugging, refactors, reviews, and migration campaigns. Invoke whenever CodeMaps is connected."
---

# CodeMaps Agent Autopilot

Use this skill whenever the workspace has the \`codemaps\` MCP server available.

## Goal

Treat CodeMaps as the primary architectural intelligence layer before editing code.
Do not wait until after file inspection to use it.

## MCP Server

- Server name: \`codemaps\`
- MCP endpoint: \`${endpoint}\`

## Default Flow

1. If the project is not analyzed yet, call \`analyze_project\`.
2. For any natural-language user request, call \`prepare_task_context\` first.
3. If CodeMaps routes the task to a campaign-level change, use \`prepare_change_campaign\`.
4. If CodeMaps routes the task to a single-target code change, use \`prepare_change_context\`.
5. If CodeMaps routes the task to diagnostics, review, architecture, or stabilization, use \`prepare_review_context\`.
6. Use low-level tools only as fallback when the composite context explicitly leaves ambiguity.

## Routing Rules

- Bug, incident, regression, "not working", "broken":
  Start with \`prepare_task_context\`.
- Broad migration, replace SDK/library everywhere, cross-cutting refactor:
  Start with \`prepare_task_context\` and follow \`prepare_change_campaign\` if selected.
- Localized feature/refactor with a clear code area:
  Start with \`prepare_task_context\`, then follow \`prepare_change_context\`.
- Review, architecture audit, security review, stabilization:
  Start with \`prepare_task_context\`, then follow \`prepare_review_context\`.

## Mandatory Behavior

- Use CodeMaps before making non-trivial code decisions.
- Prefer CodeMaps composite contexts over raw graph tools.
- Do not guess target files when CodeMaps cannot resolve them confidently.
- For large changes, work in waves from \`prepare_change_campaign\` instead of editing many files ad hoc.
- Re-check CodeMaps after meaningful edits if the architectural context may have changed.

## Low-Level Fallback Tools

Use these only if the selected composite context is insufficient:

- \`search_graph\`
- \`get_node_dependencies\`
- \`get_blast_radius\`
- \`get_architecture_overview\`
- \`get_health_score\`
- \`detect_patterns\`
- \`run_security_scan\`
- \`search_signatures\`

## Expected Outcome

The agent should behave like it has a project-aware architectural map:
- understand the system before editing,
- choose the right scope automatically,
- avoid blind file-by-file wandering,
- treat CodeMaps as the default brain for project structure and impact analysis.
`, [endpoint]);

  if (!isOpen) return null;

  const commonSectionStyle: React.CSSProperties = {
    background: 'var(--glass-bg)',
    padding: '14px',
    borderRadius: '10px',
    border: '1px solid var(--glass-border)',
  };

  const renderOverview = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ ...commonSectionStyle, display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr', gap: '12px' }}>
        <div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>{t('mcpSettings.status')}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: status?.enabled ? '#4caf50' : 'var(--red)', boxShadow: status?.enabled ? '0 0 8px #4caf50' : '0 0 8px var(--red)' }} />
            {status?.enabled ? t('mcpSettings.active') : t('mcpSettings.unavailable')}
          </div>
          <div style={{ marginTop: '8px', color: 'var(--text-secondary)', fontSize: '12px', lineHeight: 1.4 }}>
            {t('mcpSettings.streamableHttpServerDescription')}
          </div>
        </div>
        <MetricCard label={t('mcpSettings.metricTools')} value={`${toolDetails.length || status?.tools.length || 0}`} />
        <MetricCard label={t('mcpSettings.metricResources')} value={`${resourceDetails.length || status?.resources.length || 0}`} />
        <MetricCard label={t('mcpSettings.metricGraph')} value={graphData ? `${status?.nodesCount || graphData.nodes.length} / ${status?.linksCount || graphData.links.length}` : '0 / 0'} hint={t('mcpSettings.metricGraphHint')} />
      </div>

      <div style={{ ...commonSectionStyle, display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', alignItems: 'end' }}>
        <div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>MCP Endpoint</div>
          <CodeBlock>{endpoint}</CodeBlock>
        </div>
        <button className="btn-glass" onClick={() => copyText('endpoint', endpoint)}>
          {copiedKey === 'endpoint' ? t('mcpSettings.copied') : t('mcpSettings.copyUrl')}
        </button>
      </div>

      <div style={{ ...commonSectionStyle }}>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>{t('mcpSettings.websocketUI')}</div>
        <CodeBlock>{status?.websocketUrl || 'ws://localhost:3005'}</CodeBlock>
      </div>

      <div style={{ ...commonSectionStyle }}>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>{t('mcpSettings.activeProject')}</div>
        <CodeBlock>{status?.projectRoot || t('mcpSettings.noProjectOpen')}</CodeBlock>
      </div>

      <div style={{ ...commonSectionStyle }}>
        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>{t('mcpSettings.whatAgentGets')}</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '12px', lineHeight: 1.5 }}>
          {t('mcpSettings.agentBehaviorDescription')}
        </div>
      </div>

      <div style={{ ...commonSectionStyle }}>
        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>{t('mcpSettings.preferredToolsForAgent')}</div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {toolDetails.filter((tool) => tool.preferredForAgents).map((tool) => (
            <div key={tool.name} style={{ background: 'var(--accbg)', border: '1px solid var(--acc)', borderRadius: '999px', padding: '6px 10px', fontSize: '12px', color: 'var(--acc)' }}>
              {tool.name}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderTools = () => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
      {toolDetails.map((tool) => (
        <div key={tool.name} style={commonSectionStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'start' }}>
            <div>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span>{t(`mcpSettings.tools.${tool.name}.title`, { defaultValue: tool.title })}</span>
                {tool.preferredForAgents && (
                  <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'var(--accbg)', border: '1px solid var(--acc)', color: 'var(--acc)' }}>
                    {t('mcpSettings.recommendedForAgent')}
                  </span>
                )}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--acc)', marginTop: '2px' }}>{tool.name}</div>
            </div>
          </div>
          <div style={{ marginTop: '8px', color: 'var(--text-secondary)', fontSize: '12px', lineHeight: 1.45 }}>
            {t(`mcpSettings.tools.${tool.name}.description`, { defaultValue: tool.description })}
          </div>
          {tool.recommendedWhen && (
            <div style={{ marginTop: '8px', color: 'var(--text-primary)', fontSize: '11px', lineHeight: 1.4 }}>
              {t('mcpSettings.whenToUse')}: {t(`mcpSettings.tools.${tool.name}.recommendedWhen`, { defaultValue: tool.recommendedWhen })}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  const getResourceKey = (uri: string) => uri.split('//')[1].replace('/', '_').replace('-', '_');

  const renderResources = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {resourceDetails.map((resource) => (
        <div key={resource.uri} style={commonSectionStyle}>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span>{t(`mcpSettings.resources.${getResourceKey(resource.uri)}.title`, { defaultValue: resource.title })}</span>
            {resource.preferredForAgents && (
              <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'var(--accbg)', border: '1px solid var(--acc)', color: 'var(--acc)' }}>
                {t('mcpSettings.forAutopilot')}
              </span>
            )}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--acc)', marginTop: '2px' }}>{resource.uri}</div>
          <div style={{ marginTop: '8px', color: 'var(--text-secondary)', fontSize: '12px', lineHeight: 1.45 }}>
            {t(`mcpSettings.resources.${getResourceKey(resource.uri)}.description`, { defaultValue: resource.description })}
          </div>
        </div>
      ))}
    </div>
  );

  const renderClients = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {clientExamples.map((client) => (
        <div key={client.id} style={commonSectionStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '12px' }}>
            <div>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{client.title}</div>
              <div style={{ marginTop: '6px', color: 'var(--text-secondary)', fontSize: '12px', lineHeight: 1.45 }}>
                {client.description}
              </div>
            </div>
            <button className="btn-glass" onClick={() => copyText(client.id, client.snippet)}>
              {copiedKey === client.id ? t('mcpSettings.copied') : t('mcpSettings.copy')}
            </button>
          </div>
          <div style={{ marginTop: '10px' }}>
            <CodeBlock>{client.snippet}</CodeBlock>
          </div>
        </div>
      ))}
    </div>
  );

  const renderAgentSkill = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={commonSectionStyle}>
        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>{t('mcpSettings.whyNeeded')}</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '12px', lineHeight: 1.5 }}>
          {t('mcpSettings.skillTemplateDescription')}
        </div>
      </div>

      <div style={{ ...commonSectionStyle, display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', alignItems: 'start' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>{t('mcpSettings.howToUse')}</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '12px', lineHeight: 1.5 }}>
            {t('mcpSettings.skillSetupStep1')}
            <br />
            {t('mcpSettings.skillSetupStep2')}
            <br />
            {t('mcpSettings.skillSetupStep3')}
          </div>
        </div>
        <button className="btn-glass" onClick={() => copyText('agent-skill', skillSnippet)}>
          {copiedKey === 'agent-skill' ? t('mcpSettings.copied') : t('mcpSettings.copySkillMd')}
        </button>
      </div>

      <div style={commonSectionStyle}>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>{t('mcpSettings.readyTemplateSkill')}</div>
        <CodeBlock>{skillSnippet}</CodeBlock>
      </div>
    </div>
  );

  return (
    <div className="modal-overlay" onClick={() => setOpen(false)}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 1080, width: '96vw', maxHeight: '88vh', padding: 0 }}>
        <div style={{ padding: '18px 20px 12px', borderBottom: '1px solid var(--border)' }}>
        <h2 style={{ margin: '0 0 20px 0', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
          {t('mcpSettings.title')}
        </h2>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>{t('mcpSettings.overview')}</TabButton>
          <TabButton active={activeTab === 'tools'} onClick={() => setActiveTab('tools')}>{t('mcpSettings.toolsTab')}</TabButton>
          <TabButton active={activeTab === 'resources'} onClick={() => setActiveTab('resources')}>{t('mcpSettings.resourcesTab')}</TabButton>
          <TabButton active={activeTab === 'clients'} onClick={() => setActiveTab('clients')}>{t('mcpSettings.clients')}</TabButton>
          <TabButton active={activeTab === 'agent-skill'} onClick={() => setActiveTab('agent-skill')}>{t('mcpSettings.agentSkill')}</TabButton>
        </div>
        </div>

        <div style={{ padding: '18px 20px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {activeTab === 'overview' && renderOverview()}
          {activeTab === 'tools' && renderTools()}
          {activeTab === 'resources' && renderResources()}
          {activeTab === 'clients' && renderClients()}
          {activeTab === 'agent-skill' && renderAgentSkill()}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '14px 20px 18px', borderTop: '1px solid var(--border)' }}>
          <button className="btn-glass" onClick={() => setOpen(false)}>
            {t('mcpSettings.close')}
          </button>
        </div>
      </div>
    </div>
  );
};

const MetricCard: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
  <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>{label}</div>
    <div style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '16px' }}>{value}</div>
    {hint && <div style={{ color: 'var(--text-secondary)', fontSize: '11px', marginTop: '4px' }}>{hint}</div>}
  </div>
);

const CodeBlock: React.FC<{ children: string }> = ({ children }) => (
  <pre style={{
    margin: 0,
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid var(--glass-border)',
    borderRadius: '8px',
    padding: '12px',
    color: 'var(--text-primary)',
    fontFamily: 'Consolas, monospace',
    fontSize: '12px',
    overflowX: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  }}>
    {children}
  </pre>
);

const TabButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className="btn-glass"
    style={{
      borderColor: active ? 'var(--acc)' : 'var(--border)',
      color: active ? 'var(--acc)' : 'var(--t1)',
      background: active ? 'var(--accbg)' : 'var(--bg3)',
    }}
  >
    {children}
  </button>
);

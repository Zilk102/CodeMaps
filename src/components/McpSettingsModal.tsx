import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/useStore';

interface McpStatusToolDescriptor {
  name: string;
  title: string;
  description: string;
}

interface McpStatusResourceDescriptor {
  uri: string;
  title: string;
  description: string;
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

type SettingsTab = 'overview' | 'tools' | 'resources' | 'clients';

export const McpSettingsModal: React.FC = () => {
  const isOpen = useStore(state => state.isMcpSettingsOpen);
  const setOpen = useStore(state => state.setMcpSettingsOpen);
  const graphData = useStore(state => state.graphData);
  const [status, setStatus] = useState<McpStatus | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SettingsTab>('overview');

  useEffect(() => {
    if (!isOpen) return;

    (window as any).api?.getMcpStatus?.()
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
      title: 'Trae',
      description: 'HTTP MCP сервер добавляется по URL. Для локального CodeMaps используй streamable HTTP endpoint.',
      snippet: `{\n  "mcpServers": {\n    "codemaps": {\n      "url": "${endpoint}"\n    }\n  }\n}`,
    },
    {
      id: 'cursor',
      title: 'Cursor',
      description: 'Для Cursor укажи transport как streamable HTTP и тот же локальный endpoint.',
      snippet: `{\n  "mcpServers": {\n    "codemaps": {\n      "transport": "streamable-http",\n      "url": "${endpoint}"\n    }\n  }\n}`,
    },
    {
      id: 'claude-code',
      title: 'Claude Code',
      description: 'Claude Code удобнее всего подключать CLI-командой, чтобы сразу зарегистрировать сервер в клиенте.',
      snippet: `claude mcp add codemaps ${endpoint} --transport http`,
    },
  ]), [endpoint]);

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
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Статус</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: status?.enabled ? '#4caf50' : 'var(--red)', boxShadow: status?.enabled ? '0 0 8px #4caf50' : '0 0 8px var(--red)' }} />
            {status?.enabled ? 'Активен' : 'Недоступен'}
          </div>
          <div style={{ marginTop: '8px', color: 'var(--text-secondary)', fontSize: '12px', lineHeight: 1.4 }}>
            Streamable HTTP MCP сервер для агентов и отдельный WebSocket канал для UI.
          </div>
        </div>
        <MetricCard label="Инструменты" value={`${toolDetails.length || status?.tools.length || 0}`} />
        <MetricCard label="Ресурсы" value={`${resourceDetails.length || status?.resources.length || 0}`} />
        <MetricCard label="Граф" value={graphData ? `${status?.nodesCount || graphData.nodes.length} / ${status?.linksCount || graphData.links.length}` : '0 / 0'} hint="узлы / связи" />
      </div>

      <div style={{ ...commonSectionStyle, display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', alignItems: 'end' }}>
        <div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>MCP Endpoint</div>
          <CodeBlock>{endpoint}</CodeBlock>
        </div>
        <button className="btn-glass" onClick={() => copyText('endpoint', endpoint)}>
          {copiedKey === 'endpoint' ? 'Скопировано' : 'Копировать URL'}
        </button>
      </div>

      <div style={{ ...commonSectionStyle }}>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>WebSocket для UI</div>
        <CodeBlock>{status?.websocketUrl || 'ws://localhost:3005'}</CodeBlock>
      </div>

      <div style={{ ...commonSectionStyle }}>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Активный проект</div>
        <CodeBlock>{status?.projectRoot || 'Проект не открыт'}</CodeBlock>
      </div>

      <div style={{ ...commonSectionStyle }}>
        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>Что это даёт агенту</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '12px', lineHeight: 1.5 }}>
          `CodeMaps` даёт агенту инструменты не только для поиска по коду, но и для анализа архитектуры: graph context, blast radius, health score, architecture overview, pattern detection, security scan и search по сигнатурам.
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
              <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{tool.title}</div>
              <div style={{ fontSize: '11px', color: 'var(--acc)', marginTop: '2px' }}>{tool.name}</div>
            </div>
          </div>
          <div style={{ marginTop: '8px', color: 'var(--text-secondary)', fontSize: '12px', lineHeight: 1.45 }}>
            {tool.description}
          </div>
        </div>
      ))}
    </div>
  );

  const renderResources = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {resourceDetails.map((resource) => (
        <div key={resource.uri} style={commonSectionStyle}>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{resource.title}</div>
          <div style={{ fontSize: '11px', color: 'var(--acc)', marginTop: '2px' }}>{resource.uri}</div>
          <div style={{ marginTop: '8px', color: 'var(--text-secondary)', fontSize: '12px', lineHeight: 1.45 }}>
            {resource.description}
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
              {copiedKey === client.id ? 'Скопировано' : 'Копировать'}
            </button>
          </div>
          <div style={{ marginTop: '10px' }}>
            <CodeBlock>{client.snippet}</CodeBlock>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="modal-overlay" onClick={() => setOpen(false)}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 1080, width: '96vw', maxHeight: '88vh', padding: 0 }}>
        <div style={{ padding: '18px 20px 12px', borderBottom: '1px solid var(--border)' }}>
        <h2 style={{ margin: '0 0 20px 0', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
          Настройки MCP Сервера
        </h2>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>Обзор</TabButton>
          <TabButton active={activeTab === 'tools'} onClick={() => setActiveTab('tools')}>Инструменты</TabButton>
          <TabButton active={activeTab === 'resources'} onClick={() => setActiveTab('resources')}>Ресурсы</TabButton>
          <TabButton active={activeTab === 'clients'} onClick={() => setActiveTab('clients')}>Подключение</TabButton>
        </div>
        </div>

        <div style={{ padding: '18px 20px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {activeTab === 'overview' && renderOverview()}
          {activeTab === 'tools' && renderTools()}
          {activeTab === 'resources' && renderResources()}
          {activeTab === 'clients' && renderClients()}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '14px 20px 18px', borderTop: '1px solid var(--border)' }}>
          <button className="btn-glass" onClick={() => setOpen(false)}>
            Закрыть
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

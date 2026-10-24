// Overview tab of the MCP settings: server status, counts, endpoints and the tools agents should
// prefer.
import React from 'react';
import { useTranslation } from 'react-i18next';
import { McpStatus } from './types';
import { commonSectionStyle, CodeBlock, MetricCard } from './shared';
import { GraphData } from '../../types/graph';
import { countResources, countTools, graphMetricLabel } from './overviewMetrics';

interface Props {
  status: McpStatus | null;
  endpoint: string;
  graphData: GraphData | null;
  copiedKey: string | null;
  copyText: (key: string, text: string) => void;
}

const labelStyle: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--text-secondary)',
  marginBottom: '6px',
};

/**
 * Active or unavailable indicator with the explanation; when the server failed to start it shows
 * the error (such as port in use) with the port.
 */
const StatusBlock: React.FC<{ status: McpStatus | null }> = ({ status }) => {
  const { t } = useTranslation();
  return (
    <div>
      <div style={labelStyle}>{t('mcpSettings.status')}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600' }}>
        <div
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: status?.enabled ? '#4caf50' : 'var(--red)',
            boxShadow: status?.enabled ? '0 0 8px #4caf50' : '0 0 8px var(--red)',
          }}
        />
        {status?.enabled ? t('mcpSettings.active') : t('mcpSettings.unavailable')}
      </div>
      <div
        style={{
          marginTop: '8px',
          color: 'var(--text-secondary)',
          fontSize: '12px',
          lineHeight: 1.4,
        }}
      >
        {status?.error
          ? t(`mcpSettings.error.${status.error}`, { port: status.port })
          : t('mcpSettings.streamableHttpServerDescription')}
      </div>
    </div>
  );
};

/** Row with the status and the tool, resource and graph size counts. */
const MetricsSection: React.FC<{ status: McpStatus | null; graphData: GraphData | null }> = ({
  status,
  graphData,
}) => {
  const { t } = useTranslation();
  return (
    <div
      style={{
        ...commonSectionStyle,
        display: 'grid',
        gridTemplateColumns: '1.2fr 1fr 1fr 1fr',
        gap: '12px',
      }}
    >
      <StatusBlock status={status} />
      <MetricCard label={t('mcpSettings.metricTools')} value={`${countTools(status)}`} />
      <MetricCard label={t('mcpSettings.metricResources')} value={`${countResources(status)}`} />
      <MetricCard
        label={t('mcpSettings.metricGraph')}
        value={graphMetricLabel(status, graphData)}
        hint={t('mcpSettings.metricGraphHint')}
      />
    </div>
  );
};

/** The MCP endpoint in a code block with a button to copy the URL. */
const EndpointSection: React.FC<{
  endpoint: string;
  copiedKey: string | null;
  copyText: (key: string, text: string) => void;
}> = ({ endpoint, copiedKey, copyText }) => {
  const { t } = useTranslation();
  return (
    <div
      style={{
        ...commonSectionStyle,
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: '12px',
        alignItems: 'end',
      }}
    >
      <div>
        <div style={labelStyle}>{t('mcpSettings.mcpEndpoint')}</div>
        <CodeBlock>{endpoint}</CodeBlock>
      </div>
      <button className="btn-glass" onClick={() => copyText('endpoint', endpoint)}>
        {copiedKey === 'endpoint' ? t('mcpSettings.copied') : t('mcpSettings.copyUrl')}
      </button>
    </div>
  );
};

/** Card that explains the zero-config flow: connecting is the only manual step, the agent runs `setup_project` itself. */
const ZeroConfigSection: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div style={{ ...commonSectionStyle }}>
      <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>
        {t('mcpSettings.zeroConfigTitle')}
      </div>
      <div style={{ color: 'var(--text-secondary)', fontSize: '12px', lineHeight: 1.5 }}>
        {t('mcpSettings.zeroConfigBody')}
      </div>
    </div>
  );
};

/** Chips with the names of the tools marked as preferred for agents. */
const PreferredToolsSection: React.FC<{ status: McpStatus | null }> = ({ status }) => {
  const { t } = useTranslation();
  const toolDetails = status?.toolDetails || [];
  return (
    <div style={{ ...commonSectionStyle }}>
      <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>
        {t('mcpSettings.preferredToolsForAgent')}
      </div>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {toolDetails
          .filter((tool) => tool.preferredForAgents)
          .map((tool) => (
            <div
              key={tool.name}
              style={{
                background: 'var(--accbg)',
                border: '1px solid var(--acc)',
                borderRadius: '999px',
                padding: '6px 10px',
                fontSize: '12px',
                color: 'var(--acc)',
              }}
            >
              {tool.name}
            </div>
          ))}
      </div>
    </div>
  );
};

/**
 * Overview tab: metrics, endpoint with copy button, WebSocket address, active project and a note
 * on what agents get, plus the preferred tools.
 */
export const McpSettingsOverview: React.FC<Props> = ({
  status,
  endpoint,
  graphData,
  copiedKey,
  copyText,
}) => {
  const { t } = useTranslation();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <MetricsSection status={status} graphData={graphData} />
      <EndpointSection endpoint={endpoint} copiedKey={copiedKey} copyText={copyText} />
      <ZeroConfigSection />

      <div style={{ ...commonSectionStyle }}>
        <div style={labelStyle}>{t('mcpSettings.websocketUI')}</div>
        <CodeBlock>{status?.websocketUrl || 'ws://localhost:3005'}</CodeBlock>
      </div>

      <div style={{ ...commonSectionStyle }}>
        <div style={labelStyle}>{t('mcpSettings.activeProject')}</div>
        <CodeBlock>{status?.projectRoot || t('mcpSettings.noProjectOpen')}</CodeBlock>
      </div>

      <div style={{ ...commonSectionStyle }}>
        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>
          {t('mcpSettings.whatAgentGets')}
        </div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '12px', lineHeight: 1.5 }}>
          {t('mcpSettings.agentBehaviorDescription')}
        </div>
      </div>

      <PreferredToolsSection status={status} />
    </div>
  );
};

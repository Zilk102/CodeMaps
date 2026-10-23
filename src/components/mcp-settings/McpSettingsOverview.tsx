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

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PRImpactPanel } from './PRImpactPanel';
import { BlastRadiusV2Panel } from './BlastRadiusV2Panel';
import { ActivityHeatmap } from './ActivityHeatmap';

interface ToolsPanelProps {
  projectPath: string;
}

export const ToolsPanel: React.FC<ToolsPanelProps> = ({ projectPath }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'pr' | 'blast' | 'heatmap'>('blast');

  return (
    <div style={{
      width: '350px',
      height: '100%',
      backgroundColor: 'var(--bg1)',
      borderLeft: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border)',
        backgroundColor: 'var(--bg2)'
      }}>
        <button
          onClick={() => setActiveTab('blast')}
          style={{
            flex: 1,
            padding: '12px 8px',
            background: activeTab === 'blast' ? 'var(--bg1)' : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'blast' ? '2px solid var(--acc)' : '2px solid transparent',
            color: activeTab === 'blast' ? 'var(--acc)' : 'var(--t2)',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: activeTab === 'blast' ? 600 : 400,
          }}
        >
          {t('tools.blastRadius', { defaultValue: 'Blast Radius' })}
        </button>
        <button
          onClick={() => setActiveTab('heatmap')}
          style={{
            flex: 1,
            padding: '12px 8px',
            background: activeTab === 'heatmap' ? 'var(--bg1)' : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'heatmap' ? '2px solid var(--acc)' : '2px solid transparent',
            color: activeTab === 'heatmap' ? 'var(--acc)' : 'var(--t2)',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: activeTab === 'heatmap' ? 600 : 400,
          }}
        >
          {t('tools.heatmap', { defaultValue: 'Heatmap' })}
        </button>
        <button
          onClick={() => setActiveTab('pr')}
          style={{
            flex: 1,
            padding: '12px 8px',
            background: activeTab === 'pr' ? 'var(--bg1)' : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'pr' ? '2px solid var(--acc)' : '2px solid transparent',
            color: activeTab === 'pr' ? 'var(--acc)' : 'var(--t2)',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: activeTab === 'pr' ? 600 : 400,
          }}
        >
          {t('tools.prImpact', { defaultValue: 'PR Impact' })}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {activeTab === 'blast' && <BlastRadiusV2Panel projectPath={projectPath} />}
        {activeTab === 'heatmap' && <ActivityHeatmap projectPath={projectPath} />}
        {activeTab === 'pr' && <PRImpactPanel projectPath={projectPath} />}
      </div>
    </div>
  );
};

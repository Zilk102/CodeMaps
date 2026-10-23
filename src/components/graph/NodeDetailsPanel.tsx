import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { GraphData, GraphNode } from '../../types/graph';
import { summarizeNode, type NeighbourSummary } from '../../utils/nodeSummary';

interface NodeDetailsPanelProps {
  graph: GraphData;
  node: GraphNode;
  onSelect: (node: GraphNode) => void;
  onClose: () => void;
}

const NeighbourList: React.FC<{
  title: string;
  items: NeighbourSummary[];
  total: number;
  emptyLabel: string;
  moreLabel: (count: number) => string;
  onSelect: (node: GraphNode) => void;
}> = ({ title, items, total, emptyLabel, moreLabel, onSelect }) => (
  <div>
    <div className="section-label mb-1.5">
      {title} <span className="text-(--t3)">({total})</span>
    </div>
    {items.length === 0 ? (
      <div className="text-(--t3)">{emptyLabel}</div>
    ) : (
      <ul className="flex flex-col gap-0.5">
        {items.map(({ node, links }) => (
          <li key={node.id}>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 text-left hover:bg-(--bg2)"
              onClick={() => onSelect(node)}
              title={node.id}
            >
              <span className="truncate text-(--t0)">{node.label}</span>
              {links > 1 && <span className="shrink-0 text-(--t3)">×{links}</span>}
            </button>
          </li>
        ))}
        {total > items.length && (
          <li className="px-1.5 text-(--t3)">{moreLabel(total - items.length)}</li>
        )}
      </ul>
    )}
  </div>
);

const NodeHeader: React.FC<{ node: GraphNode; onClose: () => void }> = ({ node, onClose }) => {
  const { t } = useTranslation();
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="truncate text-[14px] font-semibold text-(--t0)" title={node.label}>
          {node.label}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-(--t3)">
          <span className="rounded-full bg-(--bg2) px-2 py-0.5">
            {t(`graphView.nodeTypes.${node.type}`, { defaultValue: node.type })}
          </span>
          {node.language && <span>{node.language}</span>}
        </div>
      </div>
      <button
        type="button"
        className="text-(--t3) hover:text-(--t0)"
        onClick={onClose}
        aria-label={t('graphView.details.close')}
      >
        ✕
      </button>
    </div>
  );
};

const ExportsList: React.FC<{ names: string[] }> = ({ names }) => {
  const { t } = useTranslation();
  if (names.length === 0) return null;
  return (
    <div>
      <div className="section-label mb-1.5">{t('graphView.details.exports')}</div>
      <div className="flex flex-wrap gap-1">
        {names.map((name) => (
          <span key={name} className="rounded bg-(--bg2) px-1.5 py-0.5 font-mono text-[11px]">
            {name}
          </span>
        ))}
      </div>
    </div>
  );
};

export const NodeDetailsPanel: React.FC<NodeDetailsPanelProps> = ({
  graph,
  node,
  onSelect,
  onClose,
}) => {
  const { t } = useTranslation();
  const summary = useMemo(() => summarizeNode(graph, node), [graph, node]);

  return (
    <div className="surface-card pointer-events-auto flex min-h-0 w-[320px] flex-col gap-3 overflow-y-auto p-4 text-[12px] text-(--t1) shadow-lg">
      <NodeHeader node={node} onClose={onClose} />

      <div className="break-all font-mono text-[11px] text-(--t2)">{summary.relativePath}</div>

      {node.churn !== undefined && node.churn > 5 && (
        <div className="rounded-md border border-dashed border-(--red) px-2 py-1 text-(--red)">
          {t('graphView.details.highChurn', { count: node.churn })}
        </div>
      )}

      <ExportsList names={summary.exportNames} />

      <NeighbourList
        title={t('graphView.details.usedBy')}
        items={summary.usedBy}
        total={summary.usedByTotal}
        emptyLabel={t('graphView.details.nobody')}
        moreLabel={(count) => t('graphView.details.more', { count })}
        onSelect={onSelect}
      />
      <NeighbourList
        title={t('graphView.details.dependsOn')}
        items={summary.dependsOn}
        total={summary.dependsOnTotal}
        emptyLabel={t('graphView.details.nothing')}
        moreLabel={(count) => t('graphView.details.more', { count })}
        onSelect={onSelect}
      />
    </div>
  );
};

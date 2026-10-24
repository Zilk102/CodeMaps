// Common frame for the tool panels that work on one graph node (header, node picker, error and
// result).
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorBanner, PanelCard, PanelHeader, SelectedNodeBar } from './PanelParts';
import { describeNode } from './panelUtils';

interface FrameNode {
  id: string;
  label: string;
  type: string;
}

interface NodePanelFrameProps {
  eyebrow: string;
  title: string;
  description: string;
  nodeLabel: string;
  selectedNode: FrameNode | null | undefined;
  onUseSelected: (nodeId: string) => void;
  error: string | null;
  /** Inputs and action button rendered under the selected-node bar. */
  controls: React.ReactNode;
  /** Result view rendered below the error banner. */
  children?: React.ReactNode;
}

/** Shared layout of the node-centred tool panels: header, node picker card, error and result. */
export const NodePanelFrame: React.FC<NodePanelFrameProps> = ({
  eyebrow,
  title,
  description,
  nodeLabel,
  selectedNode,
  onUseSelected,
  error,
  controls,
  children,
}) => {
  const { t } = useTranslation();
  const summary = useMemo(() => describeNode(selectedNode), [selectedNode]);

  return (
    <div className="space-y-4 p-4">
      <PanelHeader eyebrow={eyebrow} title={title} description={description} />

      <PanelCard className="p-4">
        <div className="flex flex-col gap-3">
          <SelectedNodeBar
            label={nodeLabel}
            selectedLabel={t('blastRadius.selectedNode')}
            useSelectedLabel={t('blastRadius.useSelected')}
            hasSelection={!!selectedNode}
            summary={summary}
            onUseSelected={() => selectedNode && onUseSelected(selectedNode.id)}
          />

          {controls}
        </div>
      </PanelCard>

      {error && <ErrorBanner className="px-4 py-3 text-sm text-(--red)">{error}</ErrorBanner>}

      {children}
    </div>
  );
};

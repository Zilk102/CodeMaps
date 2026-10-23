import { useTranslation } from 'react-i18next';
import { useGraphStore, useUIStore } from '../store/useStore';
import { useGraphLayout } from './useGraphLayout';
import { useGraphViewport } from './useGraphViewport';
import { getModeDescriptionKey } from '../components/graph/edgeStyle';

// Width taken by the node details panel (320px + margins) when a node is selected.
export const DETAILS_PANEL_RESERVE = 344;

/** Everything the graph screen needs: store state, layout, viewport and the mode help text. */
export const useGraphViewModel = () => {
  const { t } = useTranslation();
  const { graphData, error, filters, layoutMode, setSelectedNode, selectedNode } = useGraphStore();
  const { layoutData, setLayoutData } = useUIStore();

  const { isCalculating, graphInsights } = useGraphLayout(
    graphData,
    filters,
    layoutMode,
    selectedNode,
    setLayoutData,
    layoutData
  );

  const viewport = useGraphViewport({
    layoutData,
    frameKey: `${graphData?.projectRoot ?? ''}|${layoutMode}`,
    focusNodeId: graphInsights?.selectedVisibleId ?? null,
    frameWholeLayout: layoutMode === 'dependencies',
    reserveRight: selectedNode ? DETAILS_PANEL_RESERVE : 0,
  });

  const description = getModeDescriptionKey(layoutMode, graphInsights);
  const modeDescription = description.params
    ? t(description.key, description.params)
    : t(description.key);

  return {
    graphData,
    error,
    layoutMode,
    setSelectedNode,
    selectedNode,
    layoutData,
    isCalculating,
    graphInsights,
    viewport,
    modeDescription,
  };
};

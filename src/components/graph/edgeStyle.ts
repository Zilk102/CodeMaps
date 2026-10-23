import type { NodeEmphasis, LayoutMode } from './nodeStyle';

export interface EdgeSection {
  startPoint: { x: number; y: number };
  endPoint: { x: number; y: number };
  bendPoints?: { x: number; y: number }[];
}

export interface EdgeAppearance {
  strokeColor: string;
  strokeWidth: number;
  strokeDasharray: string;
  marker: string;
}

function strokeColorFor(type: string | undefined): string {
  switch (type) {
    case 'adr':
      return 'var(--purple)';
    case 'framework':
      return 'rgba(92, 207, 230, 0.85)';
    case 'build':
      return 'rgba(255, 195, 113, 0.85)';
    case 'import':
      return 'rgba(255,255,255,0.75)';
    default:
      return 'var(--t3)';
  }
}

function strokeWidthFor(type: string | undefined, isConnected: boolean): number {
  const isAdr = type === 'adr';
  const isFrameworkOrBuild = type === 'framework' || type === 'build';
  if (isConnected) {
    if (isAdr) return 3.5;
    return isFrameworkOrBuild ? 2.8 : 2.4;
  }
  if (isAdr) return 2.4;
  return isFrameworkOrBuild ? 1.8 : 1.2;
}

function dashArrayFor(type: string | undefined): string {
  switch (type) {
    case 'adr':
      return '5,5';
    case 'build':
      return '7,4';
    case 'framework':
      return '3,4';
    default:
      return 'none';
  }
}

export function getEdgeAppearance(
  type: string | undefined,
  isConnectedToSelection: boolean
): EdgeAppearance {
  return {
    strokeColor: strokeColorFor(type),
    strokeWidth: strokeWidthFor(type, isConnectedToSelection),
    strokeDasharray: dashArrayFor(type),
    marker: type === 'adr' ? 'url(#arrowhead-adr)' : 'url(#arrowhead)',
  };
}

export function getEdgeOpacity(
  hasSelection: boolean,
  isConnectedToSelection: boolean,
  layoutMode: LayoutMode
): number {
  if (hasSelection) return isConnectedToSelection ? 0.95 : 0.08;
  return layoutMode === 'dependencies' ? 0.5 : 0.18;
}

/** SVG path data for all routed sections of an edge. */
export function buildEdgePath(sections: EdgeSection[]): string {
  return sections
    .map((sec) => {
      let pathData = `M ${sec.startPoint.x} ${sec.startPoint.y} `;
      if (sec.bendPoints) {
        pathData += sec.bendPoints.map((b) => `L ${b.x} ${b.y} `).join('');
      }
      pathData += `L ${sec.endPoint.x} ${sec.endPoint.y}`;
      return pathData;
    })
    .join(' ');
}

/** How a node is drawn relative to the current selection. */
export function getNodeEmphasis(
  nodeId: string,
  selectedNodeId: string | undefined,
  selectedVisibleId: string | null | undefined,
  relatedNodeIds: Set<string> | undefined
): NodeEmphasis {
  if (!selectedVisibleId) return 'default';
  if (selectedNodeId === nodeId || selectedVisibleId === nodeId) return 'selected';
  return relatedNodeIds?.has(nodeId) ? 'related' : 'muted';
}

export interface DescriptionInsights {
  selectedVisibleId?: string | null;
  incomingCount: number;
  outgoingCount: number;
}

/** i18n key (and params) of the toolbar sentence describing the current layout mode. */
export function getModeDescriptionKey(
  layoutMode: LayoutMode,
  insights: DescriptionInsights | null | undefined
): { key: string; params?: { incomingCount: number; outgoingCount: number } } {
  const prefix = layoutMode === 'hierarchy' ? 'graphView.hierarchy' : 'graphView.dependencies';
  if (insights?.selectedVisibleId) {
    return {
      key: `${prefix}SelectedDescription`,
      params: { incomingCount: insights.incomingCount, outgoingCount: insights.outgoingCount },
    };
  }
  return { key: `${prefix}DefaultDescription` };
}

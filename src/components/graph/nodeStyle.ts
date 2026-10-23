import type { CSSProperties } from 'react';
import type { LayoutMode } from '../../types/graph';

export type { LayoutMode };

export type NodeEmphasis = 'selected' | 'related' | 'muted' | 'default';

export interface NodePalette {
  bgColor: string;
  border: string;
  borderRadius: string;
  textColor: string;
  boxShadow: string;
  labelBackground: string;
}

const DEFAULT_SHADOW = '0 2px 8px rgba(0,0,0,0.4)';

const selectedBorder = (color: string) => `2px solid ${color}`;

function projectPalette(isSelected: boolean): Partial<NodePalette> {
  return {
    bgColor: 'rgba(167, 139, 250, 0.08)',
    border: isSelected ? selectedBorder('var(--purple)') : '2px solid rgba(167, 139, 250, 0.45)',
    textColor: 'var(--purple)',
    boxShadow: 'inset 0 0 0 1px rgba(167, 139, 250, 0.15)',
    labelBackground: 'rgba(167, 139, 250, 0.16)',
  };
}

function directoryPalette(isSelected: boolean, isContainer: boolean): Partial<NodePalette> {
  if (isContainer) {
    return {
      bgColor: 'rgba(77, 159, 255, 0.08)',
      border: isSelected ? selectedBorder('var(--blue)') : '2px solid rgba(77, 159, 255, 0.45)',
      textColor: 'var(--blue)',
      boxShadow: 'inset 0 0 0 1px rgba(77, 159, 255, 0.12)',
      labelBackground: 'rgba(77, 159, 255, 0.14)',
    };
  }
  return {
    bgColor: 'rgba(77, 159, 255, 0.14)',
    border: isSelected ? selectedBorder('var(--blue)') : '1px solid rgba(77, 159, 255, 0.45)',
    textColor: 'var(--blue)',
  };
}

function filePalette(isSelected: boolean, isContainer: boolean): Partial<NodePalette> {
  if (isContainer) {
    return {
      bgColor: 'rgba(34, 197, 94, 0.07)',
      border: isSelected ? selectedBorder('var(--green)') : '1px solid rgba(34, 197, 94, 0.35)',
      textColor: 'var(--green)',
      boxShadow: 'inset 0 0 0 1px rgba(34, 197, 94, 0.08)',
      labelBackground: 'rgba(34, 197, 94, 0.12)',
    };
  }
  return {
    bgColor: 'rgba(34, 197, 94, 0.14)',
    border: isSelected ? selectedBorder('var(--green)') : '1px solid rgba(34, 197, 94, 0.45)',
    textColor: 'var(--green)',
  };
}

function solidPalette(
  isSelected: boolean,
  color: string,
  borderRadius: string,
  textColor: string,
  unselectedBorder = `1px solid ${color}`
): Partial<NodePalette> {
  return {
    bgColor: color,
    border: isSelected ? '2px solid #fff' : unselectedBorder,
    borderRadius,
    textColor,
  };
}

function paletteForType(
  type: string,
  isSelected: boolean,
  isContainer: boolean
): Partial<NodePalette> {
  switch (type) {
    case 'project':
      return projectPalette(isSelected);
    case 'directory':
      return directoryPalette(isSelected, isContainer);
    case 'file':
      return filePalette(isSelected, isContainer);
    case 'class':
      return solidPalette(isSelected, 'var(--orange)', '12px', '#000');
    case 'function':
      return solidPalette(isSelected, 'var(--cyan)', '10px', '#000');
    case 'adr':
      return solidPalette(isSelected, 'var(--purple)', '8px', '#fff', '2px dashed var(--purple)');
    default:
      return {};
  }
}

/** Colours, border and shadow of a graph node box, before emphasis and churn are applied. */
export function getNodePalette(
  type: string,
  isSelected: boolean,
  isContainer: boolean
): NodePalette {
  const base: NodePalette = {
    bgColor: 'var(--bg2)',
    border: isSelected ? '2px solid var(--acc)' : '1px solid var(--border)',
    borderRadius: '6px',
    textColor: 'var(--t0)',
    boxShadow: DEFAULT_SHADOW,
    labelBackground: 'transparent',
  };
  return { ...base, ...paletteForType(type, isSelected, isContainer) };
}

/** Frequently changed files get a red dashed border, except hierarchy containers. */
export function applyChurnBorder(
  border: string,
  churn: number | undefined,
  isContainer: boolean,
  layoutMode: LayoutMode
): string {
  if (churn && churn > 5 && (!isContainer || layoutMode === 'dependencies')) {
    return '2px dashed var(--red)';
  }
  return border;
}

export function getNodeScale(emphasis: NodeEmphasis): string {
  if (emphasis === 'selected') return 'scale(1.03)';
  if (emphasis === 'related') return 'scale(1.01)';
  return 'scale(1)';
}

export function getNodeOpacity(emphasis: NodeEmphasis): number {
  return emphasis === 'muted' ? 0.24 : 1;
}

export function getNodeBoxShadow(
  emphasis: NodeEmphasis,
  paletteShadow: string,
  isContainer: boolean
): string {
  if (emphasis === 'selected') return `0 0 0 1px var(--acc), 0 10px 28px rgba(0,0,0,0.55)`;
  if (emphasis === 'related') return `0 0 0 1px rgba(255,255,255,0.14), ${paletteShadow}`;
  return isContainer ? paletteShadow : DEFAULT_SHADOW;
}

export function getHoverScale(emphasis: NodeEmphasis): string {
  return emphasis === 'selected' ? 'scale(1.06)' : 'scale(1.05)';
}

export interface NodeBoxInput {
  x: number;
  y: number;
  width: number;
  height: number;
  type: string;
  churn?: number;
  isContainer: boolean;
  layoutMode: LayoutMode;
  emphasis: NodeEmphasis;
  isSelected: boolean;
}

/** Inline style of the absolutely positioned node box. */
export function buildNodeBoxStyle(input: NodeBoxInput): CSSProperties {
  const { isContainer, emphasis } = input;
  const palette = getNodePalette(input.type, input.isSelected, isContainer);
  const border = applyChurnBorder(palette.border, input.churn, isContainer, input.layoutMode);

  return {
    position: 'absolute',
    left: input.x,
    top: input.y,
    width: input.width,
    height: input.height,
    backgroundColor: palette.bgColor,
    border,
    borderRadius: palette.borderRadius,
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    alignItems: isContainer ? 'flex-start' : 'center',
    justifyContent: isContainer ? 'flex-start' : 'center',
    padding: isContainer ? '8px' : '0 10px',
    color: palette.textColor,
    fontSize: isContainer ? '11px' : '10px',
    fontWeight: isContainer ? '600' : 'normal',
    fontFamily: 'var(--font-family)',
    pointerEvents: 'auto',
    overflow: 'hidden',
    cursor: 'pointer',
    zIndex: isContainer ? 0 : 2,
    transition: 'border 0.2s ease, box-shadow 0.2s ease, transform 0.1s, opacity 0.2s ease',
    opacity: getNodeOpacity(emphasis),
    transform: getNodeScale(emphasis),
    boxShadow: getNodeBoxShadow(emphasis, palette.boxShadow, isContainer),
  };
}

/** Inline style of the label inside the node; containers get a pill background. */
export function buildNodeLabelStyle(isContainer: boolean, labelBackground: string): CSSProperties {
  return {
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '100%',
    background: isContainer ? labelBackground : 'transparent',
    padding: isContainer ? '2px 8px' : 0,
    borderRadius: isContainer ? '999px' : 0,
  };
}

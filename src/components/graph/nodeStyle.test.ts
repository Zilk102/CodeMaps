import { describe, expect, it } from 'vitest';
import {
  applyChurnBorder,
  buildNodeBoxStyle,
  buildNodeLabelStyle,
  getHoverScale,
  getNodeBoxShadow,
  getNodeOpacity,
  getNodePalette,
  getNodeScale,
} from './nodeStyle';

describe('getNodePalette', () => {
  it('uses the neutral palette for unknown types', () => {
    expect(getNodePalette('method', false, false)).toEqual({
      bgColor: 'var(--bg2)',
      border: '1px solid var(--border)',
      borderRadius: '6px',
      textColor: 'var(--t0)',
      boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
      labelBackground: 'transparent',
    });
    expect(getNodePalette('method', true, false).border).toBe('2px solid var(--acc)');
  });

  it('styles the project node', () => {
    const p = getNodePalette('project', false, true);
    expect(p.border).toBe('2px solid rgba(167, 139, 250, 0.45)');
    expect(p.textColor).toBe('var(--purple)');
    expect(getNodePalette('project', true, true).border).toBe('2px solid var(--purple)');
  });

  it('distinguishes container and leaf directories', () => {
    const container = getNodePalette('directory', false, true);
    const leaf = getNodePalette('directory', false, false);
    expect(container.border).toBe('2px solid rgba(77, 159, 255, 0.45)');
    expect(container.labelBackground).toBe('rgba(77, 159, 255, 0.14)');
    expect(leaf.border).toBe('1px solid rgba(77, 159, 255, 0.45)');
    expect(leaf.labelBackground).toBe('transparent');
    expect(leaf.boxShadow).toBe('0 2px 8px rgba(0,0,0,0.4)');
  });

  it('distinguishes container and leaf files', () => {
    expect(getNodePalette('file', false, true).bgColor).toBe('rgba(34, 197, 94, 0.07)');
    expect(getNodePalette('file', false, false).bgColor).toBe('rgba(34, 197, 94, 0.14)');
    expect(getNodePalette('file', true, false).border).toBe('2px solid var(--green)');
  });

  it('styles solid symbol nodes', () => {
    expect(getNodePalette('class', false, false)).toMatchObject({
      bgColor: 'var(--orange)',
      border: '1px solid var(--orange)',
      borderRadius: '12px',
      textColor: '#000',
    });
    expect(getNodePalette('function', true, false).border).toBe('2px solid #fff');
    expect(getNodePalette('function', false, false).borderRadius).toBe('10px');
    expect(getNodePalette('adr', false, false)).toMatchObject({
      border: '2px dashed var(--purple)',
      borderRadius: '8px',
      textColor: '#fff',
    });
  });
});

describe('applyChurnBorder', () => {
  it('marks heavily changed nodes', () => {
    expect(applyChurnBorder('b', 6, false, 'hierarchy')).toBe('2px dashed var(--red)');
  });

  it('keeps the border for low churn or missing churn', () => {
    expect(applyChurnBorder('b', 5, false, 'hierarchy')).toBe('b');
    expect(applyChurnBorder('b', undefined, false, 'hierarchy')).toBe('b');
  });

  it('skips hierarchy containers but not dependency containers', () => {
    expect(applyChurnBorder('b', 9, true, 'hierarchy')).toBe('b');
    expect(applyChurnBorder('b', 9, true, 'dependencies')).toBe('2px dashed var(--red)');
  });
});

describe('emphasis helpers', () => {
  it('scales by emphasis', () => {
    expect(getNodeScale('selected')).toBe('scale(1.03)');
    expect(getNodeScale('related')).toBe('scale(1.01)');
    expect(getNodeScale('muted')).toBe('scale(1)');
    expect(getHoverScale('selected')).toBe('scale(1.06)');
    expect(getHoverScale('default')).toBe('scale(1.05)');
  });

  it('dims muted nodes only', () => {
    expect(getNodeOpacity('muted')).toBe(0.24);
    expect(getNodeOpacity('default')).toBe(1);
  });

  it('chooses the shadow', () => {
    expect(getNodeBoxShadow('selected', 'x', false)).toContain('var(--acc)');
    expect(getNodeBoxShadow('related', 'x', false)).toBe('0 0 0 1px rgba(255,255,255,0.14), x');
    expect(getNodeBoxShadow('default', 'x', true)).toBe('x');
    expect(getNodeBoxShadow('default', 'x', false)).toBe('0 2px 8px rgba(0,0,0,0.4)');
  });
});

describe('buildNodeBoxStyle / buildNodeLabelStyle', () => {
  const base = {
    x: 1,
    y: 2,
    width: 30,
    height: 40,
    type: 'class',
    isContainer: false,
    layoutMode: 'hierarchy' as const,
    emphasis: 'default' as const,
    isSelected: false,
  };

  it('positions and colours a leaf node', () => {
    expect(buildNodeBoxStyle(base)).toMatchObject({
      left: 1,
      top: 2,
      width: 30,
      height: 40,
      backgroundColor: 'var(--orange)',
      alignItems: 'center',
      padding: '0 10px',
      fontSize: '10px',
      zIndex: 2,
      opacity: 1,
      transform: 'scale(1)',
    });
  });

  it('lays containers out from the top-left and behind leaves', () => {
    const style = buildNodeBoxStyle({ ...base, type: 'directory', isContainer: true });
    expect(style).toMatchObject({ alignItems: 'flex-start', padding: '8px', zIndex: 0 });
  });

  it('applies churn and emphasis', () => {
    const style = buildNodeBoxStyle({ ...base, churn: 10, emphasis: 'muted' });
    expect(style.border).toBe('2px dashed var(--red)');
    expect(style.opacity).toBe(0.24);
  });

  it('only gives container labels a pill background', () => {
    expect(buildNodeLabelStyle(true, 'bg').borderRadius).toBe('999px');
    expect(buildNodeLabelStyle(false, 'bg')).toMatchObject({
      background: 'transparent',
      padding: 0,
      borderRadius: 0,
    });
  });
});

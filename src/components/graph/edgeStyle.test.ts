import { describe, expect, it } from 'vitest';
import {
  buildEdgePath,
  getEdgeAppearance,
  getEdgeOpacity,
  getModeDescriptionKey,
  getNodeEmphasis,
} from './edgeStyle';

describe('getEdgeAppearance', () => {
  it('draws adr edges purple, dashed and heavier', () => {
    expect(getEdgeAppearance('adr', false)).toEqual({
      strokeColor: 'var(--purple)',
      strokeWidth: 2.4,
      strokeDasharray: '5,5',
      marker: 'url(#arrowhead-adr)',
    });
    expect(getEdgeAppearance('adr', true).strokeWidth).toBe(3.5);
  });

  it('distinguishes framework, build and import edges', () => {
    expect(getEdgeAppearance('framework', false)).toMatchObject({
      strokeColor: 'rgba(92, 207, 230, 0.85)',
      strokeWidth: 1.8,
      strokeDasharray: '3,4',
    });
    expect(getEdgeAppearance('build', true)).toMatchObject({
      strokeColor: 'rgba(255, 195, 113, 0.85)',
      strokeWidth: 2.8,
      strokeDasharray: '7,4',
    });
    expect(getEdgeAppearance('import', false)).toMatchObject({
      strokeColor: 'rgba(255,255,255,0.75)',
      strokeWidth: 1.2,
      strokeDasharray: 'none',
      marker: 'url(#arrowhead)',
    });
  });

  it('falls back to the muted style for other types', () => {
    expect(getEdgeAppearance('call', true)).toMatchObject({
      strokeColor: 'var(--t3)',
      strokeWidth: 2.4,
    });
  });
});

describe('getEdgeOpacity', () => {
  it('highlights edges touching the selection', () => {
    expect(getEdgeOpacity(true, true, 'hierarchy')).toBe(0.95);
    expect(getEdgeOpacity(true, false, 'dependencies')).toBe(0.08);
  });

  it('depends on the layout mode without a selection', () => {
    expect(getEdgeOpacity(false, false, 'dependencies')).toBe(0.5);
    expect(getEdgeOpacity(false, false, 'hierarchy')).toBe(0.18);
  });
});

describe('buildEdgePath', () => {
  it('connects start, bend points and end', () => {
    expect(
      buildEdgePath([
        {
          startPoint: { x: 0, y: 1 },
          bendPoints: [{ x: 2, y: 3 }],
          endPoint: { x: 4, y: 5 },
        },
      ])
    ).toBe('M 0 1 L 2 3 L 4 5');
  });

  it('joins several sections with a space', () => {
    const section = { startPoint: { x: 0, y: 0 }, endPoint: { x: 1, y: 1 } };
    expect(buildEdgePath([section, section])).toBe('M 0 0 L 1 1 M 0 0 L 1 1');
  });
});

describe('getNodeEmphasis', () => {
  const related = new Set(['b']);

  it('is default without a visible selection', () => {
    expect(getNodeEmphasis('a', undefined, null, related)).toBe('default');
  });

  it('marks the selected or selected-visible node', () => {
    expect(getNodeEmphasis('a', 'a', 'x', related)).toBe('selected');
    expect(getNodeEmphasis('x', undefined, 'x', related)).toBe('selected');
  });

  it('marks neighbours as related and the rest as muted', () => {
    expect(getNodeEmphasis('b', 'a', 'a', related)).toBe('related');
    expect(getNodeEmphasis('c', 'a', 'a', related)).toBe('muted');
  });
});

describe('getModeDescriptionKey', () => {
  it('picks the default description without a selection', () => {
    expect(getModeDescriptionKey('hierarchy', null)).toEqual({
      key: 'graphView.hierarchyDefaultDescription',
    });
    expect(getModeDescriptionKey('dependencies', undefined).key).toBe(
      'graphView.dependenciesDefaultDescription'
    );
  });

  it('passes the link counts when a node is selected', () => {
    expect(
      getModeDescriptionKey('dependencies', {
        selectedVisibleId: 'n',
        incomingCount: 2,
        outgoingCount: 3,
      })
    ).toEqual({
      key: 'graphView.dependenciesSelectedDescription',
      params: { incomingCount: 2, outgoingCount: 3 },
    });
  });
});

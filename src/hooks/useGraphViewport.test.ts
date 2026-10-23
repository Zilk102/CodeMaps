import { describe, expect, it } from 'vitest';
import {
  chooseFrameStrategy,
  computeFitTransform,
  computeFocusTransform,
  computeZoomTransform,
} from './useGraphViewport';

describe('computeFitTransform', () => {
  it('shrinks a large layout so all of it is visible and centres it', () => {
    const container = { width: 1000, height: 800 };
    const content = { width: 7600, height: 3668 };

    const { scale, x, y } = computeFitTransform(container, content);

    expect(scale).toBeLessThan(1);
    expect(content.width * scale).toBeLessThanOrEqual(container.width);
    expect(content.height * scale).toBeLessThanOrEqual(container.height);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeGreaterThanOrEqual(0);
  });

  it('never enlarges a small layout beyond 1:1', () => {
    const { scale } = computeFitTransform({ width: 1000, height: 800 }, { width: 100, height: 80 });
    expect(scale).toBe(1);
  });

  it('keeps content clear of the panel column on the right', () => {
    const container = { width: 1400, height: 900 };
    const content = { width: 4000, height: 2000 };

    const { scale, x } = computeFitTransform(container, content, { reserveRight: 360 });

    expect(x + content.width * scale).toBeLessThanOrEqual(container.width - 360);
  });

  it('respects the minimum scale', () => {
    const { scale } = computeFitTransform(
      { width: 500, height: 500 },
      { width: 100000, height: 100000 },
      { minScale: 0.05 }
    );
    expect(scale).toBe(0.05);
  });
});

describe('computeFocusTransform', () => {
  it('puts the centre of the node in the middle of the usable area', () => {
    const node = { x: 1000, y: 500, width: 200, height: 60 };
    const { scale, x, y } = computeFocusTransform({ width: 1400, height: 900 }, node, 1, 360);

    expect(x + (node.x + node.width / 2) * scale).toBeCloseTo((1400 - 360) / 2);
    expect(y + (node.y + node.height / 2) * scale).toBeCloseTo(450);
  });

  it('zooms in to a readable scale when the view was far out', () => {
    const { scale } = computeFocusTransform(
      { width: 1400, height: 900 },
      { x: 0, y: 0, width: 10, height: 10 },
      0.1
    );
    expect(scale).toBeGreaterThanOrEqual(0.85);
  });
});

describe('computeZoomTransform', () => {
  const container = { width: 1000, height: 800 };

  it('keeps the centre of the usable area fixed while zooming', () => {
    const current = { scale: 1, positionX: 0, positionY: 0 };
    const next = computeZoomTransform(container, current, 2);
    expect(next.scale).toBe(2);
    // Point at the centre (500, 400) in content space stays at the centre on screen.
    expect(500 * next.scale + next.x).toBe(500);
    expect(400 * next.scale + next.y).toBe(400);
  });

  it('centres on the area left of the reserved panel', () => {
    const next = computeZoomTransform(container, { scale: 1, positionX: 0, positionY: 0 }, 2, 200);
    expect(400 * next.scale + next.x).toBe(400);
  });

  it('clamps to the allowed scale range', () => {
    const zoomedIn = computeZoomTransform(container, { scale: 4, positionX: 0, positionY: 0 }, 10);
    const zoomedOut = computeZoomTransform(
      container,
      { scale: 0.06, positionX: 0, positionY: 0 },
      0.001
    );
    expect(zoomedIn.scale).toBe(5);
    expect(zoomedOut.scale).toBe(0.05);
  });
});

describe('chooseFrameStrategy', () => {
  it('focuses the selected node in the hierarchy view', () => {
    expect(chooseFrameStrategy(false, 'n')).toEqual({ kind: 'focus', nodeId: 'n' });
  });

  it('fits everything without a selection', () => {
    expect(chooseFrameStrategy(false, null)).toEqual({ kind: 'fit', options: {} });
    expect(chooseFrameStrategy(true, null)).toEqual({ kind: 'fit', options: {} });
  });

  it('allows a smaller minimum scale when framing a selected dependency layout', () => {
    expect(chooseFrameStrategy(true, 'n')).toEqual({ kind: 'fit', options: { minScale: 0.2 } });
  });
});

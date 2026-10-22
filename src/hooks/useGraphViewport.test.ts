import { describe, expect, it } from 'vitest';
import { computeFitTransform, computeFocusTransform } from './useGraphViewport';

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

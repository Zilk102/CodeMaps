import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import type { ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import type { LayoutResult } from '../utils/layoutEngine';

export interface ViewTransform {
  scale: number;
  x: number;
  y: number;
}

interface Size {
  width: number;
  height: number;
}

interface FitOptions {
  /** Width taken by floating panels on the right, so content is centred in what stays visible. */
  reserveRight?: number;
  padding?: number;
  minScale?: number;
  maxScale?: number;
}

const MIN_SCALE = 0.05;
const MAX_SCALE = 5;
const FOCUS_MIN_SCALE = 0.85;
const ANIMATION_MS = 220;
const FIT_PADDING = 0.06;
const MAX_FIT_ATTEMPTS = 60;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Scale and offset that centre `content` inside `container`, never larger than 1:1. */
export const computeFitTransform = (
  container: Size,
  content: Size,
  { reserveRight = 0, padding = FIT_PADDING, minScale = MIN_SCALE, maxScale = 1 }: FitOptions = {}
): ViewTransform => {
  const usableWidth = Math.max(1, container.width - reserveRight);
  const usableHeight = Math.max(1, container.height);
  const contentWidth = Math.max(1, content.width);
  const contentHeight = Math.max(1, content.height);

  const scale = clamp(
    Math.min(
      (usableWidth * (1 - padding * 2)) / contentWidth,
      (usableHeight * (1 - padding * 2)) / contentHeight
    ),
    minScale,
    maxScale
  );

  return {
    scale,
    x: (usableWidth - contentWidth * scale) / 2,
    y: (usableHeight - contentHeight * scale) / 2,
  };
};

/** Offset that puts the centre of a node at the centre of the usable area. */
export const computeFocusTransform = (
  container: Size,
  node: { x: number; y: number; width: number; height: number },
  currentScale: number,
  reserveRight = 0
): ViewTransform => {
  const scale = clamp(Math.max(currentScale, FOCUS_MIN_SCALE), MIN_SCALE, MAX_SCALE);
  return {
    scale,
    x: (container.width - reserveRight) / 2 - (node.x + node.width / 2) * scale,
    y: container.height / 2 - (node.y + node.height / 2) * scale,
  };
};

/** Transform that zooms by `factor` around the centre of the usable area. */
export const computeZoomTransform = (
  container: Size,
  current: { scale: number; positionX: number; positionY: number },
  factor: number,
  reserveRight = 0
): ViewTransform => {
  const { scale, positionX, positionY } = current;
  const next = clamp(scale * factor, MIN_SCALE, MAX_SCALE);
  const centreX = (container.width - reserveRight) / 2;
  const centreY = container.height / 2;
  const ratio = next / scale;
  return {
    scale: next,
    x: centreX - (centreX - positionX) * ratio,
    y: centreY - (centreY - positionY) * ratio,
  };
};

export type FrameStrategy =
  { kind: 'focus'; nodeId: string } | { kind: 'fit'; options: FitOptions };

/** What to frame: the selected node in the hierarchy view, otherwise the whole layout. */
export const chooseFrameStrategy = (
  frameWholeLayout: boolean,
  focusNodeId: string | null
): FrameStrategy => {
  if (!frameWholeLayout && focusNodeId) {
    return { kind: 'focus', nodeId: focusNodeId };
  }
  return { kind: 'fit', options: frameWholeLayout && focusNodeId ? { minScale: 0.2 } : {} };
};

interface UseGraphViewportOptions {
  layoutData: LayoutResult | null;
  /** Changes when a different project or layout mode should be framed from scratch. */
  frameKey: string;
  /** Node to bring into view when it is selected. */
  focusNodeId: string | null;
  /** Dependency view re-lays out around the selection, so the whole result is framed. */
  frameWholeLayout: boolean;
  /** Width of the panel floating over the right edge (0 when nothing is open). */
  reserveRight: number;
}

interface FrameOnChangeArgs {
  layoutData: LayoutResult | null;
  frameKey: string;
  focusNodeId: string | null;
  frame: (animate: boolean) => boolean;
  framedKey: MutableRefObject<string | null>;
  focusedId: MutableRefObject<string | null>;
  userMoved: MutableRefObject<boolean>;
}

/**
 * Frames a new project or layout mode from scratch. The canvas mounts a moment after the
 * layout arrives, so keep trying until a frame lands before calling it done.
 */
const useFrameOnChange = ({
  layoutData,
  frameKey,
  focusNodeId,
  frame,
  framedKey,
  focusedId,
  userMoved,
}: FrameOnChangeArgs) => {
  useEffect(() => {
    if (!layoutData) return;
    const wholeKey = `${frameKey}|${focusNodeId ?? ''}`;
    if (framedKey.current === wholeKey) return;

    // Moving between nodes of the same project glides; the first frame snaps into place.
    const sameProject = framedKey.current?.startsWith(`${frameKey}|`) ?? false;
    let attempts = 0;
    let handle = 0;
    const tryFrame = () => {
      if (frame(sameProject)) {
        framedKey.current = wholeKey;
        focusedId.current = focusNodeId;
        userMoved.current = false;
      } else if (attempts < MAX_FIT_ATTEMPTS) {
        attempts += 1;
        handle = requestAnimationFrame(tryFrame);
      }
    };
    handle = requestAnimationFrame(tryFrame);
    return () => cancelAnimationFrame(handle);
  }, [layoutData, frameKey, focusNodeId, frame, framedKey, focusedId, userMoved]);
};

interface FollowResizeArgs {
  containerRef: MutableRefObject<HTMLDivElement | null>;
  frame: (animate: boolean) => boolean;
  framedKey: MutableRefObject<string | null>;
  userMoved: MutableRefObject<boolean>;
}

/**
 * The window and its side panels settle after first paint; follow them until the person
 * takes over the view.
 */
const useFollowResize = ({ containerRef, frame, framedKey, userMoved }: FollowResizeArgs) => {
  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (!userMoved.current && framedKey.current) frame(false);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [frame, containerRef, framedKey, userMoved]);
};

export const useGraphViewport = ({
  layoutData,
  frameKey,
  focusNodeId,
  frameWholeLayout,
  reserveRight,
}: UseGraphViewportOptions) => {
  const transformRef = useRef<ReactZoomPanPinchRef | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const framedKey = useRef<string | null>(null);
  const focusedId = useRef<string | null>(null);
  // Once the person zooms or pans themselves, resizing must not yank the view back.
  const userMoved = useRef(false);

  const measure = useCallback((): Size | null => {
    const rect = containerRef.current?.getBoundingClientRect();
    return rect && rect.width > 0 && rect.height > 0
      ? { width: rect.width, height: rect.height }
      : null;
  }, []);

  /** Applies a transform and reports whether the canvas actually accepted it. */
  const apply = useCallback((next: ViewTransform, animate: boolean): boolean => {
    const api = transformRef.current;
    if (!api) return false;
    api.setTransform(next.x, next.y, next.scale, animate ? ANIMATION_MS : 0, 'easeOut');
    return animate || Math.abs(api.instance.state.scale - next.scale) < 0.001;
  }, []);

  const fit = useCallback(
    (options: FitOptions = {}, animate = true): boolean => {
      const container = measure();
      if (!container || !layoutData) return false;
      return apply(
        computeFitTransform(
          container,
          { width: layoutData.width, height: layoutData.height },
          { reserveRight, ...options }
        ),
        animate
      );
    },
    [layoutData, measure, apply, reserveRight]
  );

  const focusNode = useCallback(
    (nodeId: string, animate: boolean): boolean => {
      const target = layoutData?.nodes.find((node) => node.id === nodeId);
      const container = measure();
      const api = transformRef.current;
      if (!target || !container || !api) return false;
      return apply(
        computeFocusTransform(container, target, api.instance.state.scale, reserveRight),
        animate
      );
    },
    [layoutData, measure, apply, reserveRight]
  );

  const zoomBy = useCallback(
    (factor: number) => {
      const api = transformRef.current;
      const container = measure();
      if (!api || !container) return;

      userMoved.current = true;
      apply(computeZoomTransform(container, api.instance.state, factor, reserveRight), true);
    },
    [measure, apply, reserveRight]
  );

  const fitByUser = useCallback(() => {
    userMoved.current = false;
    fit();
  }, [fit]);

  /** Frames what is relevant right now: the selected node in the hierarchy, else everything. */
  const frame = useCallback(
    (animate: boolean): boolean => {
      const strategy = chooseFrameStrategy(frameWholeLayout, focusNodeId);
      return strategy.kind === 'focus'
        ? focusNode(strategy.nodeId, animate)
        : fit(strategy.options, animate);
    },
    [frameWholeLayout, focusNodeId, focusNode, fit]
  );

  useFrameOnChange({ layoutData, frameKey, focusNodeId, frame, framedKey, focusedId, userMoved });
  useFollowResize({ containerRef, frame, framedKey, userMoved });

  const markUserMoved = useCallback(() => {
    userMoved.current = true;
  }, []);

  return { transformRef, containerRef, fit: fitByUser, zoomBy, markUserMoved };
};

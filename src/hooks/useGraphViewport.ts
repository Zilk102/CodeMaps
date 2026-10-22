import { useCallback, useEffect, useRef } from 'react';
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
const RIGHT_PANEL_WIDTH = 360;
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

interface UseGraphViewportOptions {
  layoutData: LayoutResult | null;
  /** Changes when a different project or layout mode should be framed from scratch. */
  frameKey: string;
  /** Node to bring into view when it is selected. */
  focusNodeId: string | null;
  /** Dependency view re-lays out around the selection, so the whole result is framed. */
  frameWholeLayout: boolean;
}

export const useGraphViewport = ({
  layoutData,
  frameKey,
  focusNodeId,
  frameWholeLayout,
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
          { reserveRight: RIGHT_PANEL_WIDTH, ...options }
        ),
        animate
      );
    },
    [layoutData, measure, apply]
  );

  const focusNode = useCallback(
    (nodeId: string, animate: boolean): boolean => {
      const target = layoutData?.nodes.find((node) => node.id === nodeId);
      const container = measure();
      const api = transformRef.current;
      if (!target || !container || !api) return false;
      return apply(
        computeFocusTransform(container, target, api.instance.state.scale, RIGHT_PANEL_WIDTH),
        animate
      );
    },
    [layoutData, measure, apply]
  );

  const zoomBy = useCallback(
    (factor: number) => {
      const api = transformRef.current;
      const container = measure();
      if (!api || !container) return;

      userMoved.current = true;
      const { scale, positionX, positionY } = api.instance.state;
      const next = clamp(scale * factor, MIN_SCALE, MAX_SCALE);
      const centreX = (container.width - RIGHT_PANEL_WIDTH) / 2;
      const centreY = container.height / 2;
      const ratio = next / scale;
      apply(
        {
          scale: next,
          x: centreX - (centreX - positionX) * ratio,
          y: centreY - (centreY - positionY) * ratio,
        },
        true
      );
    },
    [measure, apply]
  );

  const fitByUser = useCallback(() => {
    userMoved.current = false;
    fit();
  }, [fit]);

  /** Frames what is relevant right now: the selected node in the hierarchy, else everything. */
  const frame = useCallback(
    (animate: boolean): boolean => {
      if (!frameWholeLayout && focusNodeId) {
        return focusNode(focusNodeId, animate);
      }
      return fit(frameWholeLayout && focusNodeId ? { minScale: 0.2 } : {}, animate);
    },
    [frameWholeLayout, focusNodeId, focusNode, fit]
  );

  // Frame a new project or layout mode from scratch. The canvas mounts a moment after the
  // layout arrives, so keep trying until a frame lands before calling it done.
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
  }, [layoutData, frameKey, focusNodeId, frame]);

  // The window and its side panels settle after first paint; follow them until the person
  // takes over the view.
  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (!userMoved.current && framedKey.current) frame(false);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [frame]);

  const markUserMoved = useCallback(() => {
    userMoved.current = true;
  }, []);

  return { transformRef, containerRef, fit: fitByUser, zoomBy, markUserMoved };
};

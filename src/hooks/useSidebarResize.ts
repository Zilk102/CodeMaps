import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { useStore } from '../store/useStore';

const MIN_SIDEBAR_WIDTH = 200;
const MOBILE_BREAKPOINT = 768;

function getMaxAllowedWidth() {
  const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
  return isMobile ? window.innerWidth * 0.8 : window.innerWidth - 300;
}

interface SidebarListenerDeps {
  isDragging: MutableRefObject<boolean>;
  setIsDraggingState: (dragging: boolean) => void;
  setIsMobile: (mobile: boolean) => void;
  setSidebarWidth: (width: number) => void;
}

/** Wires the drag and window-resize listeners and returns the function that removes them. */
function attachSidebarListeners(deps: SidebarListenerDeps) {
  const { isDragging, setIsDraggingState, setIsMobile, setSidebarWidth } = deps;

  const handleMouseMove = (event: MouseEvent) => {
    if (!isDragging.current) return;
    event.preventDefault();
    setSidebarWidth(Math.max(MIN_SIDEBAR_WIDTH, Math.min(event.clientX, getMaxAllowedWidth())));
  };

  const handleMouseUp = () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    setIsDraggingState(false);
    document.body.style.cursor = 'default';
  };

  const handleResize = () => {
    setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
    setSidebarWidth(Math.min(useStore.getState().sidebarWidth, getMaxAllowedWidth()));
  };

  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
  window.addEventListener('resize', handleResize);

  return () => {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    window.removeEventListener('resize', handleResize);
  };
}

export function useSidebarResize(setSidebarWidth: (width: number) => void) {
  const [isDraggingState, setIsDraggingState] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= MOBILE_BREAKPOINT);
  const isDragging = useRef(false);

  useEffect(
    () => attachSidebarListeners({ isDragging, setIsDraggingState, setIsMobile, setSidebarWidth }),
    [setSidebarWidth]
  );

  const startSidebarDrag = () => {
    isDragging.current = true;
    setIsDraggingState(true);
    document.body.style.cursor = 'col-resize';
  };

  return {
    isDraggingState,
    startSidebarDrag,
    sidebarViewportState: {
      isMobile,
      maxWidth: isMobile ? '80vw' : '50vw',
    },
  };
}

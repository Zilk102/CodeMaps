import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore';

const MIN_SIDEBAR_WIDTH = 200;
const MOBILE_BREAKPOINT = 768;

function getMaxAllowedWidth() {
  const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
  return isMobile ? window.innerWidth * 0.8 : window.innerWidth - 300;
}

export function useSidebarResize(setSidebarWidth: (width: number) => void) {
  const [isDraggingState, setIsDraggingState] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= MOBILE_BREAKPOINT);
  const isDragging = useRef(false);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isDragging.current) {
        return;
      }

      event.preventDefault();
      const newWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(event.clientX, getMaxAllowedWidth()));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (!isDragging.current) {
        return;
      }

      isDragging.current = false;
      setIsDraggingState(false);
      document.body.style.cursor = 'default';
    };

    const handleResize = () => {
      setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
      const currentWidth = useStore.getState().sidebarWidth;
      setSidebarWidth(Math.min(currentWidth, getMaxAllowedWidth()));
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('resize', handleResize);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('resize', handleResize);
    };
  }, [setSidebarWidth]);

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

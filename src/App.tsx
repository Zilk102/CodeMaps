import React, { Suspense, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const FileTree = React.lazy(() =>
  import('./components/FileTree').then((m) => ({ default: m.FileTree }))
);
const GraphView = React.lazy(() =>
  import('./components/GraphView').then((m) => ({ default: m.GraphView }))
);
const RecentProjects = React.lazy(() =>
  import('./components/RecentProjects').then((m) => ({ default: m.RecentProjects }))
);
const McpSettingsModal = React.lazy(() =>
  import('./components/McpSettingsModal').then((m) => ({ default: m.McpSettingsModal }))
);
const UpdateNotification = React.lazy(() =>
  import('./components/UpdateNotification')
);
const DragDropZone = React.lazy(() =>
  import('./components/DragDropZone').then((m) => ({ default: m.default }))
);
const ToolsPanel = React.lazy(() =>
  import('./components/ToolsPanel').then((m) => ({ default: m.ToolsPanel }))
);

import TitleBar from './components/TitleBar';
import LanguageSwitcher from './components/LanguageSwitcher';
import PersistenceStatus from './components/PersistenceStatus';
import ErrorBoundary from './components/ErrorBoundary';
import { useUIStore, useGraphStore, useConnectionStore } from './store/useStore';
import { useProjectDrop } from './hooks/useProjectDrop';
import { useSidebarResize } from './hooks/useSidebarResize';

const LazyFallback: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="w-full h-full bg-(--bg0) flex items-center justify-center text-(--t2)">
      {t('app.loading')}
    </div>
  );
};

const App: React.FC = () => {
  const { t } = useTranslation();
  const { sidebarWidth, setSidebarWidth, isToolsPanelOpen, parsingProgress } = useUIStore();
  const { graphData } = useGraphStore();
  const { initializeWatcher, initializeWebSocket, fetchGraph } = useConnectionStore();
  const { isDraggingState, startSidebarDrag, sidebarViewportState } = useSidebarResize(
    setSidebarWidth
  );
  const { dragOver, handleDragOver, handleDragEnter, handleDragLeave, handleDrop } =
    useProjectDrop(fetchGraph);

  useEffect(() => {
    initializeWatcher();
    initializeWebSocket();
  }, [initializeWatcher, initializeWebSocket]);

  return (
    <ErrorBoundary>
      <div
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="flex flex-col w-screen h-screen overflow-hidden bg-(--bg0)"
      >
        <TitleBar />
        <Suspense fallback={<LazyFallback />}>
          <UpdateNotification />
        </Suspense>
        
        <div className="flex flex-1 overflow-hidden relative">
          {/* Left Panel */}
          <div
            className="flex flex-col h-full bg-(--bg1) border-r border-(--border) transition-[width] duration-200 ease-in-out"
            style={{
              width: sidebarWidth,
              minWidth: 200,
              maxWidth: sidebarViewportState.maxWidth,
              position: sidebarViewportState.isMobile ? 'absolute' : 'relative',
              zIndex: sidebarViewportState.isMobile ? 20 : 1,
              ...(isDraggingState ? { transition: 'none' } : {}),
            }}
          >
          <Suspense fallback={<LazyFallback />}>
            <FileTree />
          </Suspense>
        </div>

        {/* Splitter (Drag Handle) */}
        <div
          onMouseDown={startSidebarDrag}
          className="absolute h-full w-2 cursor-col-resize bg-transparent hover:bg-(--acc) hover:opacity-30 transition-all"
          style={{
            zIndex: sidebarViewportState.isMobile ? 21 : 10,
            left: sidebarWidth - 4,
          }}
        />

        {/* Main Area */}
        <div className="flex-1 relative min-w-0 bg-(--bg0)">
          <Suspense fallback={<LazyFallback />}>
            {graphData ? <GraphView /> : <RecentProjects />}
          </Suspense>
        </div>

        {/* Right Panel (Tools) */}
        {graphData && isToolsPanelOpen && (
          <Suspense fallback={<LazyFallback />}>
            <ToolsPanel projectPath={graphData.projectRoot} />
          </Suspense>
        )}
      </div>

      {/* Drag & Drop Overlay */}
      <Suspense fallback={null}>
        <DragDropZone isActive={dragOver} />
      </Suspense>

      {/* Parsing Progress */}
      {parsingProgress && (
        <div
          className="absolute bottom-5 right-5 bg-(--bg1) p-4 rounded-lg border border-(--border) shadow-[0_4px_12px_rgba(0,0,0,0.1)] z-1000 flex flex-col gap-2 min-w-[250px]"
        >
          <div className="flex justify-between items-center">
            <span className="font-bold">
              {t(`indexing.status.${parsingProgress.status}`, { defaultValue: 'Indexing...' })}
            </span>
            <span>{Math.round((parsingProgress.current / parsingProgress.total) * 100)}%</span>
          </div>
          <div className="w-full h-1 bg-(--bg2) rounded-sm overflow-hidden">
            <div
              className="h-full bg-(--acc) transition-[width] duration-300 ease-in-out"
              style={{
                width: `${(parsingProgress.current / parsingProgress.total) * 100}%`,
              }}
            />
          </div>
          {parsingProgress.filename && (
            <div
              className="text-xs text-(--t2) whitespace-nowrap overflow-hidden text-ellipsis"
              title={parsingProgress.filename}
            >
              {parsingProgress.filename}
            </div>
          )}
        </div>
      )}

      <Suspense fallback={<LazyFallback />}>
        <McpSettingsModal />
      </Suspense>

      <PersistenceStatus />
      
      <LanguageSwitcher />
    </div>
    </ErrorBoundary>
  );
};

export default App;

import React, { Suspense } from 'react';

const GraphView = React.lazy(() =>
  import('./components/GraphView').then((m) => ({ default: m.GraphView }))
);
const RecentProjects = React.lazy(() =>
  import('./components/RecentProjects').then((m) => ({ default: m.RecentProjects }))
);
const McpSettingsModal = React.lazy(() =>
  import('./components/McpSettingsModal').then((m) => ({ default: m.McpSettingsModal }))
);
const UpdateNotification = React.lazy(() => import('./components/UpdateNotification'));
const DragDropZone = React.lazy(() =>
  import('./components/DragDropZone').then((m) => ({ default: m.default }))
);
const ToolsPanel = React.lazy(() =>
  import('./components/ToolsPanel').then((m) => ({ default: m.ToolsPanel }))
);

import TitleBar from './components/TitleBar';
import ErrorBoundary from './components/ErrorBoundary';
import { AppSidebar, LazyFallback, ParsingProgressToast } from './components/AppParts';
import { useUIStore, useGraphStore } from './store/useStore';
import { useRealtimeConnection } from './hooks/useRealtimeConnection';
import { useProjectDrop } from './hooks/useProjectDrop';
import { useSidebarResize } from './hooks/useSidebarResize';

const AppWorkspace: React.FC = () => {
  const { sidebarWidth, setSidebarWidth, isToolsPanelOpen } = useUIStore();
  const { graphData } = useGraphStore();
  const { isDraggingState, startSidebarDrag, sidebarViewportState } =
    useSidebarResize(setSidebarWidth);
  const showSidebar = Boolean(graphData);

  return (
    <div className="flex flex-1 overflow-hidden relative">
      {showSidebar && (
        <AppSidebar
          width={sidebarWidth}
          isDragging={isDraggingState}
          viewport={sidebarViewportState}
          onDragStart={startSidebarDrag}
        />
      )}

      <div className="flex-1 relative min-w-0 bg-(--bg0)">
        <Suspense fallback={<LazyFallback />}>
          {graphData ? <GraphView /> : <RecentProjects />}
        </Suspense>
      </div>

      {graphData && isToolsPanelOpen && (
        <Suspense fallback={<LazyFallback />}>
          <ToolsPanel projectPath={graphData.projectRoot} />
        </Suspense>
      )}
    </div>
  );
};

const App: React.FC = () => {
  const { parsingProgress } = useUIStore();
  const { fetchGraph } = useRealtimeConnection();
  const { dragOver, handleDragOver, handleDragEnter, handleDragLeave, handleDrop } =
    useProjectDrop(fetchGraph);

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

        <AppWorkspace />

        {/* Drag & Drop Overlay */}
        <Suspense fallback={null}>
          <DragDropZone isActive={dragOver} />
        </Suspense>

        {/* Parsing Progress */}
        {parsingProgress && <ParsingProgressToast progress={parsingProgress} />}

        <Suspense fallback={<LazyFallback />}>
          <McpSettingsModal />
        </Suspense>
      </div>
    </ErrorBoundary>
  );
};

export default App;

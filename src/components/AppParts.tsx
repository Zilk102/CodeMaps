import React, { Suspense } from 'react';
import { useTranslation } from 'react-i18next';

const FileTree = React.lazy(() => import('./FileTree').then((m) => ({ default: m.FileTree })));

export const LazyFallback: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className="w-full h-full bg-(--bg0) flex items-center justify-center text-(--t2)">
      {t('app.loading')}
    </div>
  );
};

/** Share of the indexing run that is done, as a 0-100 number. */
export const progressPercent = (current: number, total: number): number => (current / total) * 100;

export interface SidebarViewportState {
  maxWidth: number | string;
  isMobile: boolean;
}

export const AppSidebar: React.FC<{
  width: number;
  isDragging: boolean;
  viewport: SidebarViewportState;
  onDragStart: React.MouseEventHandler<HTMLDivElement>;
}> = ({ width, isDragging, viewport, onDragStart }) => (
  <>
    <div
      className="flex flex-col h-full bg-(--bg1) border-r border-(--border) transition-[width] duration-200 ease-in-out"
      style={{
        width,
        minWidth: 200,
        maxWidth: viewport.maxWidth,
        position: viewport.isMobile ? 'absolute' : 'relative',
        zIndex: viewport.isMobile ? 20 : 1,
        ...(isDragging ? { transition: 'none' } : {}),
      }}
    >
      <Suspense fallback={<LazyFallback />}>
        <FileTree />
      </Suspense>
    </div>

    <div
      onMouseDown={onDragStart}
      className="absolute h-full w-2 cursor-col-resize bg-transparent hover:bg-(--acc) hover:opacity-30 transition-all"
      style={{
        zIndex: viewport.isMobile ? 21 : 10,
        left: width - 4,
      }}
    />
  </>
);

export const ParsingProgressToast: React.FC<{
  progress: { status: string; current: number; total: number; filename: string };
}> = ({ progress }) => {
  const { t } = useTranslation();
  return (
    <div className="absolute bottom-5 right-5 bg-(--bg1) p-4 rounded-lg border border-(--border) shadow-[0_4px_12px_rgba(0,0,0,0.1)] z-1000 flex flex-col gap-2 min-w-[250px]">
      <div className="flex justify-between items-center">
        <span className="font-bold">
          {t(`indexing.status.${progress.status}`, { defaultValue: 'Indexing...' })}
        </span>
        <span>{Math.round(progressPercent(progress.current, progress.total))}%</span>
      </div>
      <div className="w-full h-1 bg-(--bg2) rounded-sm overflow-hidden">
        <div
          className="h-full bg-(--acc) transition-[width] duration-300 ease-in-out"
          style={{
            width: `${progressPercent(progress.current, progress.total)}%`,
          }}
        />
      </div>
      {progress.filename && (
        <div
          className="text-xs text-(--t2) whitespace-nowrap overflow-hidden text-ellipsis"
          title={progress.filename}
        >
          {progress.filename}
        </div>
      )}
    </div>
  );
};

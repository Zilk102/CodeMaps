// Hook that lets the user drop a folder or file on the window to open its project.
import { useCallback, useRef, useState, type DragEvent } from 'react';

type FetchGraph = (path: string) => Promise<unknown>;

type FileSystemEntryLike = FileSystemEntry & {
  fullPath?: string;
};

type DataTransferItemWithEntry = DataTransferItem & {
  getAsEntry?: () => FileSystemEntryLike | null;
};

const entryOf = (item: DataTransferItem) =>
  item.webkitGetAsEntry?.() || (item as DataTransferItemWithEntry).getAsEntry?.() || null;

const pathOfFile = (file: File | null) =>
  file && 'path' in file ? (file as File & { path: string }).path : null;

const parentDirectory = (filePath: string) =>
  filePath.substring(0, filePath.lastIndexOf('/')) ||
  filePath.substring(0, filePath.lastIndexOf('\\'));

async function getPathFromItem(item: DataTransferItem) {
  const entry = entryOf(item);
  const filePath = entry ? pathOfFile(item.getAsFile()) : null;
  if (!entry || !filePath) return null;
  return entry.isDirectory ? filePath : parentDirectory(filePath);
}

/** Opens the first dropped item that resolves to a path; later items are ignored. */
async function openFirstDroppedPath(items: DataTransferItemList, fetchGraph: FetchGraph) {
  for (let index = 0; index < items.length; index += 1) {
    const path = await getPathFromItem(items[index]);
    if (path) {
      await fetchGraph(path);
      return;
    }
  }
}

const swallow = (event: DragEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

/**
 * Tracks drag-over state with an enter/leave counter, so nested elements do not make it flicker,
 * and on drop opens the first item that resolves to a path (a file opens its parent folder).
 * Returns the four drag handlers and dragOver.
 */
export function useProjectDrop(fetchGraph: FetchGraph) {
  const [dragOver, setDragOver] = useState(false);
  const dragCounter = useRef(0);

  const handleDragOver = useCallback((event: DragEvent) => {
    swallow(event);
  }, []);

  const handleDragEnter = useCallback((event: DragEvent) => {
    swallow(event);
    dragCounter.current += 1;
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((event: DragEvent) => {
    swallow(event);
    dragCounter.current -= 1;
    if (dragCounter.current === 0) {
      setDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent) => {
      swallow(event);
      dragCounter.current = 0;
      setDragOver(false);

      const items = event.dataTransfer.items;
      if (!items || items.length === 0) {
        return;
      }

      openFirstDroppedPath(items, fetchGraph).catch(console.error);
    },
    [fetchGraph]
  );

  return {
    dragOver,
    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
  };
}

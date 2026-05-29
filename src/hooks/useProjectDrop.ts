import { useCallback, useRef, useState } from 'react';

type FetchGraph = (path: string) => Promise<unknown>;

type FileSystemEntryLike = FileSystemEntry & {
  fullPath?: string;
};

type DataTransferItemWithEntry = DataTransferItem & {
  getAsEntry?: () => FileSystemEntryLike | null;
};

async function getPathFromItem(item: DataTransferItem) {
  const itemWithEntry = item as DataTransferItemWithEntry;
  const entry = item.webkitGetAsEntry?.() || itemWithEntry.getAsEntry?.() || null;
  if (!entry) {
    return null;
  }

  if (entry.isDirectory) {
    const file = item.getAsFile();
    if (file && 'path' in file) {
      return (file as File & { path: string }).path;
    }
    return null;
  }

  const file = item.getAsFile();
  if (file && 'path' in file) {
    const filePath = (file as File & { path: string }).path;
    return filePath.substring(0, filePath.lastIndexOf('/')) || filePath.substring(0, filePath.lastIndexOf('\\'));
  }

  return null;
}

export function useProjectDrop(fetchGraph: FetchGraph) {
  const [dragOver, setDragOver] = useState(false);
  const dragCounter = useRef(0);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleDragEnter = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounter.current += 1;
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) {
      setDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      dragCounter.current = 0;
      setDragOver(false);

      const items = event.dataTransfer.items;
      if (!items || items.length === 0) {
        return;
      }

      const processDrop = async () => {
        for (let index = 0; index < items.length; index += 1) {
          const path = await getPathFromItem(items[index]);
          if (path) {
            await fetchGraph(path);
            return;
          }
        }
      };

      processDrop().catch(console.error);
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

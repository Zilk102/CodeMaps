export function getIDBStorage(dbName: string, storeName: string) {
  // Fallback to 'readonly' and 'readwrite' string literals if IDBTransactionMode is not available globally
  type TransactionMode = 'readonly' | 'readwrite';

  let dbInstance: IDBDatabase | null = null;

  const initDB = (): Promise<IDBDatabase> => {
    if (dbInstance) return Promise.resolve(dbInstance);
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        dbInstance = request.result;
        resolve(dbInstance);
      };
      request.onupgradeneeded = () => {
        request.result.createObjectStore(storeName);
      };
    });
  };

  const getStore = async (mode: TransactionMode) => {
    const db = await initDB();
    return db.transaction(storeName, mode).objectStore(storeName);
  };

  // Saved UI state is a convenience: when IndexedDB is unavailable or fails (locked profile,
  // exhausted quota) the app must keep working instead of raising unhandled rejections.
  const tolerant = async <T>(operation: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await operation();
    } catch (error) {
      console.warn(`[idb-storage] ${dbName}/${storeName} unavailable:`, error);
      return fallback;
    }
  };

  return {
    getItem: (name: string): Promise<string | null> =>
      tolerant(async () => {
        const store = await getStore('readonly');
        return new Promise<string | null>((resolve, reject) => {
          const request = store.get(name);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result ?? null);
        });
      }, null),
    setItem: (name: string, value: string): Promise<void> =>
      tolerant(async () => {
        const store = await getStore('readwrite');
        return new Promise<void>((resolve, reject) => {
          const request = store.put(value, name);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve();
        });
      }, undefined),
    removeItem: (name: string): Promise<void> =>
      tolerant(async () => {
        const store = await getStore('readwrite');
        return new Promise<void>((resolve, reject) => {
          const request = store.delete(name);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve();
        });
      }, undefined),
  };
}

// IndexedDB-backed string storage in the shape zustand's persist middleware expects.

type TransactionMode = 'readonly' | 'readwrite';

const openDatabase = (dbName: string, storeName: string): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(storeName);
    };
  });

const requestToPromise = <T>(request: IDBRequest, map: (result: unknown) => T): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(map(request.result));
  });

/**
 * Creates a getItem/setItem/removeItem storage on one IndexedDB object store, opened lazily.
 * Failures are logged and swallowed (reads give null) so unavailable storage never breaks the app.
 */
export function getIDBStorage(dbName: string, storeName: string) {
  let dbInstance: IDBDatabase | null = null;

  const initDB = async (): Promise<IDBDatabase> => {
    if (!dbInstance) dbInstance = await openDatabase(dbName, storeName);
    return dbInstance;
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
        return requestToPromise(
          store.get(name),
          (result) => (result as string | undefined) ?? null
        );
      }, null),
    setItem: (name: string, value: string): Promise<void> =>
      tolerant(async () => {
        const store = await getStore('readwrite');
        return requestToPromise(store.put(value, name), () => undefined);
      }, undefined),
    removeItem: (name: string): Promise<void> =>
      tolerant(async () => {
        const store = await getStore('readwrite');
        return requestToPromise(store.delete(name), () => undefined);
      }, undefined),
  };
}

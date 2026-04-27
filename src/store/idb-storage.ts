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

  return {
    getItem: async (name: string): Promise<string | null> => {
      const store = await getStore('readonly');
      return new Promise((resolve, reject) => {
        const request = store.get(name);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result ?? null);
      });
    },
    setItem: async (name: string, value: string): Promise<void> => {
      const store = await getStore('readwrite');
      return new Promise((resolve, reject) => {
        const request = store.put(value, name);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    },
    removeItem: async (name: string): Promise<void> => {
      const store = await getStore('readwrite');
      return new Promise((resolve, reject) => {
        const request = store.delete(name);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    },
  };
}

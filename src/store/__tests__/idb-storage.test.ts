import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';
import { getIDBStorage } from '../idb-storage';

// Replace global indexedDB with fake one
global.indexedDB = indexedDB;
global.IDBKeyRange = IDBKeyRange;

describe('getIDBStorage', () => {
  const dbName = 'testDB';
  const storeName = 'testStore';
  let storage: ReturnType<typeof getIDBStorage>;

  beforeEach(() => {
    storage = getIDBStorage(dbName, storeName);
  });

  afterEach(async () => {
    // Just clear the object store
    await storage.setItem('test-key', '');
    await storage.removeItem('test-key');
    await storage.setItem('non-existent', '');
    await storage.removeItem('non-existent');
  });

  it('should initialize and return null for non-existent item', async () => {
    const value = await storage.getItem('non-existent');
    expect(value).toBeNull();
  });

  it('should set and get an item correctly', async () => {
    await storage.setItem('test-key', 'test-value');
    const value = await storage.getItem('test-key');
    expect(value).toBe('test-value');
  });

  it('should update an existing item correctly', async () => {
    await storage.setItem('test-key', 'initial-value');
    let value = await storage.getItem('test-key');
    expect(value).toBe('initial-value');

    await storage.setItem('test-key', 'updated-value');
    value = await storage.getItem('test-key');
    expect(value).toBe('updated-value');
  });

  it('should remove an item correctly', async () => {
    await storage.setItem('test-key', 'test-value');
    await storage.removeItem('test-key');
    const value = await storage.getItem('test-key');
    expect(value).toBeNull();
  });
});

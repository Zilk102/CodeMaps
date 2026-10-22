import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const behaviour = vi.hoisted(() => ({
  failures: [] as Error[],
  opened: [] as string[],
}));

vi.mock('kuzu', () => {
  class Database {
    constructor(public readonly dbPath: string) {}
    async init() {
      behaviour.opened.push(this.dbPath);
      const failure = behaviour.failures.shift();
      if (failure) throw failure;
    }
    async close() {}
  }
  class Connection {
    constructor(public readonly db: Database) {}
    async init() {}
    async close() {}
  }
  return { Database, Connection };
});

import { KuzuConnectionManager } from '../KuzuConnectionManager';

describe('KuzuConnectionManager recovery', () => {
  let directory = '';
  let dbPath = '';

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codemaps-kuzu-mgr-'));
    dbPath = path.join(directory, 'graph.db');
    fs.writeFileSync(dbPath, 'damaged');
    fs.writeFileSync(`${dbPath}.wal`, 'duplicate rows');
    behaviour.failures = [];
    behaviour.opened = [];
  });

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('replaces a database that cannot be opened because it is damaged', async () => {
    behaviour.failures = [
      new Error('Runtime exception: Found duplicated primary key value X, which violates it.'),
    ];

    const { conn } = await KuzuConnectionManager.getConnection(dbPath);

    expect(conn).toBeDefined();
    expect(behaviour.opened).toHaveLength(2);
    expect(fs.existsSync(dbPath)).toBe(false);
    expect(fs.readdirSync(directory).some((name) => name.includes('.corrupt-'))).toBe(true);
    await KuzuConnectionManager.releaseConnection(dbPath);
  });

  it('does not touch the files when another process holds the lock', async () => {
    behaviour.failures = [new Error('IO exception: Could not set lock on file : graph.db')];

    await expect(KuzuConnectionManager.getConnection(dbPath)).rejects.toThrow(/Could not set lock/);

    expect(behaviour.opened).toHaveLength(1);
    expect(fs.readFileSync(dbPath, 'utf8')).toBe('damaged');
    expect(fs.existsSync(`${dbPath}.wal`)).toBe(true);
  });

  it('gives up if a fresh database fails as well', async () => {
    behaviour.failures = [
      new Error('Found duplicated primary key value A'),
      new Error('Found duplicated primary key value B'),
    ];

    await expect(KuzuConnectionManager.getConnection(dbPath)).rejects.toThrow(/value B/);
    expect(behaviour.opened).toHaveLength(2);
  });
});

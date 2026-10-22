import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { isRecoverableCorruption, quarantineDatabaseFiles } from '../kuzuRecovery';

describe('isRecoverableCorruption', () => {
  it('recognises damage that makes the cache unusable', () => {
    expect(
      isRecoverableCorruption(
        new Error(
          'Runtime exception: Found duplicated primary key value D:/p/a.ts#X, which violates the uniqueness constraint of the primary key column.'
        )
      )
    ).toBe(true);
    expect(
      isRecoverableCorruption(new Error('Corrupted wal file. Read out invalid WAL record'))
    ).toBe(true);
    expect(isRecoverableCorruption('checksum mismatch')).toBe(true);
  });

  it('never treats a lock held by another process as damage', () => {
    expect(
      isRecoverableCorruption(
        new Error('IO exception: Could not set lock on file : D:\\p\\.codemaps\\graph.db')
      )
    ).toBe(false);
  });

  it('leaves unrelated errors alone', () => {
    expect(isRecoverableCorruption(new Error('Kuzu background worker timeout'))).toBe(false);
    expect(isRecoverableCorruption(new Error('out of memory'))).toBe(false);
  });
});

describe('quarantineDatabaseFiles', () => {
  let directory: string | null = null;

  afterEach(() => {
    if (directory) fs.rmSync(directory, { recursive: true, force: true });
    directory = null;
  });

  it('moves the database and its log aside so a fresh one can be created', () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codemaps-kuzu-'));
    const db = path.join(directory, 'graph.db');
    fs.writeFileSync(db, 'data');
    fs.writeFileSync(`${db}.wal`, 'log');

    const moved = quarantineDatabaseFiles(db, 111);

    expect(moved).toEqual([db, `${db}.wal`]);
    expect(fs.existsSync(db)).toBe(false);
    expect(fs.existsSync(`${db}.wal`)).toBe(false);
    expect(fs.readFileSync(`${db}.corrupt-111`, 'utf8')).toBe('data');
    expect(fs.readFileSync(`${db}.corrupt-111.wal`, 'utf8')).toBe('log');
  });

  it('keeps only the latest quarantined set', () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codemaps-kuzu-'));
    const db = path.join(directory, 'graph.db');
    fs.writeFileSync(db, 'first');
    quarantineDatabaseFiles(db, 1);
    fs.writeFileSync(db, 'second');
    quarantineDatabaseFiles(db, 2);

    const leftovers = fs.readdirSync(directory).sort();
    expect(leftovers).toEqual(['graph.db.corrupt-2']);
  });

  it('does nothing when there is no database yet', () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codemaps-kuzu-'));
    expect(quarantineDatabaseFiles(path.join(directory, 'graph.db'))).toEqual([]);
  });
});

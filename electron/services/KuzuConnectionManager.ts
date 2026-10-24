/** Shares one Kuzu database and connection per database path inside a process, with recovery from a corrupted database. */

import { Connection, Database } from 'kuzu';
import { isRecoverableCorruption, quarantineDatabaseFiles } from './KuzuRecovery';

/** An open database and connection plus the number of users currently holding them. */
export interface SharedKuzuState {
  db: Database;
  conn: Connection;
  refCount: number;
}

/** Reference-counted registry of open Kuzu connections, keyed by database path. */
export class KuzuConnectionManager {
  private static sharedConnections = new Map<string, SharedKuzuState>();

  /** Returns the shared connection for `dbPath`, opening the database on first use and counting the caller as a user. A damaged database is moved aside and recreated empty, since it only caches the graph. Pair with `releaseConnection`. */
  static async getConnection(dbPath: string): Promise<{ db: Database; conn: Connection }> {
    const sharedState = this.sharedConnections.get(dbPath);
    if (sharedState) {
      sharedState.refCount += 1;
      return { db: sharedState.db, conn: sharedState.conn };
    }

    try {
      return await this.open(dbPath);
    } catch (error: unknown) {
      if (!isRecoverableCorruption(error)) throw error;

      // The database is only a cache of the analysed graph, so a damaged one is replaced.
      const moved = quarantineDatabaseFiles(dbPath);
      console.warn(
        `[KuzuDB] Database at ${dbPath} was damaged (${error instanceof Error ? error.message : String(error)}); ` +
          `moved ${moved.length} file(s) aside and starting fresh`
      );
      return await this.open(dbPath);
    }
  }

  /** Opens the database and a connection and registers them with one user. Closes the database again if setup fails. */
  private static async open(dbPath: string): Promise<{ db: Database; conn: Connection }> {
    const db = new Database(dbPath);
    try {
      await db.init();
      const conn = new Connection(db);
      await conn.init();

      this.sharedConnections.set(dbPath, { db, conn, refCount: 1 });
      return { db, conn };
    } catch (error: unknown) {
      await db.close().catch(() => undefined);
      throw error;
    }
  }

  /** Drops one user of the connection and closes it when the last user is gone. On Windows with Node 22 or newer connections stay open, because closing them there is unreliable. */
  static async releaseConnection(dbPath: string): Promise<void> {
    const sharedState = this.sharedConnections.get(dbPath);
    if (!sharedState) return;

    sharedState.refCount = Math.max(0, sharedState.refCount - 1);

    if (sharedState.refCount === 0 && !this.shouldKeepConnectionOpen()) {
      await sharedState.db.close();
      await sharedState.conn.close();
      this.sharedConnections.delete(dbPath);
    }
  }

  private static shouldKeepConnectionOpen(): boolean {
    const nodeMajor = Number.parseInt(process.versions.node.split('.')[0] || '0', 10);
    return process.platform === 'win32' && nodeMajor >= 22;
  }
}

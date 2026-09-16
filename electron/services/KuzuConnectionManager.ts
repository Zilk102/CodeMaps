import { Connection, Database } from 'kuzu';

export interface SharedKuzuState {
  db: Database;
  conn: Connection;
  refCount: number;
}

export class KuzuConnectionManager {
  private static sharedConnections = new Map<string, SharedKuzuState>();

  static async getConnection(dbPath: string): Promise<{ db: Database; conn: Connection }> {
    const sharedState = this.sharedConnections.get(dbPath);
    if (sharedState) {
      sharedState.refCount += 1;
      return { db: sharedState.db, conn: sharedState.conn };
    }

    const db = new Database(dbPath);
    await db.init();
    const conn = new Connection(db);
    await conn.init();

    this.sharedConnections.set(dbPath, {
      db,
      conn,
      refCount: 1,
    });

    return { db, conn };
  }

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

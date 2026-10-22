import * as fs from 'fs';
import * as path from 'path';

/**
 * The Kuzu database is a derived cache: the graph is rebuilt from the sources on every
 * analysis. When the file cannot be opened because its contents are damaged (for example a
 * write-ahead log holding duplicate rows left by overlapping saves), throwing it away is the
 * only repair, and it is safe.
 *
 * A lock held by another process is NOT corruption and must never trigger a reset.
 */
const CORRUPTION_PATTERNS = [
  /duplicated primary key/i,
  /corrupt/i,
  /checksum/i,
  /wal (record|file)|invalid wal|wal.*(replay|read)/i,
  /unexpected end of (file|data)/i,
  /magic bytes/i,
];

export const isRecoverableCorruption = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  if (/could not set lock|lock on file/i.test(message)) return false;
  return CORRUPTION_PATTERNS.some((pattern) => pattern.test(message));
};

/**
 * Replaying a damaged write-ahead log can take the native library down instead of throwing, so
 * the worker process dies at start-up. Windows reports 0xC0000005 (access violation) or
 * 0xC0000409 (stack buffer overrun), POSIX reports SIGSEGV or SIGABRT.
 */
const NATIVE_CRASH_EXIT =
  /exited with code (3221225477|3221226505|139|134)|exited with signal (SIGSEGV|SIGABRT|SIGBUS)/;

export const isWorkerCrash = (error: unknown): boolean =>
  NATIVE_CRASH_EXIT.test(error instanceof Error ? error.message : String(error));

const SIDECAR_SUFFIXES = ['', '.wal', '.shadow', '.lock'];
const QUARANTINE_MARKER = '.corrupt-';

/**
 * Moves the database files aside (keeping only the most recent set for inspection) so a fresh
 * database can be created at the same path. Returns the files that were moved.
 */
export const quarantineDatabaseFiles = (dbPath: string, now: number = Date.now()): string[] => {
  const directory = path.dirname(dbPath);
  const baseName = path.basename(dbPath);

  // Older quarantined copies would only waste disk space (they can be tens of megabytes).
  try {
    for (const entry of fs.readdirSync(directory)) {
      if (entry.startsWith(`${baseName}${QUARANTINE_MARKER}`)) {
        fs.rmSync(path.join(directory, entry), { recursive: true, force: true });
      }
    }
  } catch {
    // Nothing to clean up when the directory is unreadable; the move below will report it.
  }

  const moved: string[] = [];
  for (const suffix of SIDECAR_SUFFIXES) {
    const source = `${dbPath}${suffix}`;
    if (!fs.existsSync(source)) continue;
    fs.renameSync(source, `${dbPath}${QUARANTINE_MARKER}${now}${suffix}`);
    moved.push(source);
  }
  return moved;
};

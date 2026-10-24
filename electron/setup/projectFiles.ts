/**
 * The only way `setup_project` touches the disk. Every path is checked to stay inside the project
 * root, also through symbolic links, so a crafted `projectPath`, agent list or pre-planted link
 * can never make CodeMaps write outside the project.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/** Thrown when a path would leave the project root; the message says which path and why. */
export class UnsafePathError extends Error {}

const isWindows = process.platform === 'win32';

const comparable = (value: string): string => (isWindows ? value.toLowerCase() : value);

const isInside = (parent: string, child: string): boolean => {
  const a = comparable(parent);
  const b = comparable(child);
  return b === a || b.startsWith(a.endsWith(path.sep) ? a : `${a}${path.sep}`);
};

/** The nearest ancestor of `target` (or `target` itself) that exists, resolved through symlinks. */
const realNearestExisting = (target: string): string => {
  let current = target;
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return fs.realpathSync(current);
};

/** Rejects absolute paths, `..` segments and NUL bytes before any file system access. */
const assertRelativeAndClean = (relativePath: string): void => {
  if (!relativePath || relativePath.includes('\0')) {
    throw new UnsafePathError(`Unsafe path: ${JSON.stringify(relativePath)}`);
  }
  const segments = relativePath.split(/[\\/]/);
  if (path.isAbsolute(relativePath) || /^[a-zA-Z]:/.test(relativePath) || segments.includes('..')) {
    throw new UnsafePathError(`Path escapes the project root: ${relativePath}`);
  }
};

/**
 * Absolute path of `relativePath` inside `root`. Throws `UnsafePathError` for an absolute path,
 * a `..` segment, or when the path (or any existing folder on the way, or the file itself) is a
 * symbolic link that points outside the project.
 */
export const resolveInsideRoot = (root: string, relativePath: string): string => {
  assertRelativeAndClean(relativePath);
  const resolved = path.resolve(root, relativePath);
  if (!isInside(path.resolve(root), resolved)) {
    throw new UnsafePathError(`Path escapes the project root: ${relativePath}`);
  }
  if (!isInside(fs.realpathSync(root), realNearestExisting(resolved))) {
    throw new UnsafePathError(`Path leaves the project through a symbolic link: ${relativePath}`);
  }
  return resolved;
};

/** The text of a file, or null when it does not exist. */
export const readTextIfExists = (file: string): string | null => {
  try {
    return fs.readFileSync(file, 'utf-8');
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return null;
    throw error;
  }
};

/**
 * Writes `content` to `file`, creating folders. The text goes to a temporary neighbour first and
 * is renamed over the target, so a crash never leaves a half-written agent file behind.
 */
export const writeTextAtomic = (file: string, content: string): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.codemaps-${process.pid}-${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporary, content, 'utf-8');
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
};

/** Hex SHA-256 of a text, used to record what CodeMaps wrote. */
export const sha256Of = (text: string): string =>
  crypto.createHash('sha256').update(text, 'utf-8').digest('hex');

/** Whether two paths are the same file on disk (for example a CLAUDE.md that links to AGENTS.md). */
export const isSameFile = (a: string, b: string): boolean => {
  try {
    return fs.realpathSync(a) === fs.realpathSync(b);
  } catch {
    return false;
  }
};

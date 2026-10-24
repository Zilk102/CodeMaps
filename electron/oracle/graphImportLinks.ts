/** Resolves import and re-export specifiers of a parsed file into graph links. */

import * as path from 'path';
import { ParseResult } from '../parsing/types';
import { oracleStore } from '../store';
import { isLocalSpecifier, normalizePath } from './shared';

/** Absolute, normalized target of an import/re-export, or undefined for external packages. */
export function resolveImportTarget(
  fromFile: string,
  record: { path: string; resolvedPath?: string }
): string | undefined {
  if (record.resolvedPath) return normalizePath(record.resolvedPath);
  if (isLocalSpecifier(record.path)) {
    return normalizePath(path.resolve(path.dirname(fromFile), record.path));
  }
  return undefined;
}

/** Re-exports with resolved target paths, dropping external packages. Returns undefined when none remain. */
export function resolveReExports(normalizedPath: string, reExports: ParseResult['reExports']) {
  const resolved = (reExports ?? []).flatMap((record) => {
    const target = resolveImportTarget(normalizedPath, record);
    return target ? [{ target, entities: record.entities }] : [];
  });
  return resolved.length > 0 ? resolved : undefined;
}

/** Adds an `import` link per local import: a weight-1 link to the file for whole-module imports, or a weight-2 link to `file#name` for each named entity. External packages are skipped. */
export function linkImports(normalizedPath: string, imports: ParseResult['imports']) {
  const store = oracleStore.getState();
  for (const imp of imports) {
    const resolvedPath = resolveImportTarget(normalizedPath, imp);
    if (!resolvedPath) continue;

    const entityNames = imp.importedEntities.length > 0 ? imp.importedEntities : ['*'];
    for (const entityName of entityNames) {
      if (entityName === '*') {
        store.addLink({ source: normalizedPath, target: resolvedPath, value: 1, type: 'import' });
      } else {
        store.addLink({
          source: normalizedPath,
          target: `${resolvedPath}#${entityName}`,
          value: 2,
          type: 'import',
        });
      }
    }
  }
}

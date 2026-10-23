import { hasEntity, type FileEntry, type ProjectIndex } from './types';

/** Top-level type names of a file: nested members are labelled `Outer.member`, so plain names. */
export const typeNamesOf = (index: ProjectIndex, file: string): string[] =>
  [...(index.entitiesByFile.get(file) ?? [])].filter((name) => !name.includes('.'));

/** `a.b.Outer.Inner` -> the file declaring Outer in package a.b (strip trailing segments). */
export const findTypeIn = (
  index: ProjectIndex,
  filesByPackage: Map<string, FileEntry[]>,
  qualifiedName: string
): { file: string; type: string } | null => {
  const segments = qualifiedName.split('.');
  for (let cut = segments.length - 1; cut >= 0; cut -= 1) {
    const packageName = segments.slice(0, cut).join('.');
    const type = segments[cut];
    const candidates = filesByPackage.get(packageName) ?? [];
    const owner = candidates.find((candidate) => hasEntity(index, candidate.path, type));
    if (owner) return { file: owner.path, type };
  }
  return null;
};

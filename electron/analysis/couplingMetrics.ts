import { GraphData, GraphLink } from '../store/types';
import { isArchitecturalDependencyLink } from './graphAnalysisUtils';

const fileOf = (nodeId: string) => nodeId.split('#')[0];

/** A reference between files of one package/folder that needs no import counts for much less. */
const IMPLICIT_WEIGHT = 0.25;

export interface FileCoupling {
  /** Distinct files that depend on this file (or on one of its symbols). */
  fanIn: number;
  /** Distinct files this file depends on. */
  fanOut: number;
}

/** Links that exist because files share a package, not because one chose to depend on the other. */
const isImplicitLink = (link: GraphLink) => /same package/.test(link.reason ?? '');

type Dependencies = Map<string, Map<string, number>>;

const addDependency = (map: Dependencies, from: string, to: string, weight: number) => {
  const bucket = map.get(from) ?? new Map<string, number>();
  bucket.set(to, Math.max(bucket.get(to) ?? 0, weight));
  map.set(from, bucket);
};

const total = (weights: Map<string, number> | undefined): number => {
  let sum = 0;
  for (const weight of weights?.values() ?? []) sum += weight;
  return Math.round(sum * 100) / 100;
};

/**
 * Coupling counted in files, not links: using fifteen symbols of one file is one dependency,
 * and imports usually point at symbols (`file#Name`), so the file node itself has no incoming
 * links at all.
 */
export const computeFileCoupling = (graph: GraphData): Map<string, FileCoupling> => {
  const dependents: Dependencies = new Map();
  const dependencies: Dependencies = new Map();

  for (const link of graph.links) {
    if (!isArchitecturalDependencyLink(link)) continue;
    const sourceFile = fileOf(link.source);
    const targetFile = fileOf(link.target);
    if (sourceFile === targetFile) continue;
    const weight = isImplicitLink(link) ? IMPLICIT_WEIGHT : 1;
    addDependency(dependencies, sourceFile, targetFile, weight);
    addDependency(dependents, targetFile, sourceFile, weight);
  }

  const result = new Map<string, FileCoupling>();
  for (const file of new Set([...dependents.keys(), ...dependencies.keys()])) {
    result.set(file, {
      fanIn: total(dependents.get(file)),
      fanOut: total(dependencies.get(file)),
    });
  }
  return result;
};

/** Distinct dependent files per exact target id (a file or a `file#symbol`), same weighting. */
export const computeNodeFanIn = (graph: GraphData): Map<string, number> => {
  const sources: Dependencies = new Map();
  for (const link of graph.links) {
    if (!isArchitecturalDependencyLink(link)) continue;
    const sourceFile = fileOf(link.source);
    if (sourceFile === fileOf(link.target)) continue;
    addDependency(sources, link.target, sourceFile, isImplicitLink(link) ? IMPLICIT_WEIGHT : 1);
  }

  const result = new Map<string, number>();
  for (const [target, files] of sources) result.set(target, total(files));
  // A file is used through all of its symbols.
  for (const [file, value] of computeFileCoupling(graph)) result.set(file, value.fanIn);
  return result;
};

/**
 * Shared code is supposed to be used everywhere: flagging a helpers file, a constants module or
 * a domain model as a "hub" is noise, because nothing the author could do about it is a fix.
 */
export const isSharedByDesign = (nodeId: string): boolean =>
  /(^|\/)(helpers?|utils?|common|shared|types?|constants?|models?|domain|entities|errors?|config|configs|pkg|lib|libs)(\/|\.|$)|(^|\/)[^/]*(helpers?|utils?|types?|constants?)\.[a-z]+$/i.test(
    fileOf(nodeId)
  );

/**
 * The entry point that wires the program together (`main.go`, `Program.cs`, `Application.java`,
 * `__main__.py`) depends on everything by design, so fan-out and layer rules do not apply to it.
 */
export const isCompositionRoot = (nodeId: string): boolean =>
  /(^|\/)(main|__main__|Main|Program|manage)\.[a-z]+$|(^|\/)[A-Za-z]*Application\.(java|kt)$/.test(
    fileOf(nodeId)
  );

const WIRING_NAME =
  /^(new|register|routes?|setup|wire|bootstrap|configure|build|create)([A-Z_0-9]|$)|^(New|Register|Routes?|Setup|Wire|Bootstrap|Configure|Build|Create)([A-Z_0-9]|$)|^(create_app|make_app|init_app|app_factory)$/;

/** A file that declares a constructor/registration/setup function composes other modules. */
export const declaresWiring = (children: Array<{ label: string; type: string }>): boolean =>
  children.some(
    (child) =>
      child.type === 'function' &&
      WIRING_NAME.test(child.label.split(/[.:]+/).filter(Boolean).pop() ?? child.label)
  );

export const WIRING_FAN_OUT_SCALE = 2;

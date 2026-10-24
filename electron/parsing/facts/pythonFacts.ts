import type { Node } from 'web-tree-sitter';
import type { ImportRecord } from '../types';
import { EntityCollector, addOwnedFunction, namedOf, fieldChildren } from './astUtils';
import {
  FactsAccumulator,
  importsHandler,
  qualifiedUseHandler,
  type NodeHandler,
  walkWithHandlers,
} from './factsAccumulator';
import type { LanguageFactsWithDeclarations } from './types';

const readPlainImport = (statement: Node): ImportRecord[] =>
  fieldChildren(statement, 'name').flatMap((entry) => {
    if (entry.type === 'aliased_import') {
      const target = entry.childForFieldName('name');
      const alias = entry.childForFieldName('alias');
      return target ? [{ path: target.text, importedEntities: [], alias: alias?.text }] : [];
    }
    return [{ path: entry.text, importedEntities: [] }];
  });

const readFromImport = (statement: Node): ImportRecord[] => {
  const module = statement.childForFieldName('module_name');
  if (!module) return [];
  const entities = fieldChildren(statement, 'name').map((entry) => {
    const target = entry.type === 'aliased_import' ? entry.childForFieldName('name') : entry;
    return target?.text ?? '';
  });
  const hasWildcard = namedOf(statement).some((child) => child.type === 'wildcard_import');
  const names = [...entities.filter(Boolean), ...(hasWildcard ? ['*'] : [])];
  return [{ path: module.text, importedEntities: names }];
};

const definitionOf = (member: Node): Node | null =>
  member.type === 'decorated_definition' ? member.childForFieldName('definition') : member;

const addClassMembers = (classNode: Node, entities: EntityCollector): void => {
  const className = classNode.childForFieldName('name')?.text;
  const body = classNode.childForFieldName('body');
  if (!className || !body) return;
  for (const member of namedOf(body)) {
    const definition = definitionOf(member);
    if (definition?.type !== 'function_definition') continue;
    const name = definition.childForFieldName('name');
    if (name) entities.add('function', `${className}.${name.text}`, name);
  }
};

const isModuleLevel = (definition: Node): boolean => {
  const container =
    definition.parent?.type === 'decorated_definition'
      ? definition.parent.parent
      : definition.parent;
  return container?.type === 'module';
};

interface PythonState {
  acc: FactsAccumulator;
}

const HANDLERS: Record<string, NodeHandler<PythonState>> = {
  import_statement: importsHandler(readPlainImport),
  import_from_statement: importsHandler(readFromImport),
  class_definition: (node, { acc }) => {
    const name = node.childForFieldName('name');
    if (name) acc.entities.add('class', name.text, name);
    addClassMembers(node, acc.entities);
    return true;
  },
  function_definition: (node, { acc }) => {
    // Methods were registered with their class; only module-level functions stay plain.
    if (isModuleLevel(node)) addOwnedFunction(acc.entities, node, undefined);
    return true;
  },
  attribute: qualifiedUseHandler('.', 'object', 'attribute'),
};

export const extractPythonFacts = (root: Node): LanguageFactsWithDeclarations => {
  const state: PythonState = { acc: new FactsAccumulator() };
  walkWithHandlers(root, state, HANDLERS);
  return state.acc.toFacts({});
};

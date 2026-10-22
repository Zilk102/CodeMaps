import type { Node } from 'web-tree-sitter';
import type { ImportRecord, QualifiedUse } from '../types';
import {
  BoundedSet,
  EntityCollector,
  MAX_QUALIFIED_USES,
  walkNamed,
  namedOf,
  fieldChildren,
} from './astUtils';
import type { LanguageFacts } from './types';

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

export const extractPythonFacts = (root: Node): LanguageFacts => {
  const imports: ImportRecord[] = [];
  const entities = new EntityCollector();
  const qualifiedUses = new BoundedSet<QualifiedUse>(MAX_QUALIFIED_USES);

  walkNamed(root, (node) => {
    switch (node.type) {
      case 'import_statement':
        imports.push(...readPlainImport(node));
        return false;
      case 'import_from_statement':
        imports.push(...readFromImport(node));
        return false;
      case 'class_definition': {
        const name = node.childForFieldName('name');
        if (name) entities.add('class', name.text, name);
        addClassMembers(node, entities);
        return true;
      }
      case 'function_definition': {
        // Methods were registered with their class; only module-level functions stay plain.
        const name = node.childForFieldName('name');
        if (name && isModuleLevel(node)) entities.add('function', name.text, name);
        return true;
      }
      case 'attribute': {
        const object = node.childForFieldName('object');
        const attribute = node.childForFieldName('attribute');
        if (object?.type === 'identifier' && attribute) {
          qualifiedUses.add(`${object.text}.${attribute.text}`, {
            qualifier: object.text,
            name: attribute.text,
          });
        }
        return true;
      }
      default:
        return true;
    }
  });

  return {
    imports,
    entities: entities.entities,
    qualifiedUses: qualifiedUses.toArray(),
    usedNames: [],
  };
};

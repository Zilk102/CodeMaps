import type { Node } from 'web-tree-sitter';
import type { ImportRecord, QualifiedUse } from '../types';
import {
  BoundedSet,
  EntityCollector,
  MAX_QUALIFIED_USES,
  MAX_USED_NAMES,
  walkNamed,
  namedOf,
} from './astUtils';
import type { LanguageFacts } from './types';

const ITEM_TYPES = new Set(['struct_item', 'enum_item', 'union_item', 'trait_item', 'type_item']);

/** Expands a `use` tree into one import per leaf: `a::{b, c::d}` -> a::b, a::c::d. */
const flattenUse = (node: Node, prefix: string, out: ImportRecord[]): void => {
  const join = (tail: string) => (prefix ? `${prefix}::${tail}` : tail);
  switch (node.type) {
    case 'scoped_use_list': {
      const path = node.childForFieldName('path')?.text;
      const list = node.childForFieldName('list');
      const base = path ? join(path) : prefix;
      if (list) namedOf(list).forEach((child) => flattenUse(child, base, out));
      return;
    }
    case 'use_list':
      namedOf(node).forEach((child) => flattenUse(child, prefix, out));
      return;
    case 'use_as_clause': {
      const path = node.childForFieldName('path')?.text;
      const alias = node.childForFieldName('alias')?.text;
      if (path) out.push({ path: join(path), importedEntities: [], alias });
      return;
    }
    case 'use_wildcard': {
      const path = namedOf(node)[0]?.text;
      out.push({ path: path ? join(path) : prefix, importedEntities: ['*'] });
      return;
    }
    case 'self':
      if (prefix) out.push({ path: prefix, importedEntities: [] });
      return;
    default:
      out.push({ path: join(node.text), importedEntities: [] });
  }
};

const implTypeName = (impl: Node): string | undefined => {
  const type = impl.childForFieldName('type');
  if (!type) return undefined;
  const inner = type.type === 'generic_type' ? type.childForFieldName('type') : type;
  return inner?.text;
};

export const extractRustFacts = (root: Node): LanguageFacts => {
  const imports: ImportRecord[] = [];
  const moduleDeclarations: string[] = [];
  const entities = new EntityCollector();
  const usedNames = new BoundedSet<string>(MAX_USED_NAMES);
  const qualifiedUses = new BoundedSet<QualifiedUse>(MAX_QUALIFIED_USES);

  walkNamed(root, (node) => {
    switch (node.type) {
      case 'use_declaration': {
        const argument = node.childForFieldName('argument');
        if (argument) flattenUse(argument, '', imports);
        return false;
      }
      case 'mod_item': {
        const name = node.childForFieldName('name')?.text;
        if (name && !node.childForFieldName('body')) moduleDeclarations.push(name);
        return true;
      }
      case 'impl_item': {
        const owner = implTypeName(node);
        const body = node.childForFieldName('body');
        for (const member of body ? namedOf(body) : []) {
          if (member.type !== 'function_item') continue;
          const name = member.childForFieldName('name');
          if (name) entities.add('function', owner ? `${owner}::${name.text}` : name.text, name);
        }
        return true;
      }
      case 'function_item': {
        const name = node.childForFieldName('name');
        // Impl members were registered with their type.
        if (name && node.parent?.parent?.type !== 'impl_item') {
          entities.add('function', name.text, name);
        }
        return true;
      }
      case 'scoped_identifier': {
        const path = node.childForFieldName('path');
        const name = node.childForFieldName('name');
        if (path?.type === 'identifier' && name) {
          qualifiedUses.add(`${path.text}::${name.text}`, {
            qualifier: path.text,
            name: name.text,
          });
        }
        return true;
      }
      case 'identifier':
      case 'type_identifier':
        if (node.text.length > 1) usedNames.add(node.text, node.text);
        return false;
      default:
        if (ITEM_TYPES.has(node.type)) {
          const name = node.childForFieldName('name');
          if (name) entities.add('class', name.text, name);
        }
        return true;
    }
  });

  return {
    imports,
    entities: entities.entities,
    qualifiedUses: qualifiedUses.toArray(),
    usedNames: usedNames.toArray(),
    moduleDeclarations,
  };
};

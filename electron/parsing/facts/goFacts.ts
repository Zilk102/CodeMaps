import type { Node } from 'web-tree-sitter';
import type { ImportRecord, QualifiedUse } from '../types';
import {
  BoundedSet,
  EntityCollector,
  MAX_QUALIFIED_USES,
  MAX_USED_NAMES,
  unquote,
  walkNamed,
  namedOf,
} from './astUtils';
import type { LanguageFacts } from './types';

const receiverTypeName = (method: Node): string | undefined => {
  const receiver = method.childForFieldName('receiver');
  let type = receiver?.namedChildren[0]?.childForFieldName('type') ?? null;
  // `*Handler` and `Repo[T]` both name the receiver type Handler / Repo.
  while (type && (type.type === 'pointer_type' || type.type === 'generic_type')) {
    type =
      type.type === 'generic_type' ? type.childForFieldName('type') : (namedOf(type)[0] ?? null);
  }
  return type?.type === 'type_identifier' ? type.text : undefined;
};

const readImport = (spec: Node): ImportRecord | null => {
  const pathNode = spec.childForFieldName('path');
  if (!pathNode) return null;
  const alias = spec.childForFieldName('name')?.text;
  return {
    path: unquote(pathNode.text),
    importedEntities: [],
    ...(alias ? { alias } : {}),
  };
};

export const extractGoFacts = (root: Node): LanguageFacts => {
  const imports: ImportRecord[] = [];
  const entities = new EntityCollector();
  const usedNames = new BoundedSet<string>(MAX_USED_NAMES);
  const qualifiedUses = new BoundedSet<QualifiedUse>(MAX_QUALIFIED_USES);
  let packageName: string | undefined;

  walkNamed(root, (node) => {
    switch (node.type) {
      case 'package_clause':
        packageName = namedOf(node)[0]?.text;
        return false;
      case 'import_spec': {
        const record = readImport(node);
        if (record) imports.push(record);
        return false;
      }
      case 'type_spec': {
        const name = node.childForFieldName('name');
        if (name) entities.add('class', name.text, name);
        return true;
      }
      case 'function_declaration': {
        const name = node.childForFieldName('name');
        if (name) entities.add('function', name.text, name);
        return true;
      }
      case 'method_declaration': {
        const name = node.childForFieldName('name');
        if (name) {
          const owner = receiverTypeName(node);
          entities.add('function', owner ? `${owner}.${name.text}` : name.text, name);
        }
        return true;
      }
      case 'selector_expression': {
        const operand = node.childForFieldName('operand');
        const field = node.childForFieldName('field');
        if (operand?.type === 'identifier' && field) {
          const key = `${operand.text}.${field.text}`;
          qualifiedUses.add(key, { qualifier: operand.text, name: field.text });
        }
        return true;
      }
      case 'qualified_type': {
        const pkg = node.childForFieldName('package');
        const name = node.childForFieldName('name');
        if (pkg && name) {
          qualifiedUses.add(`${pkg.text}.${name.text}`, { qualifier: pkg.text, name: name.text });
        }
        return false;
      }
      case 'identifier':
      case 'type_identifier':
        if (node.text.length > 1) usedNames.add(node.text, node.text);
        return false;
      default:
        return true;
    }
  });

  return {
    imports,
    entities: entities.entities,
    qualifiedUses: qualifiedUses.toArray(),
    usedNames: usedNames.toArray(),
    packageName,
  };
};

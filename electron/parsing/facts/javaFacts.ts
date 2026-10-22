import type { Node } from 'web-tree-sitter';
import type { ImportRecord } from '../types';
import {
  BoundedSet,
  EntityCollector,
  MAX_USED_NAMES,
  walkNamed,
  namedOf,
  allChildren,
} from './astUtils';
import type { LanguageFactsWithDeclarations } from './types';

const TYPE_DECLARATIONS = new Set([
  'class_declaration',
  'interface_declaration',
  'enum_declaration',
  'record_declaration',
  'annotation_type_declaration',
]);

const readImport = (declaration: Node): ImportRecord | null => {
  const name = namedOf(declaration).find((child) => child.type === 'scoped_identifier');
  if (!name) return null;
  const wildcard = namedOf(declaration).some((child) => child.type === 'asterisk');
  const isStatic = allChildren(declaration).some((child) => child.type === 'static');
  if (wildcard) return { path: name.text, importedEntities: ['*'] };
  if (isStatic) {
    // `import static a.B.member`: the file depends on class a.B.
    const segments = name.text.split('.');
    const member = segments.pop() ?? '';
    return { path: segments.join('.'), importedEntities: member ? [member] : [] };
  }
  return { path: name.text, importedEntities: [] };
};

const startsUppercase = (value: string) => /^[A-Z]/.test(value);

const enclosingTypeName = (node: Node): string | undefined => {
  let owner: Node | null = node.parent;
  while (owner && !TYPE_DECLARATIONS.has(owner.type)) owner = owner.parent;
  return owner?.childForFieldName('name')?.text;
};

export const extractJavaFacts = (root: Node): LanguageFactsWithDeclarations => {
  const imports: ImportRecord[] = [];
  const entities = new EntityCollector();
  const usedNames = new BoundedSet<string>(MAX_USED_NAMES);
  let packageName: string | undefined;

  walkNamed(root, (node) => {
    if (node.type === 'package_declaration') {
      packageName = namedOf(node).find(
        (child) => child.type === 'scoped_identifier' || child.type === 'identifier'
      )?.text;
      return false;
    }
    if (node.type === 'import_declaration') {
      const record = readImport(node);
      if (record) imports.push(record);
      return false;
    }
    if (TYPE_DECLARATIONS.has(node.type)) {
      const name = node.childForFieldName('name');
      if (name) entities.add('class', name.text, name);
      return true;
    }
    if (node.type === 'method_declaration') {
      const name = node.childForFieldName('name');
      const owner = enclosingTypeName(node);
      if (name) entities.add('function', owner ? `${owner}.${name.text}` : name.text, name);
      return true;
    }
    if (node.type === 'type_identifier') {
      usedNames.add(node.text, node.text);
      return false;
    }
    // `Strings.join(...)` and `Color.RED`: the qualifier is a class-like identifier.
    if (node.type === 'identifier' && node.text.length > 1 && startsUppercase(node.text)) {
      usedNames.add(node.text, node.text);
    }
    return true;
  });

  return {
    imports,
    entities: entities.entities,
    declarations: entities.declarations,
    qualifiedUses: [],
    usedNames: usedNames.toArray(),
    packageName,
  };
};

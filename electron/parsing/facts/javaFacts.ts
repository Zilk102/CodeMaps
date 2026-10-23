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

interface JavaState {
  imports: ImportRecord[];
  entities: EntityCollector;
  usedNames: BoundedSet<string>;
  packageName?: string;
}

const declareType = (node: Node, { entities }: JavaState): boolean => {
  const name = node.childForFieldName('name');
  if (name) entities.add('class', name.text, name);
  return true;
};

const HANDLERS: Record<string, (node: Node, state: JavaState) => boolean> = {
  package_declaration: (node, state) => {
    state.packageName = namedOf(node).find(
      (child) => child.type === 'scoped_identifier' || child.type === 'identifier'
    )?.text;
    return false;
  },
  import_declaration: (node, { imports }) => {
    const record = readImport(node);
    if (record) imports.push(record);
    return false;
  },
  method_declaration: (node, { entities }) => {
    const name = node.childForFieldName('name');
    const owner = enclosingTypeName(node);
    if (name) entities.add('function', owner ? `${owner}.${name.text}` : name.text, name);
    return true;
  },
  type_identifier: (node, { usedNames }) => {
    usedNames.add(node.text, node.text);
    return false;
  },
  // `Strings.join(...)` and `Color.RED`: the qualifier is a class-like identifier.
  identifier: (node, { usedNames }) => {
    if (node.text.length > 1 && startsUppercase(node.text)) usedNames.add(node.text, node.text);
    return true;
  },
};
for (const type of TYPE_DECLARATIONS) HANDLERS[type] = declareType;

export const extractJavaFacts = (root: Node): LanguageFactsWithDeclarations => {
  const state: JavaState = {
    imports: [],
    entities: new EntityCollector(),
    usedNames: new BoundedSet<string>(MAX_USED_NAMES),
  };
  walkNamed(root, (node) => HANDLERS[node.type]?.(node, state) ?? true);
  return {
    imports: state.imports,
    entities: state.entities.entities,
    declarations: state.entities.declarations,
    qualifiedUses: [],
    usedNames: state.usedNames.toArray(),
    packageName: state.packageName,
  };
};

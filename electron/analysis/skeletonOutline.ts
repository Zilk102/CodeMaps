/**
 * Lists the top-level declarations of a TS/JS file (and class members) with their original line numbers.
 */
import ts from 'typescript';
import * as path from 'path';

/**
 * One declaration in an outline. `line` is 1-based in the original file; `parent` is the class name for members.
 */
export interface SkeletonOutlineEntry {
  name: string;
  kind: string;
  line: number;
  exported: boolean;
  parent?: string;
}

function isExported(node: ts.Node): boolean {
  return (
    (ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined)?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
    ) ?? false
  );
}

function namedDeclarationOf(statement: ts.Statement): { name: string; kind: string } | undefined {
  if (ts.isFunctionDeclaration(statement) && statement.name) {
    return { name: statement.name.text, kind: 'function' };
  }
  if (ts.isInterfaceDeclaration(statement)) return { name: statement.name.text, kind: 'interface' };
  if (ts.isTypeAliasDeclaration(statement)) return { name: statement.name.text, kind: 'type' };
  if (ts.isEnumDeclaration(statement)) return { name: statement.name.text, kind: 'enum' };
  return undefined;
}

class OutlineBuilder {
  readonly entries: SkeletonOutlineEntry[] = [];

  constructor(private readonly sourceFile: ts.SourceFile) {}

  build(): SkeletonOutlineEntry[] {
    for (const statement of this.sourceFile.statements) {
      this.addStatement(statement);
    }
    return this.entries;
  }

  private add(name: string, kind: string, node: ts.Node, exported: boolean, parent?: string): void {
    const line =
      this.sourceFile.getLineAndCharacterOfPosition(node.getStart(this.sourceFile)).line + 1;
    this.entries.push({ name, kind, line, exported, ...(parent ? { parent } : {}) });
  }

  /**
   * Adds an entry for a top-level class, variable or named function, interface, type or enum statement; other statements are ignored.
   */
  private addStatement(statement: ts.Statement): void {
    const exported = isExported(statement);
    if (ts.isClassDeclaration(statement) && statement.name) {
      this.addClass(statement, statement.name.text, exported);
    } else if (ts.isVariableStatement(statement)) {
      this.addVariables(statement, exported);
    } else {
      const named = namedDeclarationOf(statement);
      if (named) this.add(named.name, named.kind, statement, exported);
    }
  }

  /** Adds the class and its methods and properties (members with a plain identifier name only). */
  private addClass(statement: ts.ClassDeclaration, className: string, exported: boolean): void {
    this.add(className, 'class', statement, exported);
    for (const member of statement.members) {
      if (
        (ts.isMethodDeclaration(member) || ts.isPropertyDeclaration(member)) &&
        ts.isIdentifier(member.name)
      ) {
        const kind = ts.isMethodDeclaration(member) ? 'method' : 'property';
        this.add(member.name.text, kind, member, false, className);
      }
    }
  }

  private addVariables(statement: ts.VariableStatement, exported: boolean): void {
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)) {
        this.add(declaration.name.text, 'variable', declaration, exported);
      }
    }
  }
}

/**
 * Parses `code` as TypeScript or JavaScript and returns its declaration outline in source order.
 */
export function buildOutline(code: string, fileName: string): SkeletonOutlineEntry[] {
  const sourceFile = ts.createSourceFile(
    path.basename(fileName),
    code,
    ts.ScriptTarget.Latest,
    true
  );
  return new OutlineBuilder(sourceFile).build();
}

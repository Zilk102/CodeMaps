import ts from 'typescript';
import * as path from 'path';

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

  private addStatement(statement: ts.Statement): void {
    const exported = isExported(statement);
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      this.add(statement.name.text, 'function', statement, exported);
    } else if (ts.isClassDeclaration(statement) && statement.name) {
      this.addClass(statement, statement.name.text, exported);
    } else if (ts.isInterfaceDeclaration(statement)) {
      this.add(statement.name.text, 'interface', statement, exported);
    } else if (ts.isTypeAliasDeclaration(statement)) {
      this.add(statement.name.text, 'type', statement, exported);
    } else if (ts.isEnumDeclaration(statement)) {
      this.add(statement.name.text, 'enum', statement, exported);
    } else if (ts.isVariableStatement(statement)) {
      this.addVariables(statement, exported);
    }
  }

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

export function buildOutline(code: string, fileName: string): SkeletonOutlineEntry[] {
  const sourceFile = ts.createSourceFile(
    path.basename(fileName),
    code,
    ts.ScriptTarget.Latest,
    true
  );
  return new OutlineBuilder(sourceFile).build();
}

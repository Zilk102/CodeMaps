import ts from 'typescript';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getLanguageByExtension } from '../parsing/languageRegistry';
import { loadTreeSitterLanguage, getParserInstance } from '../parsing/treeSitterRuntime';
import { Query } from 'web-tree-sitter';

export interface SkeletonOutlineEntry {
  name: string;
  kind: string;
  line: number;
  exported: boolean;
  parent?: string;
}

export class SemanticSkeletonService {
  /**
   * Generates a structural skeleton of a file.
   * Strips out function and method bodies to save tokens, preserving
   * signatures, interfaces, types, and imports.
   * Supports TS/JS via Compiler API and C++, C#, Rust, Python, Java via Tree-Sitter.
   */
  public async generateSkeleton(filePath: string): Promise<string> {
    const code = await fs.readFile(filePath, 'utf-8');
    const ext = path.extname(filePath).toLowerCase();

    // Fallback to TS for typical JS/TS extensions
    if (
      ext === '.ts' ||
      ext === '.tsx' ||
      ext === '.js' ||
      ext === '.jsx' ||
      ext === '.cjs' ||
      ext === '.mjs'
    ) {
      return this.generateSkeletonFromCode(code, filePath);
    }

    // Use Tree-Sitter for other supported languages
    const languageDef = getLanguageByExtension(ext);
    if (languageDef && languageDef.parserEngine === 'tree-sitter') {
      return this.generateSkeletonWithTreeSitter(code, languageDef.id);
    }

    // If not supported by skeletonization, return the original code
    return code;
  }

  private async generateSkeletonWithTreeSitter(code: string, languageId: string): Promise<string> {
    const ext = this.getExtensionForLanguageId(languageId);
    const languageDef = getLanguageByExtension(ext);
    if (!languageDef) return code;

    const tsLanguage = await loadTreeSitterLanguage(languageDef);
    if (!tsLanguage) return code;

    const parser = await getParserInstance();
    parser.setLanguage(tsLanguage);
    const tree = parser.parse(code);
    if (!tree) return code;

    const queryString = this.getFunctionBodyQuery(languageId);
    if (!queryString) return code;

    const query = new Query(tsLanguage, queryString);
    const matches = query.matches(tree.rootNode);

    // Sort captures from bottom to top, right to left so replacing doesn't shift indices
    const captures = matches
      .flatMap((m) => m.captures)
      .sort((a, b) => {
        return b.node.startIndex - a.node.startIndex;
      });

    let result = code;
    const replacement = this.getHiddenCommentForLanguage(languageId);

    for (const capture of captures) {
      if (capture.name === 'body') {
        const start = capture.node.startIndex;
        const end = capture.node.endIndex;
        // Check if we are replacing a block that was already replaced (overlapping)
        // by making sure we haven't shifted indices for this segment yet, or just
        // rely on the AST boundaries. Since we replace from bottom to top, inner blocks
        // are replaced first, then outer blocks might overwrite them if the query captures both.
        // For python, class body contains function definitions, so replacing class body wipes out functions.
        // We only want to replace function bodies, not class bodies.
        result = result.slice(0, start) + replacement + result.slice(end);
      }
    }

    return result;
  }

  private getExtensionForLanguageId(languageId: string): string {
    switch (languageId) {
      case 'python':
        return '.py';
      case 'go':
        return '.go';
      case 'rust':
        return '.rs';
      case 'java':
        return '.java';
      case 'cpp':
        return '.cpp';
      case 'c_sharp':
        return '.cs';
      case 'php':
        return '.php';
      case 'ruby':
        return '.rb';
      case 'swift':
        return '.swift';
      case 'kotlin':
        return '.kt';
      case 'javascript':
        return '.js';
      case 'typescript':
        return '.ts';
      case 'tsx':
        return '.tsx';
      default:
        return '.txt';
    }
  }

  private getHiddenCommentForLanguage(languageId: string): string {
    switch (languageId) {
      case 'python':
      case 'ruby':
        return ' pass # implementation hidden ';
      case 'go':
      case 'rust':
      case 'java':
      case 'cpp':
      case 'c_sharp':
      case 'php':
      case 'swift':
      case 'kotlin':
      default:
        return '{ /* implementation hidden */ }';
    }
  }

  private getFunctionBodyQuery(languageId: string): string | null {
    switch (languageId) {
      case 'python':
        return `
          (function_definition body: (block) @body)
        `;
      case 'rust':
        return `
          (function_item body: (block) @body)
        `;
      case 'java':
        return `
          (method_declaration body: (block) @body)
          (constructor_declaration body: (constructor_body) @body)
        `;
      case 'cpp':
        return `
          (function_definition body: (compound_statement) @body)
        `;
      case 'c_sharp':
        return `
          (method_declaration body: (block) @body)
          (constructor_declaration body: (block) @body)
        `;
      case 'go':
        return `
          (function_declaration body: (block) @body)
          (method_declaration body: (block) @body)
        `;
      case 'php':
        return `
          (method_declaration body: (compound_statement) @body)
          (function_definition body: (compound_statement) @body)
        `;
      case 'ruby':
        return `
          (method (body_statement) @body)
          (singleton_method (body_statement) @body)
        `;
      case 'swift':
        return `
          (function_declaration body: (code_block) @body)
          (init_declaration body: (code_block) @body)
        `;
      case 'kotlin':
        return `
          (function_declaration body: (block) @body)
        `;
      default:
        return null;
    }
  }

  /**
   * Lists declarations with their original line numbers, since the skeleton text no longer
   * lines up with the file. TS/JS only; other languages return an empty outline.
   */
  public async generateOutline(filePath: string): Promise<SkeletonOutlineEntry[]> {
    const ext = path.extname(filePath).toLowerCase();
    if (!['.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs'].includes(ext)) return [];
    const code = await fs.readFile(filePath, 'utf-8');
    return this.generateOutlineFromCode(code, filePath);
  }

  public generateOutlineFromCode(
    code: string,
    fileName: string = 'file.ts'
  ): SkeletonOutlineEntry[] {
    const sourceFile = ts.createSourceFile(
      path.basename(fileName),
      code,
      ts.ScriptTarget.Latest,
      true
    );
    const entries: SkeletonOutlineEntry[] = [];
    const lineOf = (node: ts.Node) =>
      sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    const isExported = (node: ts.Node) =>
      (ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined)?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
      ) ?? false;

    const add = (name: string, kind: string, node: ts.Node, exported: boolean, parent?: string) =>
      entries.push({ name, kind, line: lineOf(node), exported, ...(parent ? { parent } : {}) });

    for (const statement of sourceFile.statements) {
      const exported = isExported(statement);
      if (ts.isFunctionDeclaration(statement) && statement.name) {
        add(statement.name.text, 'function', statement, exported);
      } else if (ts.isClassDeclaration(statement) && statement.name) {
        const className = statement.name.text;
        add(className, 'class', statement, exported);
        for (const member of statement.members) {
          if (
            (ts.isMethodDeclaration(member) || ts.isPropertyDeclaration(member)) &&
            ts.isIdentifier(member.name)
          ) {
            add(
              member.name.text,
              ts.isMethodDeclaration(member) ? 'method' : 'property',
              member,
              false,
              className
            );
          }
        }
      } else if (ts.isInterfaceDeclaration(statement)) {
        add(statement.name.text, 'interface', statement, exported);
      } else if (ts.isTypeAliasDeclaration(statement)) {
        add(statement.name.text, 'type', statement, exported);
      } else if (ts.isEnumDeclaration(statement)) {
        add(statement.name.text, 'enum', statement, exported);
      } else if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name)) {
            add(declaration.name.text, 'variable', declaration, exported);
          }
        }
      }
    }
    return entries;
  }

  public generateSkeletonFromCode(code: string, fileName: string = 'file.ts'): string {
    const sourceFile = ts.createSourceFile(
      path.basename(fileName),
      code,
      ts.ScriptTarget.Latest,
      true
    );

    const transformer = <T extends ts.Node>(context: ts.TransformationContext) => {
      const { factory } = context;

      const createHiddenBlock = () => {
        // Creates { /* implementation hidden */ }
        const comment = ts.addSyntheticTrailingComment(
          factory.createBlock([]),
          ts.SyntaxKind.MultiLineCommentTrivia,
          ' implementation hidden ',
          false
        );
        return comment;
      };

      const visit = (node: ts.Node): ts.Node => {
        if (ts.isMethodDeclaration(node) && node.body) {
          return factory.updateMethodDeclaration(
            node,
            node.modifiers,
            node.asteriskToken,
            node.name,
            node.questionToken,
            node.typeParameters,
            node.parameters,
            node.type,
            createHiddenBlock()
          );
        }

        if (ts.isFunctionDeclaration(node) && node.body) {
          return factory.updateFunctionDeclaration(
            node,
            node.modifiers,
            node.asteriskToken,
            node.name,
            node.typeParameters,
            node.parameters,
            node.type,
            createHiddenBlock()
          );
        }

        if (ts.isConstructorDeclaration(node) && node.body) {
          return factory.updateConstructorDeclaration(
            node,
            node.modifiers,
            node.parameters,
            createHiddenBlock()
          );
        }

        if (ts.isGetAccessor(node) && node.body) {
          return factory.updateGetAccessorDeclaration(
            node,
            node.modifiers,
            node.name,
            node.parameters,
            node.type,
            createHiddenBlock()
          );
        }

        if (ts.isSetAccessor(node) && node.body) {
          return factory.updateSetAccessorDeclaration(
            node,
            node.modifiers,
            node.name,
            node.parameters,
            createHiddenBlock()
          );
        }

        if (ts.isArrowFunction(node)) {
          if (ts.isBlock(node.body)) {
            return factory.updateArrowFunction(
              node,
              node.modifiers,
              node.typeParameters,
              node.parameters,
              node.type,
              node.equalsGreaterThanToken,
              createHiddenBlock()
            );
          } else {
            // For direct expression arrow functions, we could return a placeholder or leave it if it's small.
            // Let's replace it with a block to save space.
            return factory.updateArrowFunction(
              node,
              node.modifiers,
              node.typeParameters,
              node.parameters,
              node.type,
              node.equalsGreaterThanToken,
              createHiddenBlock()
            );
          }
        }

        return ts.visitEachChild(node, visit, context);
      };

      return (node: T) => ts.visitNode(node, visit) as T;
    };

    const result = ts.transform(sourceFile, [transformer]);
    const transformedSourceFile = result.transformed[0] as ts.SourceFile;

    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
    return printer.printFile(transformedSourceFile);
  }
}

import ts from 'typescript';
import * as fs from 'fs/promises';
import * as path from 'path';

export class SemanticSkeletonService {
  /**
   * Generates a structural skeleton of a TypeScript/JavaScript file.
   * Strips out function and method bodies to save tokens, preserving
   * signatures, interfaces, types, and imports.
   */
  public async generateSkeleton(filePath: string): Promise<string> {
    const code = await fs.readFile(filePath, 'utf-8');
    return this.generateSkeletonFromCode(code, filePath);
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

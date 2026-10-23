import ts from 'typescript';
import * as path from 'path';

function createHiddenBlock(factory: ts.NodeFactory): ts.Block {
  // Creates { /* implementation hidden */ }
  return ts.addSyntheticTrailingComment(
    factory.createBlock([]),
    ts.SyntaxKind.MultiLineCommentTrivia,
    ' implementation hidden ',
    false
  );
}

/** Returns the node with its body replaced by an empty block, or null when it is not a function-like node. */
function hideBody(node: ts.Node, factory: ts.NodeFactory): ts.Node | null {
  const hidden = () => createHiddenBlock(factory);

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
      hidden()
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
      hidden()
    );
  }

  return hideAccessorOrArrowBody(node, factory, hidden);
}

function hideAccessorOrArrowBody(
  node: ts.Node,
  factory: ts.NodeFactory,
  hidden: () => ts.Block
): ts.Node | null {
  if (ts.isConstructorDeclaration(node) && node.body) {
    return factory.updateConstructorDeclaration(node, node.modifiers, node.parameters, hidden());
  }

  if (ts.isGetAccessor(node) && node.body) {
    return factory.updateGetAccessorDeclaration(
      node,
      node.modifiers,
      node.name,
      node.parameters,
      node.type,
      hidden()
    );
  }

  if (ts.isSetAccessor(node) && node.body) {
    return factory.updateSetAccessorDeclaration(
      node,
      node.modifiers,
      node.name,
      node.parameters,
      hidden()
    );
  }

  if (ts.isArrowFunction(node)) {
    // Expression-bodied arrows are replaced by a block too, to save space.
    return factory.updateArrowFunction(
      node,
      node.modifiers,
      node.typeParameters,
      node.parameters,
      node.type,
      node.equalsGreaterThanToken,
      hidden()
    );
  }

  return null;
}

export function buildTypeScriptSkeleton(code: string, fileName: string): string {
  const sourceFile = ts.createSourceFile(
    path.basename(fileName),
    code,
    ts.ScriptTarget.Latest,
    true
  );

  const transformer = <T extends ts.Node>(context: ts.TransformationContext) => {
    const visit = (node: ts.Node): ts.Node =>
      hideBody(node, context.factory) ?? ts.visitEachChild(node, visit, context);

    return (node: T) => ts.visitNode(node, visit) as T;
  };

  const result = ts.transform(sourceFile, [transformer]);
  const transformedSourceFile = result.transformed[0] as ts.SourceFile;

  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  return printer.printFile(transformedSourceFile);
}

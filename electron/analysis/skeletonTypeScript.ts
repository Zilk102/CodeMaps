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

/** Function-like nodes whose body is dropped; expression-bodied arrows become blocks too, to save space. */
function hasHideableBody(node: ts.Node): node is ts.FunctionLikeDeclaration {
  if (ts.isArrowFunction(node)) return true;
  const isFunctionLike =
    ts.isMethodDeclaration(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessor(node) ||
    ts.isSetAccessor(node);
  return isFunctionLike && node.body !== undefined;
}

/** Returns the node with its body replaced by an empty block, or null when it is not function-like. */
function hideBody(node: ts.Node, context: ts.TransformationContext): ts.Node | null {
  if (!hasHideableBody(node)) return null;
  const body = node.body;
  return ts.visitEachChild(
    node,
    (child) => (child === body ? createHiddenBlock(context.factory) : child),
    context
  );
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
      hideBody(node, context) ?? ts.visitEachChild(node, visit, context);

    return (node: T) => ts.visitNode(node, visit) as T;
  };

  const result = ts.transform(sourceFile, [transformer]);
  const transformedSourceFile = result.transformed[0] as ts.SourceFile;

  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  return printer.printFile(transformedSourceFile);
}

import ts from 'typescript';
import {
  SUPPORTED_SOURCE_FILE_REGEX,
  hashBody,
  isComplexFunction,
  LONG_METHOD_LINES,
  isGodClassByComplexity,
  isGodClassBySize,
  maxOf,
} from './structureRules';
import type { SourceClassMetric, SourceFileMetrics, SourceFunctionMetric } from './structureTypes';

function getScriptKind(filePath: string): ts.ScriptKind {
  const normalized = filePath.toLowerCase();
  if (normalized.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (normalized.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (normalized.endsWith('.js') || normalized.endsWith('.mjs') || normalized.endsWith('.cjs')) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

function isNamedDeclaration(
  node: ts.Node
): node is
  ts.FunctionDeclaration | ts.MethodDeclaration | ts.ClassDeclaration | ts.InterfaceDeclaration {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node)
  );
}

function getNodeName(node: ts.Node): string | null {
  if (isNamedDeclaration(node)) return node.name?.getText() || null;
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) return node.name.text;
  if (ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) {
    return node.name?.getText() ?? null;
  }
  return null;
}

function getLineSpan(sourceFile: ts.SourceFile, node: ts.Node): number {
  const startLine = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line;
  const endLine = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line;
  return endLine - startLine + 1;
}

function getLineRange(
  sourceFile: ts.SourceFile,
  node: ts.Node
): { startLine: number; endLine: number } {
  return {
    startLine: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
    endLine: sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
  };
}

const BRANCHING_KINDS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.ConditionalExpression,
  ts.SyntaxKind.CaseClause,
  ts.SyntaxKind.CatchClause,
]);

function isBranchingNode(node: ts.Node): boolean {
  return BRANCHING_KINDS.has(node.kind);
}

function isShortCircuitOperator(node: ts.Node): boolean {
  return (
    ts.isBinaryExpression(node) &&
    (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
      node.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
      node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
  );
}

function analyzeControlFlowComplexity(body: ts.Node): {
  complexity: number;
  branchCount: number;
  maxNesting: number;
} {
  let complexity = 1;
  let branchCount = 0;
  let maxNesting = 0;

  const visit = (node: ts.Node, nesting: number) => {
    let nextNesting = nesting;

    if (isBranchingNode(node)) {
      complexity += 1;
      branchCount += 1;
      nextNesting = nesting + 1;
      maxNesting = Math.max(maxNesting, nextNesting);
    }

    if (isShortCircuitOperator(node)) {
      complexity += 1;
      branchCount += 1;
    }

    ts.forEachChild(node, (child) => visit(child, nextNesting));
  };

  visit(body, 0);

  return {
    complexity,
    branchCount,
    maxNesting,
  };
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return Boolean(modifiers?.some((modifier: ts.Modifier) => modifier.kind === kind));
}

type MethodWithBody = (ts.MethodDeclaration | ts.AccessorDeclaration) & { body: ts.Block };

const hasMethodBody = (member: ts.ClassElement): member is MethodWithBody =>
  (ts.isMethodDeclaration(member) ||
    ts.isGetAccessorDeclaration(member) ||
    ts.isSetAccessorDeclaration(member)) &&
  !!member.body;

const isPublicMember = (member: ts.Node) =>
  !hasModifier(member, ts.SyntaxKind.PrivateKeyword) &&
  !hasModifier(member, ts.SyntaxKind.ProtectedKeyword);

/** Accumulates metrics while walking the top-level statements of one TypeScript file. */
class TypeScriptStructureCollector {
  private readonly classMetrics: SourceClassMetric[] = [];
  private readonly topLevelFunctions: SourceFunctionMetric[] = [];
  private readonly classMethodMetrics: SourceFunctionMetric[] = [];
  private publicMethodCount = 0;
  private classCount = 0;
  private maxMethodLineCount = 0;

  constructor(private readonly sourceFile: ts.SourceFile) {}

  collect(): SourceFileMetrics {
    this.sourceFile.forEachChild((node) => this.visitTopLevel(node));
    return this.toMetrics();
  }

  private visitTopLevel(node: ts.Node): void {
    if (ts.isClassDeclaration(node) && node.name) {
      this.collectClass(node, node.name.text);
      return;
    }

    if (ts.isFunctionDeclaration(node) && node.name && node.body) {
      this.registerTopLevelFunction(node.name.text, node.body);
      return;
    }

    if (ts.isVariableStatement(node)) {
      this.collectVariableFunctions(node);
    }
  }

  private collectVariableFunctions(statement: ts.VariableStatement): void {
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
        continue;
      }

      if (
        ts.isArrowFunction(declaration.initializer) ||
        ts.isFunctionExpression(declaration.initializer)
      ) {
        this.registerTopLevelFunction(declaration.name.text, declaration.initializer.body);
      }
    }
  }

  private registerTopLevelFunction(name: string, body: ts.Node): void {
    this.topLevelFunctions.push(this.analyzeFunctionLikeNode(name, body));
  }

  private analyzeFunctionLikeNode(name: string, body: ts.Node): SourceFunctionMetric {
    const lineCount = getLineSpan(this.sourceFile, body);
    const range = getLineRange(this.sourceFile, body);
    const flow = analyzeControlFlowComplexity(body);
    this.maxMethodLineCount = Math.max(this.maxMethodLineCount, lineCount);

    return {
      name,
      lineCount,
      startLine: range.startLine,
      endLine: range.endLine,
      complexity: flow.complexity,
      branchCount: flow.branchCount,
      maxNesting: flow.maxNesting,
      bodyHash: hashBody(body.getText(this.sourceFile)),
    };
  }

  private collectClass(node: ts.ClassDeclaration, className: string): void {
    this.classCount += 1;
    const methodMetrics: SourceFunctionMetric[] = [];
    let classPublicMethodCount = 0;

    for (const member of node.members.filter(hasMethodBody)) {
      const metric = this.analyzeFunctionLikeNode(
        getNodeName(member) || `${className}::*`,
        member.body
      );
      methodMetrics.push(metric);
      this.classMethodMetrics.push({ ...metric, name: `${className}.${metric.name}` });

      if (isPublicMember(member)) {
        classPublicMethodCount += 1;
        this.publicMethodCount += 1;
      }
    }

    this.classMetrics.push(
      this.buildClassMetric(node, className, methodMetrics, classPublicMethodCount)
    );
  }

  private buildClassMetric(
    node: ts.ClassDeclaration,
    className: string,
    methodMetrics: SourceFunctionMetric[],
    publicMethodCount: number
  ): SourceClassMetric {
    return {
      name: className,
      lineCount: getLineSpan(this.sourceFile, node),
      ...getLineRange(this.sourceFile, node),
      methodCount: methodMetrics.length,
      publicMethodCount,
      longMethodCount: methodMetrics.filter((item) => item.lineCount >= LONG_METHOD_LINES).length,
      complexMethodCount: methodMetrics.filter(isComplexFunction).length,
      maxMethodLineCount: maxOf(methodMetrics, (item) => item.lineCount),
      maxMethodComplexity: maxOf(methodMetrics, (item) => item.complexity),
    };
  }

  private toMetrics(): SourceFileMetrics {
    const allFunctions = [...this.topLevelFunctions, ...this.classMethodMetrics];
    return {
      classCount: this.classCount,
      topLevelFunctionCount: this.topLevelFunctions.length,
      publicMethodCount: this.publicMethodCount,
      maxMethodLineCount: this.maxMethodLineCount,
      godClasses: this.classMetrics.filter(
        (classMetric) => isGodClassBySize(classMetric) || isGodClassByComplexity(classMetric)
      ),
      longMethods: allFunctions.filter((item) => item.lineCount >= LONG_METHOD_LINES),
      complexMethods: allFunctions.filter(isComplexFunction),
      allFunctions,
    };
  }
}

export function analyzeSourceFileStructureWithTypeScript(
  filePath: string,
  text: string
): SourceFileMetrics | null {
  if (!SUPPORTED_SOURCE_FILE_REGEX.test(filePath)) {
    return null;
  }

  const sourceFile = ts.createSourceFile(
    filePath,
    text,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(filePath)
  );

  return new TypeScriptStructureCollector(sourceFile).collect();
}

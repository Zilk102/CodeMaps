// Measures classes and functions of a JS/TS file with the TypeScript compiler API: line spans,
// cyclomatic complexity and nesting.

import ts from 'typescript';
import { DEFAULT_STRUCTURE_LIMITS, type StructureLimits } from '../projectConfig/structureLimits';
import {
  SUPPORTED_SOURCE_FILE_REGEX,
  hashBody,
  isComplexFunction,
  isLongFunction,
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

/** Type guard for declarations that have a `name` (function, method, class, interface). */
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

/**
 * Cyclomatic complexity of a body: 1 plus each branching statement and each `&&`, `||` or `??`.
 * Nesting depth counts branching nodes only, not short-circuit operators.
 */
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

  constructor(
    private readonly sourceFile: ts.SourceFile,
    private readonly limits: StructureLimits
  ) {}

  collect(): SourceFileMetrics {
    this.sourceFile.forEachChild((node) => this.visitTopLevel(node));
    return this.toMetrics();
  }

  /**
   * Dispatches one top-level statement: classes, named function declarations and variables
   * initialised with a function are measured, everything else is ignored.
   */
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

  /**
   * Registers the arrow functions and function expressions assigned to variables of a statement as
   * top-level functions.
   */
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

  /**
   * Measures a function body: line span, range, complexity and hash. Also updates the file-wide
   * longest-method value.
   */
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

  /**
   * Measures every method and accessor with a body in the class and adds the class metric. Public
   * means no `private` or `protected` modifier.
   */
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

  /** Assembles the class metric from the measured methods and the class's own line span. */
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
      longMethodCount: methodMetrics.filter((item) => isLongFunction(item, this.limits)).length,
      complexMethodCount: methodMetrics.filter((item) => isComplexFunction(item, this.limits))
        .length,
      maxMethodLineCount: maxOf(methodMetrics, (item) => item.lineCount),
      maxMethodComplexity: maxOf(methodMetrics, (item) => item.complexity),
    };
  }

  /**
   * Final file metrics. A class is a god class by size or by complexity; long and complex lists
   * include both top-level functions and class methods.
   */
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
      longMethods: allFunctions.filter((item) => isLongFunction(item, this.limits)),
      complexMethods: allFunctions.filter((item) => isComplexFunction(item, this.limits)),
      allFunctions,
    };
  }
}

/** Structure metrics of a JS/TS file, or null when the path is not a supported script extension. */
export function analyzeSourceFileStructureWithTypeScript(
  filePath: string,
  text: string,
  limits: StructureLimits = DEFAULT_STRUCTURE_LIMITS
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

  return new TypeScriptStructureCollector(sourceFile, limits).collect();
}

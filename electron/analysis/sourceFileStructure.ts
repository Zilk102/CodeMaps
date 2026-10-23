// Structure of one source file (functions, classes, complexity, body hashes), read with the
// TypeScript compiler API and a regex fallback. Scoring modules on top of it lives in
// moduleQualityMetrics.ts.
import * as fs from 'fs';
import * as crypto from 'crypto';
import ts from 'typescript';

export interface SourceFunctionMetric {
  name: string;
  lineCount: number;
  startLine: number;
  endLine: number;
  complexity: number;
  branchCount: number;
  maxNesting: number;
  bodyHash?: string;
}

export interface SourceClassMetric {
  name: string;
  lineCount: number;
  startLine: number;
  endLine: number;
  methodCount: number;
  publicMethodCount: number;
  longMethodCount: number;
  complexMethodCount: number;
  maxMethodLineCount: number;
  maxMethodComplexity: number;
}

export interface SourceFileMetrics {
  classCount: number;
  topLevelFunctionCount: number;
  publicMethodCount: number;
  maxMethodLineCount: number;
  godClasses: SourceClassMetric[];
  longMethods: SourceFunctionMetric[];
  complexMethods: SourceFunctionMetric[];
  allFunctions: SourceFunctionMetric[];
}

const SUPPORTED_SOURCE_FILE_REGEX = /\.(?:[cm]?[jt]sx?)$/iu;

const TOP_LEVEL_FUNCTION_REGEX =
  /(?:^|\n)\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::[^{\n]+)?\{|(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{/gu;

const CLASS_REGEX = /\bclass\s+([A-Za-z_$][\w$]*)/gu;

const METHOD_REGEX =
  /(?:^|\n)\s*(?:(public|protected|private)\s+)?(?:(?:static|abstract|override|readonly|async|get|set)\s+)*(?!if\b|for\b|while\b|switch\b|catch\b|else\b|do\b|try\b)([A-Za-z_$][\w$]*)\s*(?:=\s*(?:async\s*)?\([^)]*\)\s*=>|\([^;=\n]*\)\s*(?::[^{=\n]+)?\s*)\{/gmu;

const LONG_METHOD_LINES = 70;

function getScriptKind(filePath: string): ts.ScriptKind {
  const normalized = filePath.toLowerCase();
  if (normalized.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (normalized.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (normalized.endsWith('.js') || normalized.endsWith('.mjs') || normalized.endsWith('.cjs')) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

function readText(filePath: string): string | null {
  if (!SUPPORTED_SOURCE_FILE_REGEX.test(filePath)) {
    return null;
  }

  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function findNextOpenBrace(text: string, startIndex: number): number {
  for (let index = startIndex; index < text.length; index += 1) {
    if (text[index] === '{') {
      return index;
    }
  }
  return -1;
}

type ScanMode = 'code' | 'lineComment' | 'blockComment' | 'single' | 'double' | 'template';

const QUOTE_MODES: Record<string, ScanMode> = { "'": 'single', '"': 'double', '`': 'template' };
const QUOTE_CHARS: Partial<Record<ScanMode, string>> = {
  single: "'",
  double: '"',
  template: '`',
};

/** Whether `char` (preceded by `prevChar`) ends the non-code region `mode`. */
function endsScanMode(mode: ScanMode, char: string, prevChar: string | undefined): boolean {
  if (mode === 'lineComment') return char === '\n';
  if (mode === 'blockComment') return prevChar === '*' && char === '/';
  return char === QUOTE_CHARS[mode] && prevChar !== '\\';
}

/** The non-code region started at `char`, with how many extra characters it consumes. */
function startsScanMode(
  char: string,
  nextChar: string | undefined
): { mode: ScanMode; skip: number } | null {
  if (char === '/' && nextChar === '/') return { mode: 'lineComment', skip: 1 };
  if (char === '/' && nextChar === '*') return { mode: 'blockComment', skip: 1 };
  const quoteMode = QUOTE_MODES[char];
  return quoteMode ? { mode: quoteMode, skip: 0 } : null;
}

function findMatchingBrace(text: string, openBraceIndex: number): number {
  let depth = 0;
  let mode: ScanMode = 'code';

  for (let index = openBraceIndex; index < text.length; index += 1) {
    const char = text[index];

    if (mode !== 'code') {
      if (endsScanMode(mode, char, text[index - 1])) {
        mode = 'code';
      }
      continue;
    }

    const started = startsScanMode(char, text[index + 1]);
    if (started) {
      mode = started.mode;
      index += started.skip;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function getLineCountForRange(text: string, start: number, end: number): number {
  return text.slice(start, end).split(/\r?\n/u).length;
}

function isInsideRanges(index: number, ranges: Array<{ start: number; end: number }>): boolean {
  return ranges.some((range) => index >= range.start && index <= range.end);
}

function hashBody(body: string): string {
  return crypto.createHash('md5').update(body.replace(/\s+/g, '')).digest('hex');
}

function maxOf(
  items: SourceFunctionMetric[],
  pick: (item: SourceFunctionMetric) => number
): number {
  return items.reduce((max, item) => Math.max(max, pick(item)), 0);
}

function emptyMetrics(): SourceFileMetrics {
  return {
    classCount: 0,
    topLevelFunctionCount: 0,
    publicMethodCount: 0,
    maxMethodLineCount: 0,
    godClasses: [],
    longMethods: [],
    complexMethods: [],
    allFunctions: [],
  };
}

function isGodClassBySize(classMetric: SourceClassMetric): boolean {
  return (
    classMetric.lineCount >= 220 ||
    classMetric.methodCount >= 10 ||
    (classMetric.publicMethodCount >= 8 && classMetric.lineCount >= 140) ||
    (classMetric.publicMethodCount >= 6 &&
      classMetric.lineCount >= 120 &&
      classMetric.longMethodCount >= 1)
  );
}

function isGodClassByComplexity(classMetric: SourceClassMetric): boolean {
  return classMetric.maxMethodComplexity >= 12 || classMetric.complexMethodCount >= 2;
}

function analyzeClassBody(bodyText: string): {
  methods: SourceFunctionMetric[];
  publicMethodCount: number;
} {
  const methods: SourceFunctionMetric[] = [];
  let publicMethodCount = 0;
  let match: RegExpExecArray | null;

  METHOD_REGEX.lastIndex = 0;
  while ((match = METHOD_REGEX.exec(bodyText)) !== null) {
    const visibility = match[1];
    const methodName = match[2];
    const signature = match[0];
    const openBraceOffset = signature.lastIndexOf('{');
    if (openBraceOffset === -1) {
      continue;
    }

    const openBraceIndex = match.index + openBraceOffset;
    const closeBraceIndex = findMatchingBrace(bodyText, openBraceIndex);
    if (closeBraceIndex === -1) {
      continue;
    }

    methods.push(createRegexFunctionMetric(methodName, bodyText, openBraceIndex, closeBraceIndex));

    if (!visibility || visibility === 'public') {
      publicMethodCount += 1;
    }

    METHOD_REGEX.lastIndex = closeBraceIndex + 1;
  }

  return {
    methods,
    publicMethodCount,
  };
}

function createRegexFunctionMetric(
  name: string,
  text: string,
  openBraceIndex: number,
  closeBraceIndex: number
): SourceFunctionMetric {
  return {
    name,
    lineCount: getLineCountForRange(text, openBraceIndex, closeBraceIndex + 1),
    startLine: 0,
    endLine: 0,
    complexity: 1,
    branchCount: 0,
    maxNesting: 0,
    bodyHash: hashBody(text.slice(openBraceIndex, closeBraceIndex + 1)),
  };
}

function getNodeName(node: ts.Node): string | null {
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node)
  ) {
    return node.name?.getText() || null;
  }

  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
    return node.name.text;
  }

  if ((ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) && node.name) {
    return node.name.getText();
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

function isBranchingNode(node: ts.Node): boolean {
  return (
    ts.isIfStatement(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node) ||
    ts.isConditionalExpression(node) ||
    ts.isCaseClause(node) ||
    ts.isCatchClause(node)
  );
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

    for (const member of node.members) {
      if (
        (!ts.isMethodDeclaration(member) &&
          !ts.isGetAccessorDeclaration(member) &&
          !ts.isSetAccessorDeclaration(member)) ||
        !member.body
      ) {
        continue;
      }

      const metric = this.analyzeFunctionLikeNode(
        getNodeName(member) || `${className}::*`,
        member.body
      );
      methodMetrics.push(metric);
      this.classMethodMetrics.push({ ...metric, name: `${className}.${metric.name}` });

      if (
        !hasModifier(member, ts.SyntaxKind.PrivateKeyword) &&
        !hasModifier(member, ts.SyntaxKind.ProtectedKeyword)
      ) {
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

function isComplexFunction(item: SourceFunctionMetric): boolean {
  return item.complexity >= 10 || item.maxNesting >= 4;
}

function analyzeSourceFileStructureWithTypeScript(
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

interface RegexClassScan {
  ranges: Array<{ start: number; end: number }>;
  metrics: SourceClassMetric[];
  publicMethodCount: number;
  maxMethodLineCount: number;
}

function scanClassesWithRegex(text: string): RegexClassScan {
  const scan: RegexClassScan = {
    ranges: [],
    metrics: [],
    publicMethodCount: 0,
    maxMethodLineCount: 0,
  };
  let match: RegExpExecArray | null;

  CLASS_REGEX.lastIndex = 0;
  while ((match = CLASS_REGEX.exec(text)) !== null) {
    const openBraceIndex = findNextOpenBrace(text, match.index + match[0].length);
    if (openBraceIndex === -1) {
      continue;
    }

    const closeBraceIndex = findMatchingBrace(text, openBraceIndex);
    if (closeBraceIndex === -1) {
      continue;
    }

    scan.ranges.push({ start: match.index, end: closeBraceIndex });
    const classBody = text.slice(openBraceIndex + 1, closeBraceIndex);
    const { methods, publicMethodCount } = analyzeClassBody(classBody);
    const classMaxMethodLineCount = maxOf(methods, (item) => item.lineCount);

    scan.publicMethodCount += publicMethodCount;
    scan.maxMethodLineCount = Math.max(scan.maxMethodLineCount, classMaxMethodLineCount);
    scan.metrics.push({
      name: match[1],
      lineCount: getLineCountForRange(text, openBraceIndex, closeBraceIndex + 1),
      startLine: 0,
      endLine: 0,
      methodCount: methods.length,
      publicMethodCount,
      longMethodCount: methods.filter((item) => item.lineCount >= LONG_METHOD_LINES).length,
      complexMethodCount: 0,
      maxMethodLineCount: classMaxMethodLineCount,
      maxMethodComplexity: 1,
    });

    CLASS_REGEX.lastIndex = closeBraceIndex + 1;
  }

  return scan;
}

function scanTopLevelFunctionsWithRegex(
  text: string,
  classRanges: Array<{ start: number; end: number }>
): SourceFunctionMetric[] {
  const topLevelFunctions: SourceFunctionMetric[] = [];
  let match: RegExpExecArray | null;

  TOP_LEVEL_FUNCTION_REGEX.lastIndex = 0;
  while ((match = TOP_LEVEL_FUNCTION_REGEX.exec(text)) !== null) {
    const functionName = match[1] || match[2];
    const openBraceOffset = match[0].lastIndexOf('{');
    if (!functionName || openBraceOffset === -1) {
      continue;
    }

    const openBraceIndex = match.index + openBraceOffset;
    if (isInsideRanges(openBraceIndex, classRanges)) {
      continue;
    }

    const closeBraceIndex = findMatchingBrace(text, openBraceIndex);
    if (closeBraceIndex === -1) {
      continue;
    }

    topLevelFunctions.push(
      createRegexFunctionMetric(functionName, text, openBraceIndex, closeBraceIndex)
    );
    TOP_LEVEL_FUNCTION_REGEX.lastIndex = closeBraceIndex + 1;
  }

  return topLevelFunctions;
}

function longClassMethodPlaceholders(classMetrics: SourceClassMetric[]): SourceFunctionMetric[] {
  return classMetrics
    .filter((classMetric) => classMetric.maxMethodLineCount >= LONG_METHOD_LINES)
    .map((classMetric) => ({
      name: `${classMetric.name}::*`,
      lineCount: classMetric.maxMethodLineCount,
      startLine: classMetric.startLine,
      endLine: classMetric.endLine,
      complexity: 1,
      branchCount: 0,
      maxNesting: 0,
    }));
}

function analyzeSourceFileStructureWithRegex(filePath: string): SourceFileMetrics {
  const text = readText(filePath);
  if (!text) {
    return emptyMetrics();
  }

  const classes = scanClassesWithRegex(text);
  const topLevelFunctions = scanTopLevelFunctionsWithRegex(text, classes.ranges);
  const maxMethodLineCount = Math.max(
    classes.maxMethodLineCount,
    maxOf(topLevelFunctions, (item) => item.lineCount)
  );

  return {
    classCount: classes.ranges.length,
    topLevelFunctionCount: topLevelFunctions.length,
    publicMethodCount: classes.publicMethodCount,
    maxMethodLineCount,
    godClasses: classes.metrics.filter(isGodClassBySize),
    longMethods: topLevelFunctions
      .filter((item) => item.lineCount >= LONG_METHOD_LINES)
      .concat(longClassMethodPlaceholders(classes.metrics)),
    complexMethods: [],
    allFunctions: topLevelFunctions,
  };
}

export function analyzeSourceFileStructure(filePath: string): SourceFileMetrics {
  const text = readText(filePath);
  if (!text) {
    return analyzeSourceFileStructureWithRegex(filePath);
  }

  return (
    analyzeSourceFileStructureWithTypeScript(filePath, text) ||
    analyzeSourceFileStructureWithRegex(filePath)
  );
}

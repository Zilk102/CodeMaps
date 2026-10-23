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

function findMatchingBrace(text: string, openBraceIndex: number): number {
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inTemplate = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = openBraceIndex; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];
    const prevChar = text[index - 1];

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (prevChar === '*' && char === '/') {
        inBlockComment = false;
      }
      continue;
    }

    if (inSingleQuote) {
      if (char === "'" && prevChar !== '\\') {
        inSingleQuote = false;
      }
      continue;
    }

    if (inDoubleQuote) {
      if (char === '"' && prevChar !== '\\') {
        inDoubleQuote = false;
      }
      continue;
    }

    if (inTemplate) {
      if (char === '`' && prevChar !== '\\') {
        inTemplate = false;
      }
      continue;
    }

    if (char === '/' && nextChar === '/') {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (char === '/' && nextChar === '*') {
      inBlockComment = true;
      index += 1;
      continue;
    }

    if (char === "'") {
      inSingleQuote = true;
      continue;
    }

    if (char === '"') {
      inDoubleQuote = true;
      continue;
    }

    if (char === '`') {
      inTemplate = true;
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
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

    const methodBody = bodyText.slice(openBraceIndex, closeBraceIndex + 1);
    const bodyHash = crypto.createHash('md5').update(methodBody.replace(/\s+/g, '')).digest('hex');

    const lineCount = getLineCountForRange(bodyText, openBraceIndex, closeBraceIndex + 1);
    methods.push({
      name: methodName,
      lineCount,
      startLine: 0,
      endLine: 0,
      complexity: 1,
      branchCount: 0,
      maxNesting: 0,
      bodyHash,
    });

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

function analyzeControlFlowComplexity(
  sourceFile: ts.SourceFile,
  body: ts.Node
): {
  complexity: number;
  branchCount: number;
  maxNesting: number;
} {
  let complexity = 1;
  let branchCount = 0;
  let maxNesting = 0;

  const visit = (node: ts.Node, nesting: number) => {
    let nextNesting = nesting;
    const isBranchingNode =
      ts.isIfStatement(node) ||
      ts.isForStatement(node) ||
      ts.isForInStatement(node) ||
      ts.isForOfStatement(node) ||
      ts.isWhileStatement(node) ||
      ts.isDoStatement(node) ||
      ts.isConditionalExpression(node) ||
      ts.isCaseClause(node) ||
      ts.isCatchClause(node);

    if (isBranchingNode) {
      complexity += 1;
      branchCount += 1;
      nextNesting = nesting + 1;
      maxNesting = Math.max(maxNesting, nextNesting);
    }

    if (
      ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
        node.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
        node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
    ) {
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

  const classMetrics: SourceClassMetric[] = [];
  const topLevelFunctions: SourceFunctionMetric[] = [];
  const classMethodMetrics: SourceFunctionMetric[] = [];
  let publicMethodCount = 0;
  let classCount = 0;
  let topLevelFunctionCount = 0;
  let maxMethodLineCount = 0;

  const analyzeFunctionLikeNode = (name: string, body: ts.Node): SourceFunctionMetric => {
    const lineCount = getLineSpan(sourceFile, body);
    const range = getLineRange(sourceFile, body);
    const flow = analyzeControlFlowComplexity(sourceFile, body);
    maxMethodLineCount = Math.max(maxMethodLineCount, lineCount);
    const bodyHash = crypto
      .createHash('md5')
      .update(body.getText(sourceFile).replace(/\s+/g, ''))
      .digest('hex');

    return {
      name,
      lineCount,
      startLine: range.startLine,
      endLine: range.endLine,
      complexity: flow.complexity,
      branchCount: flow.branchCount,
      maxNesting: flow.maxNesting,
      bodyHash,
    };
  };

  sourceFile.forEachChild((node) => {
    if (ts.isClassDeclaration(node) && node.name) {
      classCount += 1;
      const methodMetrics: SourceFunctionMetric[] = [];
      let classPublicMethodCount = 0;

      for (const member of node.members) {
        if (
          !ts.isMethodDeclaration(member) &&
          !ts.isGetAccessorDeclaration(member) &&
          !ts.isSetAccessorDeclaration(member)
        ) {
          continue;
        }

        if (!member.body) {
          continue;
        }

        const methodName = getNodeName(member) || `${node.name.text}::*`;
        const metric = analyzeFunctionLikeNode(methodName, member.body);
        methodMetrics.push(metric);
        classMethodMetrics.push({
          ...metric,
          name: `${node.name.text}.${metric.name}`,
        });

        if (
          !hasModifier(member, ts.SyntaxKind.PrivateKeyword) &&
          !hasModifier(member, ts.SyntaxKind.ProtectedKeyword)
        ) {
          classPublicMethodCount += 1;
          publicMethodCount += 1;
        }
      }

      const longMethodCount = methodMetrics.filter((item) => item.lineCount >= 70).length;
      const complexMethodCount = methodMetrics.filter(
        (item) => item.complexity >= 10 || item.maxNesting >= 4
      ).length;
      const maxMethodComplexity = methodMetrics.reduce(
        (max, item) => Math.max(max, item.complexity),
        0
      );

      classMetrics.push({
        name: node.name.text,
        lineCount: getLineSpan(sourceFile, node),
        ...getLineRange(sourceFile, node),
        methodCount: methodMetrics.length,
        publicMethodCount: classPublicMethodCount,
        longMethodCount,
        complexMethodCount,
        maxMethodLineCount: methodMetrics.reduce((max, item) => Math.max(max, item.lineCount), 0),
        maxMethodComplexity,
      });

      return;
    }

    const registerTopLevelFunction = (name: string, body: ts.Node) => {
      topLevelFunctionCount += 1;
      topLevelFunctions.push(analyzeFunctionLikeNode(name, body));
    };

    if (ts.isFunctionDeclaration(node) && node.name && node.body) {
      registerTopLevelFunction(node.name.text, node.body);
      return;
    }

    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
          continue;
        }

        if (
          ts.isArrowFunction(declaration.initializer) ||
          ts.isFunctionExpression(declaration.initializer)
        ) {
          registerTopLevelFunction(declaration.name.text, declaration.initializer.body);
        }
      }
    }
  });

  return {
    classCount,
    topLevelFunctionCount,
    publicMethodCount,
    maxMethodLineCount,
    godClasses: classMetrics.filter(
      (classMetric) =>
        classMetric.lineCount >= 220 ||
        classMetric.methodCount >= 10 ||
        classMetric.maxMethodComplexity >= 12 ||
        classMetric.complexMethodCount >= 2 ||
        (classMetric.publicMethodCount >= 8 && classMetric.lineCount >= 140) ||
        (classMetric.publicMethodCount >= 6 &&
          classMetric.lineCount >= 120 &&
          classMetric.longMethodCount >= 1)
    ),
    longMethods: [...topLevelFunctions, ...classMethodMetrics].filter(
      (item) => item.lineCount >= 70
    ),
    complexMethods: [...topLevelFunctions, ...classMethodMetrics].filter(
      (item) => item.complexity >= 10 || item.maxNesting >= 4
    ),
    allFunctions: [...topLevelFunctions, ...classMethodMetrics],
  };
}

function analyzeSourceFileStructureWithRegex(filePath: string): SourceFileMetrics {
  const text = readText(filePath);
  if (!text) {
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

  const classRanges: Array<{ start: number; end: number }> = [];
  const classMetrics: SourceClassMetric[] = [];
  let publicMethodCount = 0;
  let maxMethodLineCount = 0;
  let match: RegExpExecArray | null;

  CLASS_REGEX.lastIndex = 0;
  while ((match = CLASS_REGEX.exec(text)) !== null) {
    const className = match[1];
    const openBraceIndex = findNextOpenBrace(text, match.index + match[0].length);
    if (openBraceIndex === -1) {
      continue;
    }

    const closeBraceIndex = findMatchingBrace(text, openBraceIndex);
    if (closeBraceIndex === -1) {
      continue;
    }

    classRanges.push({ start: match.index, end: closeBraceIndex });
    const bodyText = text.slice(openBraceIndex + 1, closeBraceIndex);
    const classLineCount = getLineCountForRange(text, openBraceIndex, closeBraceIndex + 1);
    const { methods, publicMethodCount: classPublicMethodCount } = analyzeClassBody(bodyText);
    const longMethodCount = methods.filter((item) => item.lineCount >= 70).length;
    const classMaxMethodLineCount = methods.reduce((max, item) => Math.max(max, item.lineCount), 0);

    publicMethodCount += classPublicMethodCount;
    maxMethodLineCount = Math.max(maxMethodLineCount, classMaxMethodLineCount);

    classMetrics.push({
      name: className,
      lineCount: classLineCount,
      startLine: 0,
      endLine: 0,
      methodCount: methods.length,
      publicMethodCount: classPublicMethodCount,
      longMethodCount,
      complexMethodCount: 0,
      maxMethodLineCount: classMaxMethodLineCount,
      maxMethodComplexity: 1,
    });

    CLASS_REGEX.lastIndex = closeBraceIndex + 1;
  }

  const topLevelFunctions: SourceFunctionMetric[] = [];
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

    const funcBody = text.slice(openBraceIndex, closeBraceIndex + 1);
    const bodyHash = crypto.createHash('md5').update(funcBody.replace(/\s+/g, '')).digest('hex');

    const lineCount = getLineCountForRange(text, openBraceIndex, closeBraceIndex + 1);
    topLevelFunctions.push({
      name: functionName,
      lineCount,
      startLine: 0,
      endLine: 0,
      complexity: 1,
      branchCount: 0,
      maxNesting: 0,
      bodyHash,
    });
    maxMethodLineCount = Math.max(maxMethodLineCount, lineCount);

    TOP_LEVEL_FUNCTION_REGEX.lastIndex = closeBraceIndex + 1;
  }

  return {
    classCount: classRanges.length,
    topLevelFunctionCount: topLevelFunctions.length,
    publicMethodCount,
    maxMethodLineCount,
    godClasses: classMetrics.filter(
      (classMetric) =>
        classMetric.lineCount >= 220 ||
        classMetric.methodCount >= 10 ||
        (classMetric.publicMethodCount >= 8 && classMetric.lineCount >= 140) ||
        (classMetric.publicMethodCount >= 6 &&
          classMetric.lineCount >= 120 &&
          classMetric.longMethodCount >= 1)
    ),
    longMethods: topLevelFunctions
      .filter((item) => item.lineCount >= 70)
      .concat(
        classMetrics.flatMap((classMetric) =>
          classMetric.maxMethodLineCount >= 70
            ? [
                {
                  name: `${classMetric.name}::*`,
                  lineCount: classMetric.maxMethodLineCount,
                  startLine: classMetric.startLine,
                  endLine: classMetric.endLine,
                  complexity: 1,
                  branchCount: 0,
                  maxNesting: 0,
                },
              ]
            : []
        )
      ),
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

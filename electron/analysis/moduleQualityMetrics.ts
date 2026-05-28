import * as fs from 'fs';
import ts from 'typescript';
import { GraphData, GraphNode } from '../store';
import {
  buildGraphAdjacency,
  getChildCodeSymbolCount,
  getFileLineCount,
  isContractSemanticLink,
  isDiRuntimeLink,
  isStackAwareLink,
} from './graphAnalysisUtils';

export interface SourceFunctionMetric {
  name: string;
  lineCount: number;
  startLine: number;
  endLine: number;
  complexity: number;
  branchCount: number;
  maxNesting: number;
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
}

export interface ModuleQualityMetric {
  node: GraphNode;
  lineCount: number | null;
  symbolCount: number;
  fanIn: number;
  fanOut: number;
  stackAwareDegree: number;
  diRuntimeDegree: number;
  contractDegree: number;
  sourceMetrics: SourceFileMetrics;
  responsibilityAxisCount: number;
  mixedResponsibilities: boolean;
  designSmellScore: number;
}

export interface ModuleQualitySummary {
  metrics: ModuleQualityMetric[];
  oversizedModules: ModuleQualityMetric[];
  godFiles: ModuleQualityMetric[];
  godClasses: Array<ModuleQualityMetric & { matchedClasses: SourceClassMetric[] }>;
  longMethods: Array<ModuleQualityMetric & { matchedMethods: SourceFunctionMetric[] }>;
  complexMethods: Array<ModuleQualityMetric & { matchedMethods: SourceFunctionMetric[] }>;
  mixedResponsibilityModules: ModuleQualityMetric[];
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
      if (char === '\'' && prevChar !== '\\') {
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

    if (char === '\'') {
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

    const lineCount = getLineCountForRange(bodyText, openBraceIndex, closeBraceIndex + 1);
    methods.push({
      name: methodName,
      lineCount,
      startLine: 0,
      endLine: 0,
      complexity: 1,
      branchCount: 0,
      maxNesting: 0,
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

function getLineRange(sourceFile: ts.SourceFile, node: ts.Node): { startLine: number; endLine: number } {
  return {
    startLine: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
    endLine: sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
  };
}

function analyzeControlFlowComplexity(sourceFile: ts.SourceFile, body: ts.Node): {
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

    return {
      name,
      lineCount,
      startLine: range.startLine,
      endLine: range.endLine,
      complexity: flow.complexity,
      branchCount: flow.branchCount,
      maxNesting: flow.maxNesting,
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
    longMethods: [...topLevelFunctions, ...classMethodMetrics].filter((item) => item.lineCount >= 70),
    complexMethods: [...topLevelFunctions, ...classMethodMetrics].filter(
      (item) => item.complexity >= 10 || item.maxNesting >= 4
    ),
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
    const classMaxMethodLineCount = methods.reduce(
      (max, item) => Math.max(max, item.lineCount),
      0
    );

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

    const lineCount = getLineCountForRange(text, openBraceIndex, closeBraceIndex + 1);
    topLevelFunctions.push({
      name: functionName,
      lineCount,
      startLine: 0,
      endLine: 0,
      complexity: 1,
      branchCount: 0,
      maxNesting: 0,
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
  };
}

export function analyzeSourceFileStructure(filePath: string): SourceFileMetrics {
  const text = readText(filePath);
  if (!text) {
    return analyzeSourceFileStructureWithRegex(filePath);
  }

  return analyzeSourceFileStructureWithTypeScript(filePath, text) ||
    analyzeSourceFileStructureWithRegex(filePath);
}

function createResponsibilityAxisCount(
  metric: Omit<ModuleQualityMetric, 'responsibilityAxisCount' | 'mixedResponsibilities' | 'designSmellScore'>
): number {
  const axes = new Set<string>();

  if (metric.fanIn >= 6) axes.add('fan_in');
  if (metric.fanOut >= 10) axes.add('fan_out');
  if (metric.symbolCount >= 20) axes.add('symbol_density');
  if ((metric.lineCount || 0) >= 500) axes.add('module_size');
  if (metric.sourceMetrics.classCount > 0) axes.add('oop_surface');
  if (metric.sourceMetrics.topLevelFunctionCount >= 8) axes.add('procedural_surface');
  if (metric.sourceMetrics.publicMethodCount >= 8) axes.add('public_api_surface');
  if (metric.stackAwareDegree > 0) axes.add('stack_orchestration');
  if (metric.diRuntimeDegree > 0) axes.add('runtime_di');
  if (metric.contractDegree > 0) axes.add('contract_binding');
  if (metric.node.churn >= 10) axes.add('high_churn');
  if (metric.sourceMetrics.longMethods.length > 0) axes.add('long_methods');
  if (metric.sourceMetrics.complexMethods.length > 0) axes.add('complex_methods');

  return axes.size;
}

function isMixedResponsibility(
  metric: Omit<ModuleQualityMetric, 'responsibilityAxisCount' | 'mixedResponsibilities' | 'designSmellScore'>,
  axisCount: number
): boolean {
  const lineCount = metric.lineCount || 0;
  const dependencySurface = metric.fanIn + metric.fanOut;
  const runtimeSurface = metric.stackAwareDegree + metric.diRuntimeDegree + metric.contractDegree;

  return (
    (lineCount >= 450 && axisCount >= 4) ||
    (lineCount >= 320 && axisCount >= 5) ||
    (lineCount >= 140 && axisCount >= 5) ||
    (lineCount >= 100 && axisCount >= 6) ||
    (dependencySurface >= 18 && axisCount >= 4) ||
    (runtimeSurface >= 4 && axisCount >= 4)
  );
}

function calculateDesignSmellScore(
  metric: Omit<ModuleQualityMetric, 'responsibilityAxisCount' | 'mixedResponsibilities' | 'designSmellScore'>,
  responsibilityAxisCount: number,
  mixedResponsibilities: boolean
): number {
  return Math.min(
    100,
    ((metric.lineCount || 0) >= 600 ? 20 : Math.round((metric.lineCount || 0) / 40)) +
      Math.min(20, metric.symbolCount) +
      Math.min(15, metric.fanIn + metric.fanOut) +
      Math.min(15, responsibilityAxisCount * 3) +
      Math.min(15, metric.sourceMetrics.godClasses.length * 6) +
      Math.min(10, metric.sourceMetrics.longMethods.length * 3) +
      Math.min(10, metric.sourceMetrics.complexMethods.length * 3) +
      (mixedResponsibilities ? 10 : 0)
  );
}

export function analyzeModuleQuality(graph: GraphData): ModuleQualitySummary {
  const { incomingByTarget, outgoingBySource, childrenByParentId } = buildGraphAdjacency(graph);
  const metrics = graph.nodes
    .filter((node) => node.type === 'file')
    .map((node) => {
      const incomingLinks = incomingByTarget.get(node.id) || [];
      const outgoingLinks = outgoingBySource.get(node.id) || [];
      const baseMetric = {
        node,
        lineCount: getFileLineCount(node.id),
        symbolCount: getChildCodeSymbolCount(node.id, childrenByParentId),
        fanIn: incomingLinks.length,
        fanOut: outgoingLinks.length,
        stackAwareDegree: [...incomingLinks, ...outgoingLinks].filter((link) => isStackAwareLink(link))
          .length,
        diRuntimeDegree: [...incomingLinks, ...outgoingLinks].filter((link) => isDiRuntimeLink(link))
          .length,
        contractDegree: [...incomingLinks, ...outgoingLinks].filter((link) =>
          isContractSemanticLink(link)
        ).length,
        sourceMetrics: analyzeSourceFileStructure(node.id),
      };
      const responsibilityAxisCount = createResponsibilityAxisCount(baseMetric);
      const mixedResponsibilities = isMixedResponsibility(baseMetric, responsibilityAxisCount);

      return {
        ...baseMetric,
        responsibilityAxisCount,
        mixedResponsibilities,
        designSmellScore: calculateDesignSmellScore(
          baseMetric,
          responsibilityAxisCount,
          mixedResponsibilities
        ),
      } satisfies ModuleQualityMetric;
    });

  const oversizedModules = metrics
    .filter(
      (metric) =>
        ((metric.lineCount || 0) >= 600 || metric.symbolCount >= 25) &&
        (metric.lineCount !== null || metric.symbolCount > 0)
    )
    .sort(
      (left, right) =>
        (right.lineCount || right.symbolCount * 20) - (left.lineCount || left.symbolCount * 20) ||
        right.symbolCount - left.symbolCount
    )
    .slice(0, 10);

  const godFiles = metrics
    .filter(
      (metric) =>
        (metric.lineCount !== null && metric.lineCount >= 1500) ||
        metric.symbolCount >= 45 ||
        ((((metric.lineCount || 0) >= 900) || metric.symbolCount >= 30) &&
          (metric.fanIn + metric.fanOut >= 12 ||
            metric.stackAwareDegree + metric.diRuntimeDegree + metric.contractDegree >= 6 ||
            metric.node.churn >= 10 ||
            metric.sourceMetrics.godClasses.length > 0 ||
            metric.mixedResponsibilities))
    )
    .sort(
      (left, right) =>
        ((right.lineCount || 0) +
          right.symbolCount * 20 +
          (right.fanIn + right.fanOut) * 10 +
          right.responsibilityAxisCount * 15) -
          ((left.lineCount || 0) +
            left.symbolCount * 20 +
            (left.fanIn + left.fanOut) * 10 +
            left.responsibilityAxisCount * 15) ||
        left.node.label.localeCompare(right.node.label)
    )
    .slice(0, 10);

  const godClasses = metrics
    .filter((metric) => metric.sourceMetrics.godClasses.length > 0)
    .map((metric) => ({
      ...metric,
      matchedClasses: metric.sourceMetrics.godClasses,
    }))
    .sort(
      (left, right) =>
        Math.max(...right.matchedClasses.map((item) => item.lineCount + item.methodCount * 15)) -
          Math.max(...left.matchedClasses.map((item) => item.lineCount + item.methodCount * 15)) ||
        left.node.label.localeCompare(right.node.label)
    )
    .slice(0, 10);

  const longMethods = metrics
    .filter((metric) => metric.sourceMetrics.longMethods.length > 0)
    .map((metric) => ({
      ...metric,
      matchedMethods: metric.sourceMetrics.longMethods,
    }))
    .sort(
      (left, right) =>
        Math.max(...right.matchedMethods.map((item) => item.lineCount)) -
          Math.max(...left.matchedMethods.map((item) => item.lineCount)) ||
        left.node.label.localeCompare(right.node.label)
    )
    .slice(0, 10);

  const complexMethods = metrics
    .filter((metric) => metric.sourceMetrics.complexMethods.length > 0)
    .map((metric) => ({
      ...metric,
      matchedMethods: metric.sourceMetrics.complexMethods,
    }))
    .sort(
      (left, right) =>
        Math.max(
          ...right.matchedMethods.map(
            (item) => item.complexity * 10 + item.maxNesting * 5 + item.branchCount
          )
        ) -
          Math.max(
            ...left.matchedMethods.map(
              (item) => item.complexity * 10 + item.maxNesting * 5 + item.branchCount
            )
          ) ||
        left.node.label.localeCompare(right.node.label)
    )
    .slice(0, 10);

  const mixedResponsibilityModules = metrics
    .filter((metric) => metric.mixedResponsibilities)
    .sort(
      (left, right) =>
        right.responsibilityAxisCount - left.responsibilityAxisCount ||
        (right.lineCount || 0) - (left.lineCount || 0) ||
        left.node.label.localeCompare(right.node.label)
    )
    .slice(0, 10);

  return {
    metrics,
    oversizedModules,
    godFiles,
    godClasses,
    longMethods,
    complexMethods,
    mixedResponsibilityModules,
  };
}

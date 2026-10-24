/**
 * Parses a source file with the engine of its language and returns its declarations and its
 * comments. This is the only module that touches the parsers; everything after it works on
 * plain records.
 */
import ts from 'typescript';
import { getLanguageByExtension } from '../../parsing/languageRegistry';
import { getParserInstance, loadTreeSitterLanguage } from '../../parsing/treeSitterRuntime';
import type { RawComment } from './comments';
import { scanTreeComments, scanTypeScriptComments } from './commentScanners';
import type { DocEngine } from './conventions';
import type { DeclarationScan } from './declarations';
import { scanTreeDeclarations } from './declarationsTreeSitter';
import { scanTypeScriptDeclarations } from './declarationsTypeScript';
import { rulesForLanguage } from './languageRules';

/** The declarations and comments of one file. */
export interface ParsedFile {
  scan: DeclarationScan;
  comments: RawComment[];
}

/** What the parsers need to know about a file. */
export interface ParseRequest {
  file: string;
  extension: string;
  language: string;
  text: string;
}

// JavaScript may contain JSX anywhere; TypeScript only does in `.tsx` files.
const SCRIPT_KINDS = new Map<string, ts.ScriptKind>([
  ['.tsx', ts.ScriptKind.TSX],
  ['.jsx', ts.ScriptKind.JSX],
  ['.js', ts.ScriptKind.JSX],
  ['.mjs', ts.ScriptKind.JSX],
  ['.cjs', ts.ScriptKind.JSX],
]);

const scriptKindOf = (extension: string): ts.ScriptKind =>
  SCRIPT_KINDS.get(extension) ?? ts.ScriptKind.TS;

const parseTypeScript = (name: string, text: string, kind: ts.ScriptKind): ParsedFile => {
  const source = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, false, kind);
  const jsx = kind === ts.ScriptKind.TSX || kind === ts.ScriptKind.JSX;
  return {
    scan: { declarations: scanTypeScriptDeclarations(source) },
    comments: scanTypeScriptComments(source, text, jsx),
  };
};

/** The script kind a Vue `<script lang="...">` attribute selects; plain scripts are JavaScript. */
const vueScriptKind = (attributes: string): ts.ScriptKind => {
  const lang = /lang=["']?(\w+)/i.exec(attributes)?.[1]?.toLowerCase();
  if (lang === 'tsx') return ts.ScriptKind.TSX;
  return lang === 'ts' ? ts.ScriptKind.TS : ts.ScriptKind.JSX;
};

// ---- Vue --------------------------------------------------------------------------------

const SCRIPT_BLOCK = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
const LEADING_HTML_COMMENT = /^\s*<!--[\s\S]*?-->/;

const lineCountBefore = (text: string, index: number): number => {
  let lines = 0;
  for (let at = text.indexOf('\n'); at !== -1 && at < index; at = text.indexOf('\n', at + 1)) {
    lines += 1;
  }
  return lines;
};

const shiftParsed = (parsed: ParsedFile, offset: number): ParsedFile => ({
  scan: {
    declarations: parsed.scan.declarations.map((declaration) => ({
      ...declaration,
      line: declaration.line + offset,
      endLine: declaration.endLine + offset,
      anchorLine: declaration.anchorLine + offset,
    })),
  },
  comments: parsed.comments.map((comment) => ({
    ...comment,
    startLine: comment.startLine + offset,
    endLine: comment.endLine + offset,
  })),
});

/** The comment that may open a Vue single-file component, above the template. */
const leadingHtmlComment = (text: string): RawComment[] => {
  const match = LEADING_HTML_COMMENT.exec(text);
  if (!match) return [];
  const body = match[0].trimStart();
  const startLine = lineCountBefore(text, match[0].length - body.length) + 1;
  return [{ text: body, startLine, endLine: startLine + body.split('\n').length - 1, column: 0 }];
};

/** Vue components are read through their `<script>` blocks; the template has no declarations. */
const parseVue = (file: string, text: string): ParsedFile => {
  const merged: ParsedFile = { scan: { declarations: [] }, comments: leadingHtmlComment(text) };
  for (const match of text.matchAll(SCRIPT_BLOCK)) {
    const contentStart = (match.index ?? 0) + match[0].indexOf('>') + 1;
    const parsed = parseTypeScript(file, match[2], vueScriptKind(match[1]));
    const block = shiftParsed(parsed, lineCountBefore(text, contentStart));
    merged.scan.declarations.push(...block.scan.declarations);
    merged.comments.push(...block.comments);
  }
  return merged;
};

// ---- Tree-sitter ------------------------------------------------------------------------

const parseWithTreeSitter = async (request: ParseRequest): Promise<ParsedFile | null> => {
  const rules = rulesForLanguage(request.language);
  const definition = getLanguageByExtension(request.extension);
  const language = rules && definition ? await loadTreeSitterLanguage(definition) : null;
  if (!rules || !language) return null;
  const parser = await getParserInstance();
  // No await between setLanguage and parse: the parser is shared by every analysis.
  parser.setLanguage(language);
  const tree = parser.parse(request.text);
  if (!tree) return null;
  try {
    const env = { file: request.file, extension: request.extension };
    return {
      scan: scanTreeDeclarations(tree.rootNode, rules, env),
      comments: scanTreeComments(tree),
    };
  } finally {
    tree.delete();
  }
};

/** Parses a file with the engine its language uses, or returns null when it cannot be parsed. */
export const parseSource = async (
  engine: DocEngine,
  request: ParseRequest
): Promise<ParsedFile | null> => {
  if (engine === 'vue') return parseVue(request.file, request.text);
  if (engine === 'typescript') {
    return parseTypeScript(request.file, request.text, scriptKindOf(request.extension));
  }
  return parseWithTreeSitter(request);
};

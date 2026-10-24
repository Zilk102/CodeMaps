/**
 * Produces token-cheap views of source files: skeletons with function bodies removed and outlines of
 * declarations with their original line numbers.
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import { getLanguageByExtension } from '../parsing/languageRegistry';
import { loadTreeSitterLanguage, getParserInstance } from '../parsing/treeSitterRuntime';
import { Query } from 'web-tree-sitter';
import {
  getExtensionForLanguageId,
  getFunctionBodyQuery,
  getHiddenCommentForLanguage,
  isJsOrTsExtension,
} from './skeletonLanguageTables';
import { buildOutline, type SkeletonOutlineEntry } from './skeletonOutline';
import { buildTypeScriptSkeleton } from './skeletonTypeScript';

export type { SkeletonOutlineEntry };

/**
 * Builds skeletons and outlines of source files so an agent can read a file's shape without its bodies.
 */
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
    if (isJsOrTsExtension(ext)) {
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

  /**
   * Tree-sitter skeleton for non-TS languages: finds function body ranges with the language's query and
   * replaces them with a placeholder comment. Returns the code unchanged if the grammar, parser or query
   * is unavailable.
   */
  private async generateSkeletonWithTreeSitter(code: string, languageId: string): Promise<string> {
    const languageDef = getLanguageByExtension(getExtensionForLanguageId(languageId));
    if (!languageDef) return code;

    const tsLanguage = await loadTreeSitterLanguage(languageDef);
    if (!tsLanguage) return code;

    const parser = await getParserInstance();
    parser.setLanguage(tsLanguage);
    const tree = parser.parse(code);
    if (!tree) return code;

    const queryString = getFunctionBodyQuery(languageId);
    if (!queryString) return code;

    const query = new Query(tsLanguage, queryString);
    const bodies = query
      .matches(tree.rootNode)
      .flatMap((m) => m.captures)
      .filter((capture) => capture.name === 'body')
      .map((capture) => capture.node);

    return this.replaceBodies(code, bodies, getHiddenCommentForLanguage(languageId));
  }

  /**
   * Replaces each captured body range. Captures are applied from bottom to top so earlier
   * indices stay valid; only function bodies are captured (not class bodies), so inner
   * definitions are not wiped out.
   */
  private replaceBodies(
    code: string,
    bodies: Array<{ startIndex: number; endIndex: number }>,
    replacement: string
  ): string {
    let result = code;
    const ordered = [...bodies].sort((a, b) => b.startIndex - a.startIndex);
    for (const body of ordered) {
      result = result.slice(0, body.startIndex) + replacement + result.slice(body.endIndex);
    }
    return result;
  }

  /**
   * Lists declarations with their original line numbers, since the skeleton text no longer
   * lines up with the file. TS/JS only; other languages return an empty outline.
   */
  public async generateOutline(filePath: string): Promise<SkeletonOutlineEntry[]> {
    const ext = path.extname(filePath).toLowerCase();
    if (!isJsOrTsExtension(ext)) return [];
    const code = await fs.readFile(filePath, 'utf-8');
    return this.generateOutlineFromCode(code, filePath);
  }

  /**
   * Outline of declarations in already loaded TS/JS source; `fileName` only selects the parser dialect.
   */
  public generateOutlineFromCode(
    code: string,
    fileName: string = 'file.ts'
  ): SkeletonOutlineEntry[] {
    return buildOutline(code, fileName);
  }

  /** Skeleton of already loaded TS/JS source; `fileName` only selects the parser dialect. */
  public generateSkeletonFromCode(code: string, fileName: string = 'file.ts'): string {
    return buildTypeScriptSkeleton(code, fileName);
  }
}

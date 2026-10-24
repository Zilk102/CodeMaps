// Per-language tables used when hiding function bodies with Tree-Sitter.

export const JS_TS_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs'];

const EXTENSION_BY_LANGUAGE_ID: Record<string, string> = {
  python: '.py',
  go: '.go',
  rust: '.rs',
  java: '.java',
  cpp: '.cpp',
  c_sharp: '.cs',
  php: '.php',
  ruby: '.rb',
  swift: '.swift',
  kotlin: '.kt',
  javascript: '.js',
  typescript: '.ts',
  tsx: '.tsx',
};

const FUNCTION_BODY_QUERIES: Record<string, string> = {
  python: `
          (function_definition body: (block) @body)
        `,
  rust: `
          (function_item body: (block) @body)
        `,
  java: `
          (method_declaration body: (block) @body)
          (constructor_declaration body: (constructor_body) @body)
        `,
  cpp: `
          (function_definition body: (compound_statement) @body)
        `,
  c_sharp: `
          (method_declaration body: (block) @body)
          (constructor_declaration body: (block) @body)
        `,
  go: `
          (function_declaration body: (block) @body)
          (method_declaration body: (block) @body)
        `,
  php: `
          (method_declaration body: (compound_statement) @body)
          (function_definition body: (compound_statement) @body)
        `,
  ruby: `
          (method (body_statement) @body)
          (singleton_method (body_statement) @body)
        `,
  swift: `
          (function_declaration body: (code_block) @body)
          (init_declaration body: (code_block) @body)
        `,
  kotlin: `
          (function_declaration body: (block) @body)
        `,
};

/**
 * Whether `ext` (with the dot, lower-case) is a TypeScript or JavaScript file handled by the compiler API.
 */
export function isJsOrTsExtension(ext: string): boolean {
  return JS_TS_EXTENSIONS.includes(ext);
}

/**
 * File extension that selects the grammar for a tree-sitter language id; '.txt' when the id is unknown.
 */
export function getExtensionForLanguageId(languageId: string): string {
  return EXTENSION_BY_LANGUAGE_ID[languageId] ?? '.txt';
}

/**
 * Placeholder that replaces a function body: a `pass` line for indentation-based languages, a
 * commented empty block for brace languages.
 */
export function getHiddenCommentForLanguage(languageId: string): string {
  return languageId === 'python' || languageId === 'ruby'
    ? ' pass # implementation hidden '
    : '{ /* implementation hidden */ }';
}

/**
 * Tree-sitter query capturing function bodies as `@body`, or null when the language has no skeleton support.
 */
export function getFunctionBodyQuery(languageId: string): string | null {
  return Object.prototype.hasOwnProperty.call(FUNCTION_BODY_QUERIES, languageId)
    ? FUNCTION_BODY_QUERIES[languageId]
    : null;
}

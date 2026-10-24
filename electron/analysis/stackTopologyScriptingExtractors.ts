/**
 * Regex extractors for Python, Ruby and PHP source: function names, route targets and controller references.
 */
import { uniqueCaptures } from './stackTopologyExtractorBase';

/** Names of Python `def` and `async def` functions, without duplicates. */
export const extractPythonFunctionNames = (text: string) =>
  uniqueCaptures(text, [/\b(?:async\s+def|def)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g]);

/** Names of functions decorated as FastAPI routes (`@app.get(...)`, `@router.post(...)`, ...). */
export const extractFastApiRouteFunctions = (text: string) =>
  uniqueCaptures(text, [
    /@(?:[A-Za-z_][A-Za-z0-9_]*)\.(?:get|post|put|patch|delete|options|head|api_route)\s*\([^)]*\)\s*(?:async\s+def|def)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
  ]);

/**
 * View names that Django `path()`/`re_path()` entries point at, with `.as_view` and module prefixes
 * removed; `include(...)` entries are left out.
 */
export const extractDjangoUrlTargets = (text: string) =>
  Array.from(
    new Set(
      Array.from(text.matchAll(/\b(?:path|re_path)\s*\([^,]+,\s*([A-Za-z_][A-Za-z0-9_.]*)/g))
        .map((match) => match[1])
        .filter((value): value is string => Boolean(value))
        .map(
          (value) =>
            value
              .replace(/\.as_view$/, '')
              .split('.')
              .pop() || value
        )
        .filter((value) => value !== 'include')
    )
  );

/** Resource names declared by Rails `resources :name` / `resource :name` routes. */
export const extractRailsResourceTargets = (text: string) =>
  uniqueCaptures(text, [/\bresources?\s+:([A-Za-z_][A-Za-z0-9_]*)/g]);

/**
 * Laravel controller classes referenced as `Foo::class` or in the `'FooController@action'` form.
 */
export const extractLaravelControllerTargets = (text: string) =>
  uniqueCaptures(text, [
    /([A-Z][A-Za-z0-9_]*Controller)::class/g,
    /['"]([A-Z][A-Za-z0-9_]*Controller)@/g,
  ]);

/** Names of Ruby methods defined with `def`, including names ending in `?`, `!` or `=`. */
export const extractRubyMethodNames = (text: string) =>
  uniqueCaptures(text, [/\bdef\s+([A-Za-z_][A-Za-z0-9_!?=]*)/g]);

/** Names of PHP functions and methods declared with `function`, regardless of visibility. */
export const extractPhpMethodNames = (text: string) =>
  uniqueCaptures(text, [
    /\b(?:public|protected|private)?\s*function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
  ]);

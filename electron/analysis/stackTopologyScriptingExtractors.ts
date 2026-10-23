import { uniqueCaptures } from './stackTopologyExtractorBase';

export const extractPythonFunctionNames = (text: string) =>
  uniqueCaptures(text, [/\b(?:async\s+def|def)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g]);

export const extractFastApiRouteFunctions = (text: string) =>
  uniqueCaptures(text, [
    /@(?:[A-Za-z_][A-Za-z0-9_]*)\.(?:get|post|put|patch|delete|options|head|api_route)\s*\([^)]*\)\s*(?:async\s+def|def)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
  ]);

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

export const extractRailsResourceTargets = (text: string) =>
  uniqueCaptures(text, [/\bresources?\s+:([A-Za-z_][A-Za-z0-9_]*)/g]);

export const extractLaravelControllerTargets = (text: string) =>
  uniqueCaptures(text, [
    /([A-Z][A-Za-z0-9_]*Controller)::class/g,
    /['"]([A-Z][A-Za-z0-9_]*Controller)@/g,
  ]);

export const extractRubyMethodNames = (text: string) =>
  uniqueCaptures(text, [/\bdef\s+([A-Za-z_][A-Za-z0-9_!?=]*)/g]);

export const extractPhpMethodNames = (text: string) =>
  uniqueCaptures(text, [
    /\b(?:public|protected|private)?\s*function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
  ]);

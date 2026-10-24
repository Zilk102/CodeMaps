/**
 * Source-text extractors for framework adapters (routes, handlers, layouts); re-exports the per-language extractors.
 */
import { extractMethodNames } from './stackTopologyExtractorBase';

export * from './stackTopologyExtractorBase';
export * from './stackTopologyJvmExtractors';
export * from './stackTopologyScriptingExtractors';
export * from './stackTopologySystemsExtractors';

/**
 * Next.js `layout.*` files that wrap a page, from the app root down to the page's own directory,
 * outermost first. Only files under `app/` count and API routes have no layouts; `allLayouts` holds
 * root-relative layout paths.
 */
export const getNearestNextLayouts = (routeFile: string, allLayouts: Set<string>) => {
  if (!routeFile.startsWith('app/') || routeFile.includes('/api/')) {
    return [];
  }

  const routeDir = routeFile.slice(0, routeFile.lastIndexOf('/'));
  const segments = routeDir.split('/');
  const layouts: string[] = [];

  for (let i = 1; i <= segments.length; i++) {
    const prefix = segments.slice(0, i).join('/');
    for (const extension of ['tsx', 'ts', 'jsx', 'js']) {
      const candidate = `${prefix}/layout.${extension}`;
      if (allLayouts.has(candidate)) {
        layouts.push(candidate);
      }
    }
  }

  return Array.from(new Set(layouts));
};

/**
 * Names of methods decorated with a NestJS HTTP verb decorator (`@Get()`, `@Post('x')`, ...), sorted.
 */
export const extractNestRouteMethods = (text: string) =>
  extractMethodNames(text, [
    /@(?:Get|Post|Put|Patch|Delete|Options|Head|All)\s*\([^)]*\)\s*(?:public|private|protected|async|static|\s)*([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
    /@(?:Get|Post|Put|Patch|Delete|Options|Head|All)\s*\(\)\s*(?:public|private|protected|async|static|\s)*([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
  ]);

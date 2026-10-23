import { extractMethodNames } from './stackTopologyExtractorBase';

export * from './stackTopologyExtractorBase';
export * from './stackTopologyJvmExtractors';
export * from './stackTopologyScriptingExtractors';
export * from './stackTopologySystemsExtractors';

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

export const extractNestRouteMethods = (text: string) =>
  extractMethodNames(text, [
    /@(?:Get|Post|Put|Patch|Delete|Options|Head|All)\s*\([^)]*\)\s*(?:public|private|protected|async|static|\s)*([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
    /@(?:Get|Post|Put|Patch|Delete|Options|Head|All)\s*\(\)\s*(?:public|private|protected|async|static|\s)*([A-Za-z_][A-Za-z0-9_]*)\s*\(/g,
  ]);

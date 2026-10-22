import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveWorkerScript } from '../KuzuGraphService';

describe('resolveWorkerScript', () => {
  it('points a packaged build at the unpacked copy that system Node can read', () => {
    const packaged = path.join('resources', 'app.asar', 'dist-electron', 'services');
    expect(resolveWorkerScript(packaged)).toBe(
      path.join(
        'resources',
        'app.asar.unpacked',
        'dist-electron',
        'services',
        'KuzuNativeProcess.js'
      )
    );
  });

  it('leaves a development path untouched', () => {
    const dev = path.join('repo', 'dist-electron', 'services');
    expect(resolveWorkerScript(dev)).toBe(path.join(dev, 'KuzuNativeProcess.js'));
  });
});

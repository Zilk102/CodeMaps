import { describe, expect, it } from 'vitest';
import type { GraphData } from '../../store/types';
import {
  computeFileCoupling,
  computeNodeFanIn,
  declaresWiring,
  isCompositionRoot,
  isSharedByDesign,
} from '../couplingMetrics';
import { validateChanges } from '../ChangeValidationService';
import type { DetectedPattern } from '../patternDetectionTypes';

const link = (source: string, target: string, reason?: string) => ({
  source,
  target,
  value: 1,
  type: 'import',
  reason,
});

describe('computeFileCoupling', () => {
  const graph = {
    projectRoot: '/p',
    nodes: [],
    links: [
      // One file using four symbols of another is a single dependency.
      link('/p/a/a.go', '/p/b/b.go#One'),
      link('/p/a/a.go', '/p/b/b.go#Two'),
      link('/p/a/a.go', '/p/b/b.go#Three'),
      link('/p/a/a.go', '/p/b/b.go#Four'),
      link('/p/c/c.go', '/p/b/b.go#One'),
      link('/p/a/a.go', '/p/a/sibling.go#Helper', 'go:same package'),
    ],
  } as unknown as GraphData;

  it('counts distinct files instead of links', () => {
    const coupling = computeFileCoupling(graph);
    expect(coupling.get('/p/b/b.go')?.fanIn).toBe(2);
    expect(coupling.get('/p/a/a.go')?.fanOut).toBe(1.25);
  });

  it('weighs references that need no import (same package) at a quarter', () => {
    const coupling = computeFileCoupling(graph);
    expect(coupling.get('/p/a/sibling.go')?.fanIn).toBe(0.25);
  });

  it('reaches a file through its symbols for node fan-in', () => {
    const fanIn = computeNodeFanIn(graph);
    expect(fanIn.get('/p/b/b.go')).toBe(2);
    expect(fanIn.get('/p/b/b.go#One')).toBe(2);
    expect(fanIn.get('/p/b/b.go#Two')).toBe(1);
  });
});

describe('isSharedByDesign', () => {
  it('recognises code that is meant to be used everywhere', () => {
    expect(isSharedByDesign('/p/internal/helpers.go')).toBe(true);
    expect(isSharedByDesign('/p/src/utils/format.ts#format')).toBe(true);
    expect(isSharedByDesign('/p/internal/domain/user.go#User')).toBe(true);
    expect(isSharedByDesign('/p/src/constants.ts')).toBe(true);
    expect(isSharedByDesign('/p/internal/auth.go')).toBe(false);
    expect(isSharedByDesign('/p/src/services/billing.ts')).toBe(false);
  });
});

describe('validateChanges with hub nodes', () => {
  const hub: DetectedPattern = {
    id: 'hub_nodes',
    severity: 'high',
    title: 'Hub Nodes',
    description: 'many files depend on it',
    nodeIds: ['/p/internal/auth.go'],
  } as DetectedPattern;

  it('keeps a hub as advice instead of blocking the change', () => {
    const result = validateChanges({
      patterns: [hub],
      changedFiles: ['/p/internal/auth.go'],
      healthScore: 80,
    });
    expect(result.findings.map((finding) => finding.id)).toEqual(['hub_nodes']);
    expect(result.isValid).toBe(true);
  });

  it('still blocks on a problem the author can fix', () => {
    const result = validateChanges({
      patterns: [{ ...hub, id: 'god_files', title: 'God Files' } as DetectedPattern],
      changedFiles: ['/p/internal/auth.go'],
      healthScore: 80,
    });
    expect(result.isValid).toBe(false);
  });
});

describe('isCompositionRoot', () => {
  it('recognises entry points that wire the program together', () => {
    expect(isCompositionRoot('/p/cmd/app/main.go')).toBe(true);
    expect(isCompositionRoot('/p/src/main.rs')).toBe(true);
    expect(isCompositionRoot('/p/app/__main__.py')).toBe(true);
    expect(isCompositionRoot('/p/src/App/Program.cs')).toBe(true);
    expect(isCompositionRoot('/p/src/ShopApplication.java')).toBe(true);
    expect(isCompositionRoot('/p/internal/service/main_helper.go')).toBe(false);
    expect(isCompositionRoot('/p/internal/auth.go')).toBe(false);
  });
});

describe('declaresWiring', () => {
  it('recognises files that build the object graph or the routes', () => {
    const fn = (label: string) => ({ label, type: 'function' });
    expect(declaresWiring([fn('Handler.Register'), fn('helper')])).toBe(true);
    expect(declaresWiring([fn('New')])).toBe(true);
    expect(declaresWiring([fn('create_app')])).toBe(true);
    expect(declaresWiring([fn('registerRoutes')])).toBe(true);
    expect(declaresWiring([fn('Newton'), fn('renew')])).toBe(false);
    expect(declaresWiring([{ label: 'New', type: 'class' }])).toBe(false);
  });
});

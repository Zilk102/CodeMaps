import { describe, expect, it } from 'vitest';
import { dedupeRecentProjects, projectPathKey } from '../recentProjects';

const project = (path: string, lastOpened: string) => ({ path, name: 'CodeMaps', lastOpened });

describe('recent project identity', () => {
  it('treats paths that differ only by case or slash style as one project', () => {
    expect(projectPathKey('D:/PROJECT/CodeMaps')).toBe(
      projectPathKey(String.raw`d:\project\codemaps`)
    );
  });

  it('keeps the most recently opened entry of duplicates and orders by recency', () => {
    const result = dedupeRecentProjects([
      project('d:/PROJECT/CodeMaps', '2026-09-17T10:00:00.000Z'),
      project('D:/PROJECT/aistory-game', '2026-09-25T10:00:00.000Z'),
      project('D:/PROJECT/CodeMaps', '2026-10-22T10:00:00.000Z'),
    ]);

    expect(result.map((item) => item.path)).toEqual([
      'D:/PROJECT/CodeMaps',
      'D:/PROJECT/aistory-game',
    ]);
  });
});

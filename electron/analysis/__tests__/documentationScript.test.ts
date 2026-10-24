import { describe, expect, it } from 'vitest';
import { analyze, repeatLines, source, symbolNamed, verdicts } from './documentationTestKit';

const LONG_BODY = repeatLines(10, (i) => `  total += ${i};`);

describe('TypeScript documentation', () => {
  it('requires JSDoc on exported symbols and accepts a block directly above', async () => {
    const result = await analyze(
      '/p/service.ts',
      source(
        '/** Reads and validates the configuration file. */',
        'export function loadConfig(path: string) {',
        '  return path;',
        '}',
        '',
        'export function undocumented() {',
        '  return 1;',
        '}',
        '',
        '// A line comment is not JSDoc for this function.',
        'export function lineCommentOnly() {',
        '  return 2;',
        '}',
        '',
        '/** Separated from its function by a blank line. */',
        '',
        'export function detached() {',
        '  return 3;',
        '}'
      )
    );
    expect(verdicts(result)).toEqual([
      'loadConfig:function:ERD',
      'undocumented:function:ER-',
      'lineCommentOnly:function:ER-',
      'detached:function:ER-',
    ]);
  });

  it('treats short private functions as exempt and long ones as required', async () => {
    const result = await analyze(
      '/p/helpers.ts',
      source(
        'function shortHelper() {',
        '  return 1;',
        '}',
        '',
        'function longHelper() {',
        '  let total = 0;',
        ...LONG_BODY,
        '  return total;',
        '}',
        '',
        '/** Sums the numbers that the helper produced. */',
        'function documentedLong() {',
        '  let total = 0;',
        ...LONG_BODY,
        '  return total;',
        '}'
      )
    );
    expect(verdicts(result)).toEqual([
      'shortHelper:function:---',
      'longHelper:function:-R-',
      'documentedLong:function:-RD',
    ]);
  });

  it('covers classes, members, interfaces, type aliases, enums and arrow functions', async () => {
    const result = await analyze(
      '/p/model.ts',
      source(
        '/** Coordinates the polling of remote sources. */',
        'export class Poller {',
        '  /** Starts the background polling loop. */',
        '  start() {}',
        '  stop() {}',
        '  private hidden() {}',
        '  protected guarded() {}',
        '  #secret() {}',
        '  constructor() {}',
        '}',
        'class Internal {',
        '  run() {}',
        '}',
        'export interface Options {}',
        'export type Mode = "a" | "b";',
        'export enum Level {',
        '  Low,',
        '}',
        'export const handler = () => {};',
        '/** Handles one incoming request and replies. */',
        'export const documented = async () => {};'
      )
    );
    expect(verdicts(result)).toEqual([
      'Poller:class:ERD',
      'start:method:ERD',
      'stop:method:ER-',
      'hidden:method:---',
      'guarded:method:---',
      '#secret:method:---',
      'Internal:class:---',
      'run:method:---',
      'Options:interface:ER-',
      'Mode:type:ER-',
      'Level:enum:ER-',
      'handler:function:ER-',
      'documented:function:ERD',
    ]);
  });

  it('honors export lists, default exports and CommonJS exports', async () => {
    const result = await analyze(
      '/p/exports.js',
      source(
        'function listed() {}',
        'function renamedInside() {}',
        'function viaModule() {}',
        'function viaObject() {}',
        'function notExported() {}',
        'export { listed, renamedInside as publicName };',
        'module.exports = viaModule;',
        'module.exports = { viaObject };'
      )
    );
    expect(verdicts(result)).toEqual([
      'listed:function:ER-',
      'renamedInside:function:ER-',
      'viaModule:function:ER-',
      'viaObject:function:ER-',
      'notExported:function:---',
    ]);
  });

  it('reads decorators, overloads and abstract methods', async () => {
    const result = await analyze(
      '/p/decorated.ts',
      source(
        '/** A component that renders the dashboard. */',
        '@Component({ selector: "x" })',
        'export class Dashboard {',
        '  abstractLike() {}',
        '}',
        'export function overloaded(a: string): string;',
        'export function overloaded(a: number): number;',
        'export function overloaded(a: any) {',
        '  return a;',
        '}',
        'export abstract class Shape {',
        '  abstract area(): number;',
        '  override toString() {',
        '    return "";',
        '  }',
        '}'
      )
    );
    expect(verdicts(result)).toEqual([
      'Dashboard:class:ERD',
      'abstractLike:method:ER-',
      'overloaded:function:ER-',
      'Shape:class:ER-',
      'area:method:ER-',
      'toString:method:E--',
    ]);
  });

  it('analyzes TSX and JSX components, ignoring // inside JSX text', async () => {
    const result = await analyze(
      '/p/view.tsx',
      source(
        '/** Renders the greeting banner of the page. */',
        'export const Banner = () => <a href="x">see http://example.com/docs</a>;',
        'export function Plain() {',
        '  return <div>// TODO later</div>;',
        '}'
      )
    );
    expect(result.unownedTodos).toEqual([]);
    expect(verdicts(result)).toEqual(['Banner:function:ERD', 'Plain:function:ER-']);
    expect(result.language).toBe('tsx');
  });

  it('analyzes JavaScript files', async () => {
    const result = await analyze(
      '/p/util.js',
      source(
        '/** Joins the parts with a separator. */',
        'export function join(parts) {',
        '  return parts.join(",");',
        '}',
        'export class Box {}'
      )
    );
    expect(verdicts(result)).toEqual(['join:function:ERD', 'Box:class:ER-']);
    expect(result.language).toBe('javascript');
  });

  it('judges the header: block comment on top, not a license, not attached', async () => {
    const withHeader = await analyze(
      '/p/a.ts',
      source(
        '/**',
        ' * Parses configuration files and merges their defaults.',
        ' */',
        'import fs from "fs";',
        ...repeatLines(14, (i) => `export const value${i} = ${i};`)
      )
    );
    const license = await analyze(
      '/p/b.ts',
      source(
        '/* Copyright 2024 Example Corp. All rights reserved. */',
        'import fs from "fs";',
        ...repeatLines(14, (i) => `export const value${i} = ${i};`)
      )
    );
    const attached = await analyze(
      '/p/c.ts',
      source(
        'import fs from "fs";',
        ...repeatLines(14, (i) => `export const value${i} = ${i};`),
        '/** Documents only the function below it. */',
        'export function f() {}'
      )
    );
    const tiny = await analyze('/p/d.ts', source('export const a = 1;'));
    expect(withHeader.header).toBe('documented');
    expect(license.header).toBe('missing');
    expect(attached.header).toBe('missing');
    expect(tiny.header).toBe('n/a');
  });

  it('does not mistake strings, templates and regular expressions for comments', async () => {
    const result = await analyze(
      '/p/strings.ts',
      source(
        'const url = "http://example.com"; // TODO: tidy',
        'const tpl = `a // ${url} // b`;',
        'const re = /\\/\\//g;',
        'const half = 4 / 2; // done'
      )
    );
    expect(result.unownedTodos).toEqual([{ line: 1, tag: 'TODO' }]);
  });
});

describe('Vue documentation', () => {
  it('reads the script blocks and the leading HTML comment', async () => {
    const result = await analyze(
      '/p/Panel.vue',
      source(
        '<!-- Panel that lists the pending jobs of a queue. -->',
        '<template>',
        '  <div>{{ title }}</div>',
        '</template>',
        '',
        '<script setup lang="ts">',
        'import { ref } from "vue";',
        '/** Formats the title shown in the panel header. */',
        'export function formatTitle(name: string) {',
        '  return name;',
        '}',
        'export function raw() {}',
        '</script>',
        '<style>',
        '.a { color: red; }',
        '</style>'
      )
    );
    expect(result.language).toBe('vue');
    expect(result.header).toBe('documented');
    expect(verdicts(result)).toEqual(['formatTitle:function:ERD', 'raw:function:ER-']);
    expect(symbolNamed(result, 'raw').line).toBe(12);
  });
});

/**
 * Test kit that builds a small real project on disk (files plus a matching graph), so the config,
 * baseline and ratchet tests exercise the same file-reading analyses the app runs.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { GraphData } from '../../store/types';
import { clearProjectConfigCache } from '../projectConfig/configLoader';

/** A throwaway project directory with helpers to write files and describe it as a graph. */
export class TestProject {
  readonly root: string;
  private readonly files = new Set<string>();

  constructor() {
    this.root = fs.mkdtempSync(path.join(os.tmpdir(), 'codemaps-project-')).replace(/\\/g, '/');
    clearProjectConfigCache();
  }

  /** Writes a project file (parents created) and remembers it as a graph file node. */
  write(relative: string, text: string): string {
    const file = `${this.root}/${relative}`;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    this.files.add(file);
    return file;
  }

  /** Writes `.codemaps/<name>` with the JSON text (not remembered as a source file). */
  writeCodemaps(name: string, text: string): void {
    const file = `${this.root}/.codemaps/${name}`;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    clearProjectConfigCache();
  }

  /** The project as the graph the analyses read: one file node per written source file. */
  graph(): GraphData {
    return {
      projectRoot: this.root,
      links: [],
      nodes: [...this.files].map((file) => ({
        id: file,
        label: path.basename(file),
        group: 0,
        type: 'file',
        churn: 0,
      })),
    };
  }

  /** Deletes the directory. */
  dispose(): void {
    fs.rmSync(this.root, { recursive: true, force: true });
    clearProjectConfigCache();
  }
}

/**
 * Source text of an exported function that is `lines` lines long (its signature and closing brace
 * included), so a test can state exactly which size limit it crosses.
 */
export const functionOfLines = (name: string, lines: number): string =>
  [
    `export function ${name}(value: number) {`,
    ...Array.from({ length: lines - 2 }, (_, index) => `  value += ${index};`),
    '  return value;',
    '}',
    '',
  ].join('\n');

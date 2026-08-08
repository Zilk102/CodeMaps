import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import { Query } from 'web-tree-sitter';
import { getAllLanguageDefinitions, getLanguageById } from '../languageRegistry';
import { parseFile } from '../parseFile';
import { getParserInstance, loadTreeSitterLanguage } from '../treeSitterRuntime';

const treeSitterDefinitions = getAllLanguageDefinitions().filter(
  (definition) => definition.parserEngine === 'tree-sitter' && definition.wasmName && definition.query
);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codemaps-queries-'));

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

const parseSource = async (languageId: string, fileName: string, source: string) => {
  const filePath = path.join(tempDir, fileName);
  fs.writeFileSync(filePath, source);
  const result = await parseFile({ filePath, baseDir: tempDir });
  expect(result.detectedLanguage).toBe(languageId);
  return result;
};

describe('tree-sitter queries', () => {
  // A query that does not compile makes the adapter throw, which the indexer only
  // surfaces as a retry warning before dropping the file, so every language would
  // silently lose its entities without this check.
  it.each(treeSitterDefinitions.map((definition) => [definition.id, definition] as const))(
    'compiles the %s query against its grammar',
    async (_id, definition) => {
      await getParserInstance();
      const language = await loadTreeSitterLanguage(definition);
      expect(language).not.toBeNull();
      expect(() => new Query(language!, definition.query!)).not.toThrow();
    }
  );

  it('declares a query for every structural language', () => {
    for (const definition of getAllLanguageDefinitions()) {
      if (definition.parserEngine !== 'tree-sitter') continue;
      expect(getLanguageById(definition.id)?.query, `${definition.id} is missing a query`).toBeTruthy();
    }
  });
});

describe('structural extraction', () => {
  it('extracts C# usings, types, members and calls', async () => {
    const result = await parseSource(
      'c_sharp',
      'Service.cs',
      [
        'using System;',
        'using System.Collections.Generic;',
        'namespace App {',
        '  public class UserService {',
        '    private int counter;',
        '    public void Register() { Validate(); this.Persist(); }',
        '  }',
        '}',
      ].join('\n')
    );

    expect(result.imports.map((entry) => entry.path)).toEqual(
      expect.arrayContaining(['System', 'System.Collections.Generic'])
    );
    expect(result.entities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'class', name: 'UserService' }),
        expect.objectContaining({ type: 'function', name: 'Register' }),
      ])
    );
    expect(result.variables).toContain('counter');
    expect(result.calls).toEqual(expect.arrayContaining(['Validate', 'Persist']));
  });

  it('extracts PHP classes, methods and calls', async () => {
    const result = await parseSource(
      'php',
      'Service.php',
      [
        '<?php',
        'namespace App;',
        'class UserService {',
        '    public $counter = 0;',
        '    public function register() { validate(); $this->persist(); }',
        '}',
      ].join('\n')
    );

    expect(result.entities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'class', name: 'UserService' }),
        expect.objectContaining({ type: 'function', name: 'register' }),
      ])
    );
    expect(result.variables).toContain('counter');
    expect(result.calls).toEqual(expect.arrayContaining(['validate', 'persist']));
  });

  it('extracts Kotlin imports, declarations and calls', async () => {
    const result = await parseSource(
      'kotlin',
      'Service.kt',
      [
        'package app',
        'import app.model.User',
        'class UserService {',
        '    val counter = 0',
        '    fun register() { validate(); this.persist() }',
        '}',
        'object Registry',
      ].join('\n')
    );

    expect(result.imports.map((entry) => entry.path)).toContain('app.model.User');
    expect(result.entities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'class', name: 'UserService' }),
        expect.objectContaining({ type: 'class', name: 'Registry' }),
        expect.objectContaining({ type: 'function', name: 'register' }),
      ])
    );
    expect(result.variables).toContain('counter');
    expect(result.calls).toEqual(expect.arrayContaining(['validate', 'persist']));
  });

  it('extracts Swift imports, declarations and calls', async () => {
    const result = await parseSource(
      'swift',
      'Service.swift',
      [
        'import Foundation',
        'protocol Persisting {}',
        'struct UserService {',
        '    var counter = 0',
        '    func register() { validate(); self.persist() }',
        '}',
      ].join('\n')
    );

    expect(result.imports.map((entry) => entry.path)).toContain('Foundation');
    expect(result.entities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'class', name: 'UserService' }),
        expect.objectContaining({ type: 'class', name: 'Persisting' }),
        expect.objectContaining({ type: 'function', name: 'register' }),
      ])
    );
    expect(result.variables).toContain('counter');
    expect(result.calls).toEqual(expect.arrayContaining(['validate', 'persist']));
  });

  it('extracts Zig imports, containers and calls', async () => {
    const result = await parseSource(
      'zig',
      'service.zig',
      [
        'const std = @import("std");',
        'const UserService = struct { counter: i32 };',
        'fn register() void { validate(); std.debug.print("x", .{}); }',
      ].join('\n')
    );

    expect(result.imports.map((entry) => entry.path)).toContain('std');
    expect(result.entities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'class', name: 'UserService' }),
        expect.objectContaining({ type: 'function', name: 'register' }),
      ])
    );
    expect(result.calls).toEqual(expect.arrayContaining(['validate', 'print']));
  });

  it('extracts Python and Go structure', async () => {
    const python = await parseSource(
      'python',
      'service.py',
      ['import os', 'class UserService:', '    def register(self):', '        validate()'].join('\n')
    );
    expect(python.entities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'class', name: 'UserService' }),
        expect.objectContaining({ type: 'function', name: 'register' }),
      ])
    );
    expect(python.calls).toContain('validate');

    const go = await parseSource(
      'go',
      'service.go',
      ['package app', 'import "fmt"', 'func Register() { fmt.Println("x") }'].join('\n')
    );
    expect(go.entities).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'function', name: 'Register' })])
    );
    expect(go.imports.map((entry) => entry.path)).toContain('fmt');
  });
});

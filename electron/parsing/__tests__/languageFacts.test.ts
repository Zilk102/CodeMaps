import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import { parseFile } from '../parseFile';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codemaps-facts-'));

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

const parse = async (fileName: string, source: string) => {
  const filePath = path.join(tempDir, fileName);
  fs.writeFileSync(filePath, source);
  return parseFile({ filePath, baseDir: tempDir });
};

const names = (entities: Array<{ name: string }>) => entities.map((entity) => entity.name);

describe('Go facts', () => {
  const source = [
    'package handler',
    '',
    'import (',
    '\t"fmt"',
    '\tm "rf-war/internal/domain"',
    '\t. "rf-war/pkg/hex"',
    '\t_ "github.com/lib/pq"',
    ')',
    '',
    'type Reader interface{ Read() }',
    'type ID int',
    'type User struct{ Name string }',
    '',
    'func (h *Handler) Get(x m.User) *domain.City {',
    '\tfmt.Println(x)',
    '\treturn &User{}',
    '}',
    'func New() *Handler { return nil }',
  ].join('\n');

  it('records the package, aliases and every import', async () => {
    const { resolution, imports } = await parse('handler.go', source);
    expect(imports).toEqual([]);
    expect(resolution?.packageName).toBe('handler');
    expect(resolution?.imports).toEqual([
      { path: 'fmt', importedEntities: [] },
      { path: 'rf-war/internal/domain', importedEntities: [], alias: 'm' },
      { path: 'rf-war/pkg/hex', importedEntities: [], alias: '.' },
      { path: 'github.com/lib/pq', importedEntities: [], alias: '_' },
    ]);
  });

  it('declares interfaces and named types, and names methods after their receiver', async () => {
    const { entities } = await parse('handler.go', source);
    expect(names(entities)).toEqual(
      expect.arrayContaining(['Reader', 'ID', 'User', 'Handler.Get', 'New'])
    );
  });

  it('collects qualified uses and unqualified names', async () => {
    const { resolution } = await parse('handler.go', source);
    expect(resolution?.qualifiedUses).toEqual(
      expect.arrayContaining([
        { qualifier: 'fmt', name: 'Println' },
        { qualifier: 'm', name: 'User' },
        { qualifier: 'domain', name: 'City' },
      ])
    );
    expect(resolution?.usedNames).toContain('User');
    expect(resolution?.usedNames).toContain('Handler');
  });
});

describe('Python facts', () => {
  const source = [
    'import os, a.b as c',
    'from . import x, y as z',
    'from .pkg.mod import (A, B as C)',
    'from ..up import *',
    'from pkg import sub',
    '',
    'class K(Base):',
    '    def m(self):',
    '        return c.run()',
    '',
    'def f():',
    '    def inner(): pass',
  ].join('\n');

  it('keeps relative dots, aliases and wildcard imports', async () => {
    const { resolution } = await parse('mod.py', source);
    expect(resolution?.imports).toEqual([
      { path: 'os', importedEntities: [] },
      { path: 'a.b', importedEntities: [], alias: 'c' },
      { path: '.', importedEntities: ['x', 'y'] },
      { path: '.pkg.mod', importedEntities: ['A', 'B'] },
      { path: '..up', importedEntities: ['*'] },
      { path: 'pkg', importedEntities: ['sub'] },
    ]);
  });

  it('names methods after their class and ignores nested functions', async () => {
    const { entities, resolution } = await parse('mod.py', source);
    expect(names(entities)).toEqual(['K', 'K.m', 'f']);
    expect(resolution?.qualifiedUses).toContainEqual({ qualifier: 'c', name: 'run' });
  });
});

describe('Java facts', () => {
  const source = [
    'package com.acme.app;',
    'import java.util.List;',
    'import static com.acme.util.Strings.join;',
    'import com.acme.model.*;',
    'public class A extends B implements C {',
    '  void m() { new Foo(); Bar.x(); }',
    '}',
    'interface I {}',
    'enum E { X }',
    'record R(int a) {}',
  ].join('\n');

  it('reads the package, plain, static and wildcard imports', async () => {
    const { resolution } = await parse('A.java', source);
    expect(resolution?.packageName).toBe('com.acme.app');
    expect(resolution?.imports).toEqual([
      { path: 'java.util.List', importedEntities: [] },
      { path: 'com.acme.util.Strings', importedEntities: ['join'] },
      { path: 'com.acme.model', importedEntities: ['*'] },
    ]);
  });

  it('declares every kind of type and qualifies methods by their owner', async () => {
    const { entities, resolution } = await parse('A.java', source);
    expect(names(entities)).toEqual(expect.arrayContaining(['A', 'I', 'E', 'R', 'A.m']));
    expect(resolution?.usedNames).toEqual(expect.arrayContaining(['B', 'C', 'Foo', 'Bar']));
  });
});

describe('Rust facts', () => {
  const source = [
    'mod foo;',
    'mod inline { pub fn g() {} }',
    'use crate::a::b::{c, d::e, self};',
    'use super::x as y;',
    'use std::collections::HashMap;',
    'use self::foo::*;',
    'pub trait T { fn t(&self); }',
    'struct S;',
    'impl S { pub fn new() -> Self { S } }',
    'pub fn top() { foo::bar(); }',
    'type Alias = u32;',
  ].join('\n');

  it('flattens use trees and records declared modules', async () => {
    const { resolution } = await parse('lib.rs', source);
    expect(resolution?.moduleDeclarations).toEqual(['foo']);
    expect(resolution?.imports).toEqual([
      { path: 'crate::a::b::c', importedEntities: [] },
      { path: 'crate::a::b::d::e', importedEntities: [] },
      { path: 'crate::a::b', importedEntities: [] },
      { path: 'super::x', importedEntities: [], alias: 'y' },
      { path: 'std::collections::HashMap', importedEntities: [] },
      { path: 'self::foo', importedEntities: ['*'] },
    ]);
  });

  it('declares traits, structs, aliases and qualifies impl functions by type', async () => {
    const { entities, resolution } = await parse('lib.rs', source);
    expect(names(entities)).toEqual(
      expect.arrayContaining(['T', 'S', 'Alias', 'S::new', 'top', 'g'])
    );
    expect(resolution?.qualifiedUses).toContainEqual({ qualifier: 'foo', name: 'bar' });
  });
});

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import { parseFile } from '../parseFile';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codemaps-facts-more-'));

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

const parse = async (fileName: string, source: string) => {
  const filePath = path.join(tempDir, fileName);
  fs.writeFileSync(filePath, source);
  return parseFile({ filePath, baseDir: tempDir });
};

const names = (entities: Array<{ name: string }>) => entities.map((entity) => entity.name);

describe('C/C++ facts', () => {
  const source = [
    '#include "foo.h"',
    '#include <vector>',
    '#include <proj/bar.h>',
    'namespace app {',
    'class Foo : public Base { public: int bar(int x); void inl() { helper(1); } };',
    'struct P { int a; };',
    'enum class Color { Red };',
    'typedef struct Q { int z; } Q_t;',
    'int Foo::bar(int x) { return util::twice(x) + Color::Red; }',
    '}',
    'int free_fn(int a);',
    'static int local(int a) { int inner(int); return a; }',
  ].join('\n');

  it('keeps quoted and angle includes apart', async () => {
    const { resolution } = await parse('foo.cpp', source);
    expect(resolution?.imports).toEqual([
      { path: 'foo.h', importedEntities: [] },
      { path: 'vector', importedEntities: [], kind: 'system' },
      { path: 'proj/bar.h', importedEntities: [], kind: 'system' },
    ]);
  });

  it('declares types, typedefs and functions, qualifying members by class', async () => {
    const { entities, resolution } = await parse('foo.cpp', source);
    expect(names(entities)).toEqual(
      expect.arrayContaining([
        'Foo',
        'Foo::bar',
        'Foo::inl',
        'P',
        'Color',
        'Q',
        'Q_t',
        'free_fn',
        'local',
      ])
    );
    expect(names(entities)).not.toContain('inner');
    expect(new Set(names(entities)).size).toBe(entities.length);
    expect(resolution?.qualifiedUses).toContainEqual({ qualifier: 'util', name: 'twice' });
    expect(resolution?.usedNames).toEqual(expect.arrayContaining(['Base', 'helper', 'Color']));
  });
});

describe('C# facts', () => {
  const source = [
    'using System;',
    'using static Acme.Util.Strings;',
    'using M = Acme.Models;',
    'namespace Acme.App;',
    'public class Main : Base, IThing {',
    '  public int Run(Customer c) { return Strings.Join(c); }',
    '  public class Inner { public void Go() {} }',
    '}',
    'public interface IThing { void Do(); }',
    'public record R(int a);',
    'public enum E { A }',
  ].join('\n');

  it('reads plain, static and alias usings and the namespace', async () => {
    const { resolution } = await parse('Main.cs', source);
    expect(resolution?.packageName).toBe('Acme.App');
    expect(resolution?.imports).toEqual([
      { path: 'System', importedEntities: ['*'], kind: 'namespace' },
      { path: 'Acme.Util.Strings', importedEntities: [], kind: 'static' },
      { path: 'Acme.Models', importedEntities: [], alias: 'M' },
    ]);
  });

  it('declares types and qualifies methods by their type', async () => {
    const { entities, resolution } = await parse('Main.cs', source);
    expect(names(entities)).toEqual(
      expect.arrayContaining([
        'Main',
        'Main.Run',
        'Inner',
        'Inner.Go',
        'IThing',
        'IThing.Do',
        'R',
        'E',
      ])
    );
    expect(resolution?.usedNames).toEqual(expect.arrayContaining(['Base', 'Customer', 'Strings']));
    expect(resolution?.usedNames).not.toContain('Run');
  });

  it('collects every namespace of block-scoped files', async () => {
    const { resolution } = await parse(
      'Blocks.cs',
      'namespace A { class X {} namespace B { class Y {} } }'
    );
    expect(resolution?.namespaces).toEqual(['A', 'A.B']);
  });
});

describe('Kotlin facts', () => {
  const source = [
    'package com.acme.app',
    'import com.acme.model.Order',
    'import com.acme.util.*',
    'import com.acme.model.Customer as Cust',
    'class Main(val o: Order) : Base() {',
    '  fun run(c: Cust): String = join(c)',
    '  companion object { fun make() = 1 }',
    '  class Inner { fun go() { fun local() {} } }',
    '}',
    'interface IThing { fun doIt() }',
    'object Singleton',
    'fun topLevel(x: Int) = x',
    'typealias Alias = Map<String, Int>',
  ].join('\n');

  it('reads the package, wildcard and aliased imports', async () => {
    const { resolution } = await parse('Main.kt', source);
    expect(resolution?.packageName).toBe('com.acme.app');
    expect(resolution?.imports).toEqual([
      { path: 'com.acme.model.Order', importedEntities: [] },
      { path: 'com.acme.util', importedEntities: ['*'] },
      { path: 'com.acme.model.Customer', importedEntities: [], alias: 'Cust' },
    ]);
  });

  it('declares classes, objects and functions and ignores local functions', async () => {
    const { entities, resolution } = await parse('Main.kt', source);
    expect(names(entities)).toEqual(
      expect.arrayContaining([
        'Main',
        'Main.run',
        'Main.make',
        'Inner',
        'Inner.go',
        'IThing',
        'IThing.doIt',
        'Singleton',
        'topLevel',
        'Alias',
      ])
    );
    expect(names(entities)).not.toContain('local');
    expect(resolution?.usedNames).toEqual(expect.arrayContaining(['Order', 'Base', 'join']));
  });
});

describe('PHP facts', () => {
  const source = [
    '<?php',
    'namespace App\\Services;',
    'use App\\Models\\User;',
    'use App\\Models\\{Order, Customer as Cust};',
    'use function App\\Helpers\\fmt;',
    "require_once __DIR__ . '/helpers.php';",
    "include 'lib/other.php';",
    'interface Svc {}',
    'trait Loggable { public function log() {} }',
    'enum Status { case A; }',
    'abstract class UserService extends BaseService implements Svc {',
    '  public function find(int $id): ?User { return new User(); }',
    '}',
    'function helper() { return \\App\\Models\\Order::class; }',
  ].join('\n');

  it('reads namespace, use clauses, groups, aliases and includes', async () => {
    const { resolution } = await parse('Svc.php', source);
    expect(resolution?.packageName).toBe('App\\Services');
    expect(resolution?.imports).toEqual([
      { path: 'App\\Models\\User', importedEntities: [] },
      { path: 'App\\Models\\Order', importedEntities: [] },
      { path: 'App\\Models\\Customer', importedEntities: [], alias: 'Cust' },
      { path: 'App\\Helpers\\fmt', importedEntities: [], kind: 'function' },
      { path: './helpers.php', importedEntities: [], kind: 'file' },
      { path: 'lib/other.php', importedEntities: [], kind: 'file' },
    ]);
    expect(resolution?.qualifiedUses).toContainEqual({
      qualifier: '\\App\\Models',
      name: 'Order',
    });
  });

  it('declares classes, interfaces, traits, enums, functions and methods', async () => {
    const { entities } = await parse('Svc.php', source);
    expect(names(entities)).toEqual(
      expect.arrayContaining([
        'Svc',
        'Loggable',
        'Loggable.log',
        'Status',
        'UserService',
        'UserService.find',
        'helper',
      ])
    );
  });
});

describe('Ruby facts', () => {
  const source = [
    "require 'json'",
    "require_relative 'helpers/util'",
    "load 'x.rb'",
    'module Acme',
    '  class User < Base',
    '    def save; Util.log(self); end',
    '    def self.find(id); end',
    '    class << self',
    '      def build; end',
    '    end',
    '  end',
    'end',
    'class Acme::Order; def total; end; end',
    'Point = Struct.new(:x)',
    'def top_level; end',
  ].join('\n');

  it('reads require, require_relative and load', async () => {
    const { resolution } = await parse('user.rb', source);
    expect(resolution?.imports).toEqual([
      { path: 'json', importedEntities: [] },
      { path: 'helpers/util', importedEntities: [], kind: 'relative' },
      { path: 'x.rb', importedEntities: [], kind: 'load' },
    ]);
  });

  it('qualifies methods by owner and labels scoped classes by their own constant', async () => {
    const { entities, resolution } = await parse('user.rb', source);
    expect(names(entities)).toEqual(
      expect.arrayContaining([
        'Acme',
        'User',
        'User.save',
        'User.find',
        'User.build',
        'Order',
        'Order.total',
        'Point',
        'top_level',
      ])
    );
    expect(resolution?.usedNames).toEqual(expect.arrayContaining(['Base', 'Util']));
    expect(resolution?.qualifiedUses).toContainEqual({ qualifier: 'Acme', name: 'Order' });
  });
});

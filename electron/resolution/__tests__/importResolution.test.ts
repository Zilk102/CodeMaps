import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GraphBuilder } from '../../oracle/GraphBuilder';
import { normalizePath } from '../../oracle/shared';
import { parseFile } from '../../parsing/parseFile';
import { oracleStore } from '../../store';
import { ImportResolutionService } from '../ImportResolutionService';

let root = '';

const write = (relativePath: string, source: string) => {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, source);
};

const walk = (directory: string): string[] =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });

/** Indexes the fixture project the way the oracle does, minus the worker pool. */
const analyze = async () => {
  const baseDir = normalizePath(root);
  oracleStore.getState().clear();
  oracleStore.getState().setBaseDir(baseDir);
  const builder = new GraphBuilder();
  for (const file of walk(root)) {
    const result = await parseFile({ filePath: file, baseDir });
    builder.applyParsedFile(normalizePath(file), baseDir, 1, result);
  }
  await new ImportResolutionService().resolveAll();
};

/** `from -> to` pairs relative to the project, entity targets as `file#Name`. */
const edges = () =>
  oracleStore
    .getState()
    .links.filter((link) => link.type === 'import')
    .map((link) => {
      const rel = (id: string) => id.replace(`${normalizePath(root)}/`, '');
      return `${rel(link.source)} -> ${rel(link.target)}`;
    })
    .sort();

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'codemaps-resolve-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  oracleStore.getState().clear();
});

describe('Go', () => {
  beforeEach(() => {
    write('go.mod', 'module example.com/shop\n\ngo 1.22\n');
    write(
      'internal/domain/user.go',
      'package domain\n\ntype User struct{ Name string }\n\nconst Version = 1\n'
    );
    write(
      'internal/domain/city.go',
      'package domain\n\nfunc NewCity() *City { return nil }\ntype City struct{}\n'
    );
    write(
      'internal/service/service.go',
      [
        'package service',
        'import (',
        '\t"fmt"',
        '\tm "example.com/shop/internal/domain"',
        ')',
        'func Run(u m.User) { fmt.Println(helper(u)) }',
      ].join('\n')
    );
    write(
      'internal/service/helper.go',
      'package service\n\nfunc helper(u interface{}) string { return "" }\n'
    );
    write(
      'cmd/app/main.go',
      'package main\nimport "example.com/shop/internal/service"\nfunc main() { service.Run(nil) }\n'
    );
    write(
      'cmd/app/consts.go',
      'package main\nimport "example.com/shop/internal/domain"\nvar v = domain.Version\n'
    );
  });

  it('links imports to the declaring file and symbol, through aliases', async () => {
    await analyze();
    const result = edges();
    expect(result).toContain('internal/service/service.go -> internal/domain/user.go#User');
    expect(result).toContain('cmd/app/main.go -> internal/service/service.go#Run');
  });

  it('links files of one package that use each other without an import', async () => {
    await analyze();
    expect(edges()).toContain('internal/service/service.go -> internal/service/helper.go#helper');
  });

  it('falls back to the package main file for constants and ignores the standard library', async () => {
    await analyze();
    const result = edges();
    // domain has two files; user.go and city.go declare one or two symbols: city.go wins.
    expect(result).toContain('cmd/app/consts.go -> internal/domain/city.go');
    expect(result.some((edge) => edge.includes('fmt'))).toBe(false);
  });
});

describe('Python', () => {
  beforeEach(() => {
    write('app/__init__.py', '');
    write('app/models/__init__.py', 'from .user import User\n');
    write('app/models/user.py', 'class User:\n    def name(self): pass\n\ndef make_user(): pass\n');
    write('app/utils.py', 'def slugify(value): return value\n');
    write(
      'app/service.py',
      [
        'import app.utils as u',
        'from app.models import User',
        'from . import utils',
        'from .models.user import make_user',
        'import os',
        'def run():',
        '    return u.slugify(User())',
      ].join('\n')
    );
  });

  it('resolves absolute, relative and aliased imports to files and symbols', async () => {
    await analyze();
    const result = edges();
    expect(result).toContain('app/service.py -> app/utils.py');
    expect(result).toContain('app/service.py -> app/utils.py#slugify');
    expect(result).toContain('app/service.py -> app/models/user.py#make_user');
  });

  it('follows a package __init__ re-export to the real definition', async () => {
    await analyze();
    expect(edges()).toContain('app/service.py -> app/models/user.py#User');
  });

  it('does not link standard-library imports', async () => {
    await analyze();
    expect(edges().some((edge) => edge.includes('os'))).toBe(false);
  });
});

describe('Java', () => {
  beforeEach(() => {
    write(
      'src/main/java/com/acme/model/Order.java',
      'package com.acme.model;\npublic class Order { }\n'
    );
    write(
      'src/main/java/com/acme/model/Customer.java',
      'package com.acme.model;\npublic class Customer { Order last; }\n'
    );
    write(
      'src/main/java/com/acme/util/Strings.java',
      'package com.acme.util;\npublic final class Strings { public static String join() { return ""; } }\n'
    );
    write(
      'src/main/java/com/acme/app/Main.java',
      [
        'package com.acme.app;',
        'import com.acme.model.Order;',
        'import com.acme.model.*;',
        'import static com.acme.util.Strings.join;',
        'import java.util.List;',
        'public class Main { Customer c; Order o; Helper h; }',
      ].join('\n')
    );
    write('src/main/java/com/acme/app/Helper.java', 'package com.acme.app;\nclass Helper { }\n');
  });

  it('resolves imports, wildcards and static imports to classes', async () => {
    await analyze();
    const result = edges();
    expect(result).toContain(
      'src/main/java/com/acme/app/Main.java -> src/main/java/com/acme/model/Order.java#Order'
    );
    expect(result).toContain(
      'src/main/java/com/acme/app/Main.java -> src/main/java/com/acme/model/Customer.java#Customer'
    );
    expect(result).toContain(
      'src/main/java/com/acme/app/Main.java -> src/main/java/com/acme/util/Strings.java#Strings'
    );
  });

  it('links classes of the same package and same-package use inside a package', async () => {
    await analyze();
    const result = edges();
    expect(result).toContain(
      'src/main/java/com/acme/app/Main.java -> src/main/java/com/acme/app/Helper.java#Helper'
    );
    expect(result).toContain(
      'src/main/java/com/acme/model/Customer.java -> src/main/java/com/acme/model/Order.java#Order'
    );
    expect(result.some((edge) => edge.includes('java.util'))).toBe(false);
  });
});

describe('Rust', () => {
  beforeEach(() => {
    write('Cargo.toml', '[package]\nname = "shop-core"\nversion = "0.1.0"\n');
    write('src/lib.rs', 'pub mod model;\nmod util;\npub use model::Order;\n');
    write('src/model/mod.rs', 'pub mod order;\npub use order::Order;\n');
    write('src/model/order.rs', 'pub struct Order;\npub fn total() {}\n');
    write(
      'src/util.rs',
      'use crate::model::Order;\nuse super::model;\nuse crate::model::order::total;\nuse std::fmt;\npub fn go() { model::order::total(); }\n'
    );
  });

  it('links mod declarations to child module files', async () => {
    await analyze();
    const result = edges();
    expect(result).toContain('src/lib.rs -> src/model/mod.rs');
    expect(result).toContain('src/lib.rs -> src/util.rs');
    expect(result).toContain('src/model/mod.rs -> src/model/order.rs');
  });

  it('resolves use paths to the declaring file and follows pub use', async () => {
    await analyze();
    const result = edges();
    expect(result).toContain('src/util.rs -> src/model/order.rs#Order');
    expect(result).toContain('src/util.rs -> src/model/order.rs#total');
    expect(result.some((edge) => edge.includes('std') || edge.includes('fmt'))).toBe(false);
  });
});

describe('re-resolution', () => {
  it('replaces its previous links instead of piling them up', async () => {
    write('go.mod', 'module example.com/x\n');
    write('a/a.go', 'package a\nfunc A() {}\n');
    write('b/b.go', 'package b\nimport "example.com/x/a"\nfunc B() { a.A() }\n');
    await analyze();
    const first = edges();
    await new ImportResolutionService().resolveAll();
    expect(edges()).toEqual(first);
    expect(first).toContain('b/b.go -> a/a.go#A');
  });
});

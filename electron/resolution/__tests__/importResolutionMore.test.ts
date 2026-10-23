import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GraphBuilder } from '../../oracle/GraphBuilder';
import { normalizePath } from '../../oracle/shared';
import { parseFile } from '../../parsing/parseFile';
import { oracleStore } from '../../store';
import { ImportResolutionService } from '../ImportResolutionService';
import { parseComposerPsr4 } from '../phpResolver';

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
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'codemaps-resolve-more-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  oracleStore.getState().clear();
});

describe('C/C++', () => {
  beforeEach(() => {
    write(
      'include/proj/bar.h',
      'class Bar { public: int get(); };\nint bar_helper(int a);\ntypedef struct Cfg { int v; } Cfg_t;\n'
    );
    write('src/foo.h', '#pragma once\nclass Foo { public: int run(int x); static int make(); };\n');
    write(
      'src/foo.cpp',
      '#include "foo.h"\n#include <vector>\nint Foo::run(int x) { return x; }\nint Foo::make() { return 1; }\n'
    );
    write('src/util/math.h', 'int twice(int a);\nenum Mode { Fast };\n');
    write(
      'src/main.cpp',
      [
        '#include "foo.h"',
        '#include "util/math.h"',
        '#include <proj/bar.h>',
        '#include <stdio.h>',
        '#include <vector>',
        'int main() { Foo f; Bar b; Cfg_t c; return twice(1) + Foo::make(); }',
      ].join('\n')
    );
    write('src/stdio.h', 'int not_the_system_header();\n');
    write('src/lonely.c', 'int lonely(void) { return 0; }\n');
    write('src/lonely.h', 'int lonely(void);\n');
  });

  it('resolves quoted includes relative to the file and to include directories', async () => {
    await analyze();
    const result = edges();
    expect(result).toContain('src/main.cpp -> src/foo.h');
    expect(result).toContain('src/main.cpp -> src/util/math.h');
  });

  it('resolves angle includes that exist in the project and ignores system headers', async () => {
    await analyze();
    const result = edges();
    expect(result).toContain('src/main.cpp -> include/proj/bar.h');
    expect(result.some((edge) => edge.includes('vector'))).toBe(false);
    // <stdio.h> is a system header even though the project has a stdio.h next to main.cpp.
    expect(result).not.toContain('src/main.cpp -> src/stdio.h');
  });

  it('links the declared symbols that are used', async () => {
    await analyze();
    const result = edges();
    expect(result).toContain('src/main.cpp -> src/foo.h#Foo');
    expect(result).toContain('src/main.cpp -> src/foo.h#Foo::make');
    expect(result).toContain('src/main.cpp -> include/proj/bar.h#Bar');
    expect(result).toContain('src/main.cpp -> include/proj/bar.h#Cfg_t');
    expect(result).toContain('src/main.cpp -> src/util/math.h#twice');
    expect(result).not.toContain('src/main.cpp -> include/proj/bar.h#bar_helper');
  });

  it('links an implementation to the header it implements, and to the members it defines', async () => {
    await analyze();
    const result = edges();
    expect(result).toContain('src/foo.cpp -> src/foo.h#Foo::run');
    expect(result).toContain('src/lonely.c -> src/lonely.h');
  });
});

describe('C#', () => {
  beforeEach(() => {
    write('Models/Order.cs', 'namespace Acme.Models;\npublic class Order { }\n');
    write('Models/Customer.cs', 'namespace Acme.Models;\npublic class Customer { Order last; }\n');
    write(
      'Util/Strings.cs',
      'namespace Acme.Util { public static class Strings { public static string Join() => ""; } }\n'
    );
    write('Core/Clock.cs', 'namespace Acme { public class Clock { } }\n');
    write(
      'App/Main.cs',
      [
        'using System;',
        'using Acme.Models;',
        'using static Acme.Util.Strings;',
        'using U = Acme.Util;',
        'namespace Acme.App',
        '{',
        '  public class Main { Customer c; Clock clock; Helper h; U.Strings s; }',
        '}',
      ].join('\n')
    );
    write('App/Helper.cs', 'namespace Acme.App { class Helper { } }\n');
  });

  it('resolves using namespace, using static and aliases to types', async () => {
    await analyze();
    const result = edges();
    expect(result).toContain('App/Main.cs -> Models/Customer.cs#Customer');
    expect(result).toContain('App/Main.cs -> Util/Strings.cs#Strings');
    expect(result.some((edge) => edge.includes('System'))).toBe(false);
  });

  it('links same-namespace and parent-namespace types without a using', async () => {
    await analyze();
    const result = edges();
    expect(result).toContain('App/Main.cs -> App/Helper.cs#Helper');
    expect(result).toContain('App/Main.cs -> Core/Clock.cs#Clock');
    expect(result).toContain('Models/Customer.cs -> Models/Order.cs#Order');
  });

  it('does not link a type that is not imported', async () => {
    write('Other/Order.cs', 'namespace Elsewhere { public class Order { } }\n');
    await analyze();
    expect(edges()).not.toContain('Models/Customer.cs -> Other/Order.cs#Order');
  });
});

describe('Kotlin', () => {
  beforeEach(() => {
    write(
      'src/main/kotlin/com/acme/model/Order.kt',
      'package com.acme.model\nclass Order\nfun makeOrder() = Order()\n'
    );
    write(
      'src/main/kotlin/com/acme/model/Customer.kt',
      'package com.acme.model\nclass Customer(val o: Order)\n'
    );
    write(
      'src/main/kotlin/com/acme/util/Strings.kt',
      'package com.acme.util\nfun join(a: String) = a\nobject Strings\n'
    );
    write(
      'src/main/kotlin/com/acme/app/Main.kt',
      [
        'package com.acme.app',
        'import com.acme.model.Order',
        'import com.acme.model.Customer as Cust',
        'import com.acme.util.join',
        'import kotlin.collections.List',
        'class Main(val o: Order, val c: Cust) { fun run() = join("x") + Helper().name }',
      ].join('\n')
    );
    write(
      'src/main/kotlin/com/acme/app/Helper.kt',
      'package com.acme.app\nclass Helper { val name = "" }\n'
    );
    write(
      'src/main/java/com/acme/app/Legacy.java',
      'package com.acme.app;\nimport com.acme.model.Order;\npublic class Legacy { Order o; Helper h; }\n'
    );
  });

  it('resolves imports, aliases and top-level functions', async () => {
    await analyze();
    const result = edges();
    const main = 'src/main/kotlin/com/acme/app/Main.kt';
    expect(result).toContain(`${main} -> src/main/kotlin/com/acme/model/Order.kt#Order`);
    expect(result).toContain(`${main} -> src/main/kotlin/com/acme/model/Customer.kt#Customer`);
    expect(result).toContain(`${main} -> src/main/kotlin/com/acme/util/Strings.kt#join`);
    expect(result.some((edge) => edge.includes('kotlin.collections'))).toBe(false);
  });

  it('links same-package classes and shares packages with Java', async () => {
    await analyze();
    const result = edges();
    expect(result).toContain(
      'src/main/kotlin/com/acme/app/Main.kt -> src/main/kotlin/com/acme/app/Helper.kt#Helper'
    );
    expect(result).toContain(
      'src/main/java/com/acme/app/Legacy.java -> src/main/kotlin/com/acme/model/Order.kt#Order'
    );
    expect(result).toContain(
      'src/main/java/com/acme/app/Legacy.java -> src/main/kotlin/com/acme/app/Helper.kt#Helper'
    );
  });
});

describe('PHP', () => {
  beforeEach(() => {
    write('composer.json', JSON.stringify({ autoload: { 'psr-4': { 'App\\': 'app/' } } }));
    write('app/Models/User.php', '<?php\nnamespace App\\Models;\nclass User { }\n');
    write('app/Models/Order.php', '<?php\nnamespace App\\Models;\nclass Order extends Base { }\n');
    write('app/Support/Money.php', '<?php\nnamespace App\\Support;\nfinal class Money { }\n');
    write('app/Helpers/functions.php', '<?php\nnamespace App\\Helpers;\nfunction fmt() {}\n');
    write(
      'app/Services/UserService.php',
      [
        '<?php',
        'namespace App\\Services;',
        'use App\\Models\\User;',
        'use App\\Models\\{Order, Customer as Cust};',
        'use App\\Support as S;',
        'use function App\\Helpers\\fmt;',
        'use Vendor\\Lib\\Thing;',
        "require_once __DIR__ . '/boot.php';",
        'class UserService { function f() { return new User(); } function g() { return new S\\Money(); } }',
      ].join('\n')
    );
    write(
      'app/Services/Audit.php',
      '<?php\nnamespace App\\Services;\nclass Audit { }\nnew UserService();\n'
    );
    write('app/Services/boot.php', '<?php\nnamespace App\\Services;\nfunction boot() {}\n');
  });

  it('resolves use statements, groups and functions to classes', async () => {
    await analyze();
    const result = edges();
    const service = 'app/Services/UserService.php';
    expect(result).toContain(`${service} -> app/Models/User.php#User`);
    expect(result).toContain(`${service} -> app/Models/Order.php#Order`);
    expect(result).toContain(`${service} -> app/Helpers/functions.php#fmt`);
    expect(result.some((edge) => edge.includes('Thing'))).toBe(false);
  });

  it('resolves inline alias-qualified names, same-namespace classes and require', async () => {
    await analyze();
    const result = edges();
    expect(result).toContain('app/Services/UserService.php -> app/Support/Money.php#Money');
    expect(result).toContain('app/Services/UserService.php -> app/Services/boot.php');
    expect(result).toContain('app/Services/Audit.php -> app/Services/UserService.php#UserService');
  });

  it('falls back to PSR-4 for a class whose file declares no namespace entity yet', async () => {
    write('app/Models/Legacy.php', '<?php\nclass LegacyThing { }\n');
    write(
      'app/Services/Reader.php',
      '<?php\nnamespace App\\Services;\nuse App\\Models\\Legacy;\nclass Reader { }\n'
    );
    await analyze();
    expect(edges()).toContain('app/Services/Reader.php -> app/Models/Legacy.php');
  });

  it('parses composer psr-4 maps with arrays and dev sections', () => {
    const mappings = parseComposerPsr4(
      '/p',
      JSON.stringify({
        autoload: { 'psr-4': { 'A\\': ['a/', 'b/'] } },
        'autoload-dev': { 'psr-4': { 'A\\Tests\\': 'tests/' } },
      })
    );
    expect(mappings).toEqual([
      { prefix: 'A\\', dir: '/p/a' },
      { prefix: 'A\\', dir: '/p/b' },
      { prefix: 'A\\Tests\\', dir: '/p/tests' },
    ]);
    expect(parseComposerPsr4('/p', 'not json')).toEqual([]);
  });
});

describe('Ruby', () => {
  beforeEach(() => {
    write(
      'lib/acme.rb',
      "require_relative 'acme/user'\nrequire 'acme/util'\nrequire 'json'\nmodule Acme; end\n"
    );
    write(
      'lib/acme/user.rb',
      'module Acme\n  class User\n    def save; Util.log(self); end\n  end\nend\n'
    );
    write('lib/acme/util.rb', 'module Acme\n  module Util\n    def self.log(x); end\n  end\nend\n');
    write('app/models/order.rb', 'class Order\n  def total; User.new; end\nend\n');
    write('app/models/shared.rb', 'class Shared; end\n');
    write('app/models/other_shared.rb', 'class Shared; end\n');
    write(
      'app/run.rb',
      "require_relative '../lib/acme'\nrequire 'acme/user'\nclass Runner < Order\n  def go; Shared.new; Acme::User.new; end\nend\n"
    );
  });

  it('resolves require_relative and require through lib/ to files and constants', async () => {
    await analyze();
    const result = edges();
    expect(result).toContain('lib/acme.rb -> lib/acme/user.rb');
    expect(result).toContain('lib/acme.rb -> lib/acme/util.rb');
    expect(result).toContain('app/run.rb -> lib/acme.rb');
    expect(result).toContain('app/run.rb -> lib/acme/user.rb');
    expect(result).toContain('app/run.rb -> lib/acme/user.rb#User');
    expect(result.some((edge) => edge.includes('json'))).toBe(false);
  });

  it('links autoloaded constants only when exactly one file declares them', async () => {
    await analyze();
    const result = edges();
    expect(result).toContain('app/run.rb -> app/models/order.rb#Order');
    expect(result).toContain('app/models/order.rb -> lib/acme/user.rb#User');
    expect(result.some((edge) => edge.startsWith('app/run.rb') && edge.includes('#Shared'))).toBe(
      false
    );
  });
});

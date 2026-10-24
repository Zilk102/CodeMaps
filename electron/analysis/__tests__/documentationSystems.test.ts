import { describe, expect, it } from 'vitest';
import { analyze, source, verdicts } from './documentationTestKit';

describe('Go documentation', () => {
  it('exports capitalized names and takes the comment block above', async () => {
    const result = await analyze(
      '/p/billing/invoice.go',
      source(
        '// Package billing models invoices for the service.',
        'package billing',
        '',
        '// Invoice is one invoice sent to a customer.',
        'type Invoice struct{ total int }',
        '',
        '// Total returns the amount including tax.',
        'func (i *Invoice) Total() int { return i.total }',
        '',
        'func (i *Invoice) Pay() {}',
        '',
        'func (i *Invoice) helper() {}',
        '',
        'type internal struct{}',
        '',
        'func (i *internal) Exported() {}',
        '',
        'type Payer interface{ Pay() }',
        '',
        'type (',
        '\t// Status describes the state of an invoice.',
        '\tStatus int',
        '\thidden int',
        ')',
        '',
        'func Build() *Invoice { return nil }',
        '',
        'func buildInternal() {}'
      )
    );
    expect(verdicts(result)).toEqual([
      'Invoice:struct:ERD',
      'Total:method:ERD',
      'Pay:method:ER-',
      'helper:method:---',
      'internal:struct:---',
      'Exported:method:---',
      'Payer:interface:ER-',
      'Status:type:ERD',
      'hidden:type:---',
      'Build:function:ER-',
      'buildInternal:function:---',
    ]);
    expect(result.header).toBe('documented');
  });
});

describe('Rust documentation', () => {
  it('uses pub, skips attributes and exempts trait implementations', async () => {
    const result = await analyze(
      '/p/src/invoice.rs',
      source(
        '//! Billing model types used by the invoice service.',
        '',
        '/// Represents one invoice sent to a customer.',
        '#[derive(Debug)]',
        'pub struct Invoice { total: i32 }',
        '',
        'pub enum Status { Open }',
        '',
        'pub trait Payable {',
        '    fn pay(&self);',
        '    /// Pays the invoice and returns a receipt.',
        '    fn settle(&self) {}',
        '}',
        '',
        'impl Invoice {',
        '    /// Creates an empty invoice for a customer.',
        '    pub fn new() -> Self { Invoice { total: 0 } }',
        '    pub fn total(&self) -> i32 { self.total }',
        '    fn secret(&self) {}',
        '}',
        '',
        'impl Payable for Invoice {',
        '    fn pay(&self) {}',
        '}',
        '',
        'pub type Money = i32;',
        '',
        'mod inner {',
        '    pub fn deep() {}',
        '}',
        '',
        'pub fn build() {}',
        'fn helper() {}',
        'pub(crate) fn crate_only() {}'
      )
    );
    expect(verdicts(result)).toEqual([
      'Invoice:struct:ERD',
      'Status:enum:ER-',
      'Payable:trait:ER-',
      'pay:method:ER-',
      'settle:method:ERD',
      'new:method:ERD',
      'total:method:ER-',
      'secret:method:---',
      'pay:method:---',
      'Money:type:ER-',
      'deep:function:---',
      'build:function:ER-',
      'helper:function:---',
      'crate_only:function:---',
    ]);
    expect(result.header).toBe('documented');
  });
});

describe('Zig documentation', () => {
  it('uses pub and /// comments, with //! for the file header', async () => {
    const result = await analyze(
      '/p/src/invoice.zig',
      source(
        '//! Billing model types used by the invoice service.',
        'const std = @import("std");',
        '',
        '/// Represents one invoice sent to a customer.',
        'pub const Invoice = struct {',
        '    total: i32,',
        '',
        '    /// Returns the total amount including tax.',
        '    pub fn amount(self: Invoice) i32 { return self.total; }',
        '    pub fn pay(self: Invoice) void {}',
        '    fn secret() void {}',
        '};',
        '',
        'const Hidden = struct {',
        '    pub fn run() void {}',
        '};',
        '',
        'pub const Status = enum { open, closed };',
        'pub const Mode = union(enum) { a: i32 };',
        'pub const limit = 5;',
        'pub fn build() void {}',
        'fn helper() void {}'
      )
    );
    expect(verdicts(result)).toEqual([
      'Invoice:struct:ERD',
      'amount:method:ERD',
      'pay:method:ER-',
      'secret:method:---',
      'Hidden:struct:---',
      'run:method:---',
      'Status:enum:ER-',
      'Mode:struct:ER-',
      'build:function:ER-',
      'helper:function:---',
    ]);
    expect(result.header).toBe('documented');
  });
});

describe('C and C++ documentation', () => {
  it('treats header declarations as exported and reads Doxygen comments', async () => {
    const result = await analyze(
      '/p/include/invoice.hpp',
      source(
        '/** Billing model types used by the invoice service. */',
        '#pragma once',
        '',
        'namespace billing {',
        '',
        '/// Represents one invoice sent to a customer.',
        'class Invoice {',
        'public:',
        '    /** Returns the total amount including tax. */',
        '    int total() const;',
        '    void pay();',
        '    int inlineTotal() { return 1; }',
        'private:',
        '    void secret();',
        '};',
        '',
        'struct Money { int cents; };',
        '',
        'enum class Status { Open };',
        '',
        'typedef int Id;',
        'using Cents = int;',
        '',
        'template <typename T>',
        'T identity(T value);',
        '',
        'static int helper() { return 1; }',
        'int build();',
        '',
        '}'
      )
    );
    expect(verdicts(result)).toEqual([
      'Invoice:class:ERD',
      'total:method:ERD',
      'pay:method:ER-',
      'inlineTotal:method:ER-',
      'secret:method:---',
      'Money:struct:ER-',
      'Status:enum:ER-',
      'Id:type:ER-',
      'Cents:type:ER-',
      'identity:function:ER-',
      'helper:function:---',
      'build:function:ER-',
    ]);
    expect(result.header).toBe('documented');
  });

  it('exports non-static functions of source files and exempts out-of-line methods', async () => {
    const result = await analyze(
      '/p/src/invoice.cpp',
      source(
        '#include "invoice.hpp"',
        '',
        'class Local { public: void run() {} };',
        '',
        'int Invoice::total() const { return 1; }',
        '',
        '/** Adds two numbers and returns the sum. */',
        'int add(int a, int b) { return a + b; }',
        '',
        'static int square(int x) { return x * x; }',
        '',
        'int multiply(int a, int b) { return a * b; }'
      )
    );
    expect(verdicts(result)).toEqual([
      'Local:class:---',
      'run:method:---',
      'Invoice::total:function:E--',
      'add:function:ERD',
      'square:function:---',
      'multiply:function:ER-',
    ]);
  });

  it('analyzes C sources', async () => {
    const result = await analyze(
      '/p/src/math.c',
      source('/** Adds two integers. */', 'int add(int a, int b) { return a + b; }')
    );
    expect(verdicts(result)).toEqual(['add:function:ERD']);
  });
});

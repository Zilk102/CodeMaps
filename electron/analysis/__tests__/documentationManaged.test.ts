import { describe, expect, it } from 'vitest';
import { analyze, source, verdicts } from './documentationTestKit';

describe('Java documentation', () => {
  it('requires Javadoc on public symbols and exempts @Override', async () => {
    const result = await analyze(
      '/p/Invoice.java',
      source(
        '/** Billing model classes used by the invoice service. */',
        'package app.billing;',
        '',
        '/** Represents one invoice sent to a customer. */',
        'public class Invoice {',
        '    /** Returns the total amount including tax. */',
        '    public int total() { return 1; }',
        '    public void pay() {}',
        '    void packagePrivate() {}',
        '    private void secret() {}',
        '    @Override',
        '    public String toString() { return ""; }',
        '    public interface Listener { void changed(); }',
        '}',
        'interface Hidden { void run(); }',
        'public enum Status { OPEN }'
      )
    );
    expect(verdicts(result)).toEqual([
      'Invoice:class:ERD',
      'total:method:ERD',
      'pay:method:ER-',
      'packagePrivate:method:---',
      'secret:method:---',
      'toString:method:E--',
      'Listener:interface:ER-',
      'changed:method:ER-',
      'Hidden:interface:---',
      'run:method:---',
      'Status:enum:ER-',
    ]);
    expect(result.header).toBe('documented');
  });

  it('requires a long package-private method to be documented', async () => {
    const result = await analyze(
      '/p/Long.java',
      source(
        'class Long {',
        '    void work() {',
        ...Array.from({ length: 10 }, (_, i) => `        int v${i} = ${i};`),
        '    }',
        '}'
      )
    );
    expect(verdicts(result)).toEqual(['Long:class:---', 'work:method:-R-']);
  });
});

describe('Kotlin documentation', () => {
  it('reads KDoc and treats public as the default visibility', async () => {
    const result = await analyze(
      '/p/Invoice.kt',
      source(
        '/** Billing model classes used by the invoice service. */',
        'package app.billing',
        '',
        '/** Represents one invoice sent to a customer. */',
        'class Invoice {',
        '    /** Returns the total amount including tax. */',
        '    fun total(): Int = 1',
        '    fun pay() {}',
        '    private fun secret() {}',
        '    internal fun internalOnly() {}',
        '    override fun toString(): String = ""',
        '}',
        'interface Payable { fun pay() }',
        'object Registry { fun register() {} }',
        'internal fun hiddenTop() {}',
        'fun publicTop() {}',
        'typealias Id = Int'
      )
    );
    expect(verdicts(result)).toEqual([
      'Invoice:class:ERD',
      'total:method:ERD',
      'pay:method:ER-',
      'secret:method:---',
      'internalOnly:method:---',
      'toString:method:E--',
      'Payable:interface:ER-',
      'pay:method:ER-',
      'Registry:class:ER-',
      'register:method:ER-',
      'hiddenTop:function:---',
      'publicTop:function:ER-',
      'Id:type:ER-',
    ]);
    expect(result.header).toBe('documented');
  });
});

describe('C# documentation', () => {
  it('reads XML doc comments above attributes and uses the public keyword', async () => {
    const result = await analyze(
      '/p/Invoice.cs',
      source(
        'using System;',
        'namespace App.Billing',
        '{',
        '    /// <summary>Represents one invoice sent to a customer.</summary>',
        '    [Serializable]',
        '    public class Invoice',
        '    {',
        '        /// <summary>Returns the total amount including tax.</summary>',
        '        public int Total() { return 1; }',
        '        public void Pay() {}',
        '        void Hidden() {}',
        '        public override string ToString() { return ""; }',
        '    }',
        '    internal class Internal { public void Run() {} }',
        '    public interface IPayable { void Pay(); }',
        '    public struct Money {}',
        '    public enum Status { Open }',
        '    public record Receipt(int A);',
        '}'
      )
    );
    expect(verdicts(result)).toEqual([
      'Invoice:class:ERD',
      'Total:method:ERD',
      'Pay:method:ER-',
      'Hidden:method:---',
      'ToString:method:E--',
      'Internal:class:---',
      'Run:method:---',
      'IPayable:interface:ER-',
      'Pay:method:ER-',
      'Money:struct:ER-',
      'Status:enum:ER-',
      'Receipt:class:ER-',
    ]);
  });
});

describe('Swift documentation', () => {
  it('requires docs on public and open declarations only', async () => {
    const result = await analyze(
      '/p/Invoice.swift',
      source(
        'import Foundation',
        '/// Represents one invoice sent to a customer.',
        'public class Invoice {',
        '    /// Returns the total amount including tax.',
        '    public func total() -> Int { 1 }',
        '    public func pay() {}',
        '    func internalOnly() {}',
        '    private func secret() {}',
        '    public override func describe() {}',
        '}',
        'public protocol Payable { func pay() }',
        'struct Internal {}',
        'public struct Money {}',
        'public enum Status { case open }',
        'public typealias Id = Int',
        'public func topLevel() {}',
        'actor Worker {}'
      )
    );
    expect(verdicts(result)).toEqual([
      'Invoice:class:ERD',
      'total:method:ERD',
      'pay:method:ER-',
      'internalOnly:method:---',
      'secret:method:---',
      'describe:method:E--',
      'Payable:interface:ER-',
      'pay:method:ER-',
      'Internal:struct:---',
      'Money:struct:ER-',
      'Status:enum:ER-',
      'Id:type:ER-',
      'topLevel:function:ER-',
      'Worker:class:---',
    ]);
  });
});

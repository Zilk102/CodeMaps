import { describe, expect, it } from 'vitest';
import { analyze, repeatLines, source, verdicts } from './documentationTestKit';

const LONG_BODY = repeatLines(10, (i) => `        total += ${i}`);

describe('Python documentation', () => {
  const fixture = source(
    '"""Utilities that load and validate project settings."""',
    'import os',
    '',
    'class Loader:',
    '    """Loads settings from disk and caches them."""',
    '    def read(self):',
    '        """Reads the settings file from the given path."""',
    '        return 1',
    '',
    '    def write(self):',
    '        return 2',
    '',
    '    def _private_short(self):',
    '        return 3',
    '',
    '    def _private_long(self):',
    '        total = 0',
    ...LONG_BODY,
    '        return total',
    '',
    '    def __init__(self):',
    '        pass',
    '',
    '@decorator',
    'def top_level(a):',
    '    # a comment is not a docstring',
    '    return a',
    '',
    'def _hidden():',
    '    pass',
    '',
    'class _Internal:',
    '    def public_name(self):',
    '        pass',
    '',
    'def outer():',
    '    def inner():',
    '        pass'
  );

  it('uses docstrings and public names', async () => {
    const result = await analyze('/p/pkg/loader.py', fixture);
    expect(verdicts(result)).toEqual([
      'Loader:class:ERD',
      'read:method:ERD',
      'write:method:ER-',
      '_private_short:method:---',
      '_private_long:method:-R-',
      '__init__:method:---',
      'top_level:function:ER-',
      '_hidden:function:---',
      '_Internal:class:---',
      'public_name:method:---',
      'outer:function:ER-',
    ]);
    expect(result.header).toBe('documented');
  });

  it('treats everything in a private module as not exported', async () => {
    const result = await analyze('/p/pkg/_helpers.py', 'def helper():\n    pass\n');
    expect(verdicts(result)).toEqual(['helper:function:---']);
    const init = await analyze('/p/pkg/__init__.py', 'def helper():\n    pass\n');
    expect(verdicts(init)).toEqual(['helper:function:ER-']);
  });

  it('does not accept a leading comment as the module docstring', async () => {
    const result = await analyze(
      '/p/pkg/plain.py',
      source('# Utilities that load project settings.', ...repeatLines(16, (i) => `x${i} = ${i}`))
    );
    expect(result.header).toBe('missing');
  });

  it('flags commented-out code but not prose comments', async () => {
    const result = await analyze(
      '/p/pkg/old.py',
      source(
        '"""Old helpers kept around for reference."""',
        '# This helper exists because the legacy importer',
        '# still calls it from a few places in the code.',
        '# We will remove it after the migration is done.',
        '',
        '# x = compute(1)',
        '# if x > 2:',
        '#     print(x)',
        '# y = x + 1',
        'y = 1'
      )
    );
    expect(result.commentedOutCode).toEqual([{ startLine: 6, endLine: 9 }]);
  });
});

describe('Ruby documentation', () => {
  it('uses comment blocks above and respects private sections', async () => {
    const result = await analyze(
      '/p/invoice.rb',
      source(
        '# Models for the billing subsystem of the service.',
        '',
        '# Represents one invoice that was sent to a customer.',
        'class Invoice',
        '  # Returns the total amount including tax.',
        '  def total',
        '    1',
        '  end',
        '',
        '  def pay; end',
        '',
        '  def self.build; end',
        '',
        '  private',
        '',
        '  def secret',
        '    1',
        '  end',
        'end',
        '',
        'module Helpers',
        '  def helper; end',
        'end',
        '',
        'def top_level; end'
      )
    );
    expect(verdicts(result)).toEqual([
      'Invoice:class:ERD',
      'total:method:ERD',
      'pay:method:ER-',
      'build:method:ER-',
      'secret:method:---',
      'Helpers:class:ER-',
      'helper:method:ER-',
      'top_level:function:ER-',
    ]);
    expect(result.header).toBe('documented');
  });

  it('does not count magic comments as documentation', async () => {
    const result = await analyze(
      '/p/magic.rb',
      source('# frozen_string_literal: true', 'class Plain', 'end')
    );
    expect(verdicts(result)).toEqual(['Plain:class:ER-']);
  });
});

describe('PHP documentation', () => {
  it('uses PHPDoc and visibility keywords', async () => {
    const result = await analyze(
      '/p/Invoice.php',
      source(
        '<?php',
        '/** Billing helpers for invoices of customers. */',
        'namespace App;',
        '',
        '/** Represents one invoice sent to a customer. */',
        'class Invoice {',
        '    /** Returns the invoice total with tax. */',
        '    public function total() {}',
        '    private function secret() {}',
        '    protected function guarded() {}',
        '    function implicitPublic() {}',
        '}',
        'interface Payable { public function pay(); }',
        'trait Loggable {}',
        'enum Status { case Open; }',
        '/** Formats a money amount for display. */',
        'function format_money() {}'
      )
    );
    expect(verdicts(result)).toEqual([
      'Invoice:class:ERD',
      'total:method:ERD',
      'secret:method:---',
      'guarded:method:---',
      'implicitPublic:method:ER-',
      'Payable:interface:ER-',
      'pay:method:ER-',
      'Loggable:trait:ER-',
      'Status:enum:ER-',
      'format_money:function:ERD',
    ]);
    expect(result.header).toBe('documented');
  });
});

describe('Bash documentation', () => {
  it('requires a comment above every function and reads the header after the shebang', async () => {
    const result = await analyze(
      '/p/deploy.sh',
      source(
        '#!/usr/bin/env bash',
        '# Deployment helpers for the staging environment.',
        '',
        '# Builds the release bundle and uploads it.',
        'function build_release() {',
        '  echo build',
        '}',
        '',
        'deploy() {',
        '  echo deploy',
        '}',
        '',
        'function cleanup {',
        '  echo clean',
        '}'
      )
    );
    expect(verdicts(result)).toEqual([
      'build_release:function:ERD',
      'deploy:function:ER-',
      'cleanup:function:ER-',
    ]);
    expect(result.header).toBe('documented');
  });

  it('does not take the shebang for a header', async () => {
    const result = await analyze(
      '/p/run.sh',
      source('#!/usr/bin/env bash', ...repeatLines(16, () => 'echo hello'))
    );
    expect(result.header).toBe('missing');
  });
});

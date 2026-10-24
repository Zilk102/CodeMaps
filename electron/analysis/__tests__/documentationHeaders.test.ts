import { describe, expect, it } from 'vitest';
import { analyze, repeatLines, source } from './documentationTestKit';

interface HeaderCase {
  language: string;
  file: string;
  /** The top of a file that opens with a header in this language's convention. */
  withHeader: string[];
  /** The top of a file that does not. */
  withoutHeader: string[];
}

// Every file is padded with blank lines to reach the length that requires a header.
const PADDING = repeatLines(16, () => '');

const CASES: HeaderCase[] = [
  {
    language: 'typescript',
    file: '/p/a.ts',
    withHeader: ['/** Parses configuration files and merges defaults. */', 'export const a = 1;'],
    withoutHeader: ['export const a = 1;'],
  },
  {
    language: 'tsx',
    file: '/p/a.tsx',
    withHeader: ['// Renders the settings page of the application.', 'export const a = 1;'],
    withoutHeader: ['export const a = 1;'],
  },
  {
    language: 'javascript',
    file: '/p/a.js',
    withHeader: ['/* Small helpers shared by the build scripts. */', 'module.exports = {};'],
    withoutHeader: ['module.exports = {};'],
  },
  {
    language: 'python',
    file: '/p/a.py',
    withHeader: ['"""Utilities for loading project settings."""', 'x = 1'],
    withoutHeader: ['# Utilities for loading project settings.', 'x = 1'],
  },
  {
    language: 'go',
    file: '/p/a.go',
    withHeader: ['// Package billing models invoices for the service.', 'package billing'],
    withoutHeader: ['package billing'],
  },
  {
    language: 'rust',
    file: '/p/a.rs',
    withHeader: ['//! Billing model types used by the invoice service.', 'pub struct A;'],
    withoutHeader: ['// Billing model types used by the invoice service.', 'pub struct A;'],
  },
  {
    language: 'java',
    file: '/p/A.java',
    withHeader: ['/** Billing model classes used by the service. */', 'package app;'],
    withoutHeader: ['package app;'],
  },
  {
    language: 'cpp',
    file: '/p/a.hpp',
    withHeader: ['/** Billing model types used by the service. */', '#pragma once'],
    withoutHeader: ['#pragma once'],
  },
  {
    language: 'c_sharp',
    file: '/p/A.cs',
    withHeader: ['// Billing model types used by the service.', 'using System;'],
    withoutHeader: ['using System;'],
  },
  {
    language: 'php',
    file: '/p/a.php',
    withHeader: ['<?php', '/** Billing helpers for invoices of customers. */', 'namespace App;'],
    withoutHeader: ['<?php', 'namespace App;'],
  },
  {
    language: 'ruby',
    file: '/p/a.rb',
    withHeader: ['# Models for the billing subsystem of the service.', '', 'require "json"'],
    withoutHeader: ['require "json"'],
  },
  {
    language: 'zig',
    file: '/p/a.zig',
    withHeader: ['//! Billing model types used by the service.', 'const a = 1;'],
    withoutHeader: ['// Billing model types used by the service.', 'const a = 1;'],
  },
  {
    language: 'swift',
    file: '/p/a.swift',
    withHeader: ['// Billing model types used by the service.', 'import Foundation'],
    withoutHeader: ['import Foundation'],
  },
  {
    language: 'kotlin',
    file: '/p/A.kt',
    withHeader: ['/** Billing model classes used by the service. */', 'package app'],
    withoutHeader: ['package app'],
  },
  {
    language: 'bash',
    file: '/p/a.sh',
    withHeader: ['#!/bin/bash', '# Deployment helpers for the staging environment.', 'set -e'],
    withoutHeader: ['#!/bin/bash', 'set -e'],
  },
  {
    language: 'vue',
    file: '/p/A.vue',
    withHeader: ['<!-- Panel that lists the pending jobs of a queue. -->', '<template></template>'],
    withoutHeader: ['<template></template>'],
  },
];

describe('file header detection', () => {
  it.each(CASES)('$language: accepts its convention and flags a file without one', async (c) => {
    const documented = await analyze(c.file, source(...c.withHeader, ...PADDING));
    const missing = await analyze(c.file, source(...c.withoutHeader, ...PADDING));
    expect(documented.language).toBe(c.language);
    expect(documented.header).toBe('documented');
    expect(missing.header).toBe('missing');
  });

  it.each(CASES)('$language: files shorter than the minimum need no header', async (c) => {
    const short = await analyze(c.file, source(...c.withoutHeader));
    expect(short.header).toBe('n/a');
  });
});

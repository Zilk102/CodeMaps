/**
 * Catalog entries for package managers (npm, pnpm, Yarn, Bun, Poetry, pip, Composer, Bundler, NuGet).
 */
import type { StackDefinition } from './stackCatalogTypes';

export const PACKAGE_MANAGER_STACKS: StackDefinition[] = [
  {
    id: 'npm',
    displayName: 'npm',
    category: 'package_manager',
    ecosystem: 'node',
    confidence: 'high',
    matchMode: 'any',
    rules: [
      { type: 'basename', anyOf: ['package-lock.json'] },
      {
        type: 'json_field_includes',
        file: 'package.json',
        field: 'packageManager',
        anyOf: ['npm@', 'npm'],
      },
    ],
  },
  {
    id: 'pnpm',
    displayName: 'pnpm',
    category: 'package_manager',
    ecosystem: 'node',
    confidence: 'high',
    matchMode: 'any',
    rules: [
      { type: 'basename', anyOf: ['pnpm-lock.yaml'] },
      {
        type: 'json_field_includes',
        file: 'package.json',
        field: 'packageManager',
        anyOf: ['pnpm@', 'pnpm'],
      },
    ],
  },
  {
    id: 'yarn',
    displayName: 'Yarn',
    category: 'package_manager',
    ecosystem: 'node',
    confidence: 'high',
    matchMode: 'any',
    rules: [
      { type: 'basename', anyOf: ['yarn.lock'] },
      {
        type: 'json_field_includes',
        file: 'package.json',
        field: 'packageManager',
        anyOf: ['yarn@', 'yarn'],
      },
    ],
  },
  {
    id: 'bun',
    displayName: 'Bun',
    category: 'package_manager',
    ecosystem: 'node',
    confidence: 'high',
    matchMode: 'any',
    rules: [
      { type: 'basename', anyOf: ['bun.lockb', 'bun.lock'] },
      {
        type: 'json_field_includes',
        file: 'package.json',
        field: 'packageManager',
        anyOf: ['bun@', 'bun'],
      },
    ],
  },
  {
    id: 'poetry',
    displayName: 'Poetry',
    category: 'package_manager',
    ecosystem: 'python',
    confidence: 'high',
    matchMode: 'any',
    rules: [
      { type: 'relative_path', anyOf: ['poetry.lock'] },
      { type: 'text_contains', file: 'pyproject.toml', anyOf: ['[tool.poetry]'] },
    ],
  },
  {
    id: 'pip',
    displayName: 'pip',
    category: 'package_manager',
    ecosystem: 'python',
    confidence: 'medium',
    matchMode: 'any',
    rules: [
      { type: 'relative_path', anyOf: ['requirements.txt', 'requirements-dev.txt'] },
      { type: 'text_contains', file: 'pyproject.toml', anyOf: ['[project]', '[build-system]'] },
    ],
  },
  {
    id: 'composer',
    displayName: 'Composer',
    category: 'package_manager',
    ecosystem: 'php',
    confidence: 'high',
    rules: [{ type: 'relative_path', anyOf: ['composer.json'] }],
  },
  {
    id: 'bundler',
    displayName: 'Bundler',
    category: 'package_manager',
    ecosystem: 'ruby',
    confidence: 'high',
    rules: [{ type: 'relative_path', anyOf: ['Gemfile', 'Gemfile.lock'] }],
  },
  {
    id: 'nuget',
    displayName: 'NuGet',
    category: 'package_manager',
    ecosystem: 'dotnet',
    confidence: 'medium',
    matchMode: 'any',
    rules: [
      { type: 'basename', anyOf: ['packages.config', 'Directory.Packages.props'] },
      { type: 'suffix', anyOf: ['.csproj', '.fsproj', '.vbproj'] },
    ],
  },
];

/** Words that start almost every symbol of a layer and say nothing about its topic. */
const STOP_TOKENS = new Set([
  'get',
  'set',
  'put',
  'post',
  'patch',
  'delete',
  'list',
  'create',
  'update',
  'new',
  'handle',
  'handler',
  'handlers',
  'is',
  'has',
  'to',
  'from',
  'with',
  'find',
  'load',
  'save',
  'add',
  'remove',
  'build',
  'make',
  'parse',
  'run',
  'init',
  'the',
  'and',
  'for',
  'all',
  'one',
  'do',
  'on',
  'by',
  'func',
  'impl',
  'self',
  'this',
  'test',
  'new',
  'default',
  'util',
  'utils',
  'helper',
  'helpers',
  'request',
  'response',
  'result',
  'value',
  'data',
  'info',
  'item',
  'items',
  'type',
  'types',
]);

const CLASS_PER_FILE_LANGUAGES = new Set(['java', 'kotlin', 'c_sharp']);

export const simpleName = (name: string) => name.split(/[.:]+/).filter(Boolean).pop() ?? name;

/** `users` and `user` name the same topic. */
const stem = (token: string) =>
  token.length > 4 && /[^siu]s$/.test(token) ? token.slice(0, -1) : token;

export const tokenize = (name: string): string[] =>
  simpleName(name)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .map((token) => token.toLowerCase())
    .map(stem)
    .filter((token) => token.length >= 3 && !STOP_TOKENS.has(token) && !/^\d+$/.test(token));

const titleCase = (value: string) =>
  value
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('');

export const fileNameFor = (clusterName: string, language: string, extension: string) =>
  CLASS_PER_FILE_LANGUAGES.has(language)
    ? `${titleCase(clusterName)}${extension}`
    : `${clusterName}${extension}`;

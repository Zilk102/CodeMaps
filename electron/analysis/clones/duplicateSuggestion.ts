import * as path from 'path';
import type { DuplicateCopy, DuplicateSuggestion } from './duplicateReportTypes';

// ---- Suggestions ------------------------------------------------------------------------

const commonDirectory = (files: string[]): string => {
  const parts = files.map((file) =>
    path.posix
      .dirname(file)
      .split('/')
      .filter((p) => p !== '.')
  );
  const common: string[] = [];
  for (let index = 0; index < parts[0].length; index += 1) {
    if (!parts.every((segments) => segments[index] === parts[0][index])) break;
    common.push(parts[0][index]);
  }
  return common.join('/');
};

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;
const copiesOf = (count: number) => `${count} ${count === 1 ? 'copy' : 'copies'}`;

const rangeOf = (copy: DuplicateCopy) => `${copy.file}:${copy.startLine}-${copy.endLine}`;

const parameterNote = (parameters: number): string =>
  parameters < 0
    ? 'compare them by hand to find the parameters, because the copies were edited after being pasted and could not be aligned'
    : `pass the ${plural(parameters, 'differing value')} as parameters`;

export const chooseSuggestion = (
  copies: DuplicateCopy[],
  parameters: number
): DuplicateSuggestion => {
  const files = copies.map((copy) => copy.file);
  const directories = files.map((file) => path.posix.dirname(file));
  const sameFile = files.every((file) => file === files[0]);
  const samePackage = directories.every((directory) => directory === directories[0]);
  const first = copies[0];
  const where = `${copiesOf(copies.length)} (${copies.map(rangeOf).join(', ')})`;

  if (parameters === 0 && samePackage) {
    return {
      action: 'merge_into_one',
      sameFile,
      samePackage,
      parameters,
      targetFile: first.file,
      reason: `${where} are identical: keep the one in ${first.file} and replace the others with a call to it.`,
    };
  }
  if (samePackage) {
    return {
      action: 'extract_function',
      sameFile,
      samePackage,
      parameters,
      targetFile: first.file,
      reason: `Extract one function in ${first.file} for ${where} and ${parameterNote(parameters)}.`,
    };
  }
  const directory = commonDirectory(files);
  const extension = path.posix.extname(first.file);
  return {
    action: 'extract_shared_module',
    sameFile,
    samePackage,
    parameters,
    targetFile: `${directory ? `${directory}/` : ''}shared${extension}`,
    reason: `${where} live in different packages: move the code into a shared module${directory ? ` under ${directory}` : ''} and ${parameters === 0 ? 'import it from each place' : parameterNote(parameters)}.`,
  };
};

import { describe, expect, it } from 'vitest';
import { describeNode, toErrorMessage, unwrapResponse } from './panelUtils';

describe('toErrorMessage', () => {
  it('uses the error message when present', () => {
    expect(toErrorMessage(new Error('boom'), 'fallback')).toBe('boom');
  });

  it('falls back when the error message is empty', () => {
    expect(toErrorMessage(new Error(''), 'fallback')).toBe('fallback');
  });

  it('falls back for non-Error values', () => {
    expect(toErrorMessage('x', 'fallback')).toBe('fallback');
    expect(toErrorMessage(undefined, 'fallback')).toBe('fallback');
  });
});

describe('unwrapResponse', () => {
  it('returns data of a successful response', () => {
    expect(unwrapResponse<number[]>({ success: true, data: [1] })).toEqual([1]);
  });

  it('throws the response error', () => {
    expect(() => unwrapResponse({ success: false, error: 'nope' })).toThrow('nope');
  });

  it('throws a generic error when none is given', () => {
    expect(() => unwrapResponse({ success: true })).toThrow('Unknown error');
  });
});

describe('describeNode', () => {
  it('formats label and type', () => {
    expect(describeNode({ label: 'foo', type: 'class' })).toBe('foo · class');
  });

  it('returns null without a node', () => {
    expect(describeNode(null)).toBeNull();
    expect(describeNode(undefined)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { unwrapResponse } from './AnalysisPanelFrame';

describe('unwrapResponse', () => {
  it('returns the data of a successful answer', () => {
    expect(unwrapResponse({ success: true, data: { total: 3 } })).toEqual({ total: 3 });
  });

  it('throws the error of a failed answer, with a fallback text', () => {
    expect(() => unwrapResponse({ success: false, error: 'no graph' })).toThrow('no graph');
    expect(() => unwrapResponse({ success: false, error: '' })).toThrow('Unknown error');
  });
});

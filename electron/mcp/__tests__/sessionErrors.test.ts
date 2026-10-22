import { describe, expect, it, vi } from 'vitest';
import { rejectUnknownSession } from '../sessionErrors';

const fakeResponse = () => {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return { res: { status }, status, json };
};

describe('rejectUnknownSession', () => {
  it('answers 404 for a session id issued before a restart so clients re-initialize', () => {
    const { res, status, json } = fakeResponse();
    rejectUnknownSession(res, 'stale-session-id');
    expect(status).toHaveBeenCalledWith(404);
    expect(json.mock.calls[0][0].error.message).toMatch(/re-initialize/);
  });

  it('answers 400 when no session id was sent', () => {
    const { res, status } = fakeResponse();
    rejectUnknownSession(res, undefined);
    expect(status).toHaveBeenCalledWith(400);
  });
});

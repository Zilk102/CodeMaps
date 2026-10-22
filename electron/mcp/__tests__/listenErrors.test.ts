import * as http from 'http';
import { AddressInfo } from 'net';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocketServer } from 'ws';
import { classifyListenError, watchListenErrors, type McpListenError } from '../listenErrors';

const listen = (server: http.Server, port = 0) =>
  new Promise<number>((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve((server.address() as AddressInfo).port));
  });

describe('classifyListenError', () => {
  it('tells a busy port from other failures', () => {
    expect(classifyListenError(Object.assign(new Error('x'), { code: 'EADDRINUSE' }))).toBe(
      'port_in_use'
    );
    expect(classifyListenError(Object.assign(new Error('x'), { code: 'EACCES' }))).toBe(
      'listen_failed'
    );
  });
});

describe('watchListenErrors with a busy port', () => {
  const servers: http.Server[] = [];
  afterEach(() => servers.splice(0).forEach((server) => server.close()));

  it('reports the failure instead of throwing from the ws server', async () => {
    const occupant = http.createServer();
    servers.push(occupant);
    const port = await listen(occupant);

    const second = http.createServer();
    servers.push(second);
    const wss = new WebSocketServer({ server: second });

    const failures: Array<[McpListenError, string]> = [];
    const uncaught: Error[] = [];
    const onUncaught = (error: Error) => uncaught.push(error);
    process.on('uncaughtException', onUncaught);

    try {
      watchListenErrors([second, wss], (kind, error) => failures.push([kind, error.message]));
      second.listen(port, '127.0.0.1');
      await new Promise((resolve) => setTimeout(resolve, 200));
    } finally {
      process.off('uncaughtException', onUncaught);
    }

    expect(uncaught).toEqual([]);
    expect(failures.length).toBeGreaterThanOrEqual(1);
    expect(failures.every(([kind]) => kind === 'port_in_use')).toBe(true);
  });

  it('would crash without a listener on the ws server (the original bug)', async () => {
    const occupant = http.createServer();
    servers.push(occupant);
    const port = await listen(occupant);

    const second = http.createServer();
    servers.push(second);
    const wss = new WebSocketServer({ server: second });
    second.on('error', () => undefined); // the HTTP server alone is not enough
    expect(wss.listenerCount('error')).toBe(0);

    const emitted = new Promise<Error>((resolve) => {
      // Observe what ws forwards, without letting it throw inside the test runner.
      wss.once('error', resolve);
    });
    second.listen(port, '127.0.0.1');

    expect((await emitted).message).toMatch(/EADDRINUSE|address already in use/i);
  });
});

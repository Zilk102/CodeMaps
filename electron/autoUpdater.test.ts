import { beforeEach, describe, expect, it, vi } from 'vitest';

const ipcHandlers = new Map<string, (...args: unknown[]) => unknown>();

const handleMock = vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
  ipcHandlers.set(channel, handler);
});

const quitAndInstallMock = vi.fn();
const setFeedUrlMock = vi.fn();
const removeAllListenersMock = vi.fn();
const onMock = vi.fn();

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
  },
  ipcMain: {
    handle: handleMock,
  },
  BrowserWindow: vi.fn(),
}));

vi.mock('electron-updater', () => ({
  autoUpdater: {
    setFeedURL: setFeedUrlMock,
    quitAndInstall: quitAndInstallMock,
    removeAllListeners: removeAllListenersMock,
    on: onMock,
  },
}));

vi.mock('electron-log/main', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('initAutoUpdater install flow', () => {
  beforeEach(() => {
    vi.resetModules();
    ipcHandlers.clear();
    handleMock.mockClear();
    quitAndInstallMock.mockClear();
    setFeedUrlMock.mockClear();
    removeAllListenersMock.mockClear();
    onMock.mockClear();
    process.env.NODE_ENV = 'test';
  });

  it('delegates update installation through provided callback', async () => {
    const { initAutoUpdater } = await import('./autoUpdater.js');
    const onInstallRequested = vi.fn().mockResolvedValue(undefined);
    const fakeWindow = {
      isDestroyed: () => false,
      webContents: {
        send: vi.fn(),
      },
    };

    initAutoUpdater(fakeWindow as any, { onInstallRequested });

    const installHandler = ipcHandlers.get('updater:install');
    expect(installHandler).toBeTypeOf('function');

    const result = await installHandler!();

    expect(onInstallRequested).toHaveBeenCalledTimes(1);
    expect(quitAndInstallMock).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true });
  });

  it('falls back to direct installer restart when callback is absent', async () => {
    const { initAutoUpdater } = await import('./autoUpdater.js');
    const fakeWindow = {
      isDestroyed: () => false,
      webContents: {
        send: vi.fn(),
      },
    };

    initAutoUpdater(fakeWindow as any);

    const installHandler = ipcHandlers.get('updater:install');
    expect(installHandler).toBeTypeOf('function');

    const result = await installHandler!();

    expect(quitAndInstallMock).toHaveBeenCalledTimes(1);
    expect(quitAndInstallMock).toHaveBeenCalledWith(true, true);
    expect(result).toEqual({ success: true });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  const originalPlatform = process.platform;

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

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true,
    });
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

  it('disables auto install on app quit for packaged Windows builds', async () => {
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      configurable: true,
    });

    const { app } = await import('electron');
    const { autoUpdater } = await import('electron-updater');
    const { initAutoUpdater } = await import('./autoUpdater.js');

    (app as any).isPackaged = true;

    const fakeWindow = {
      isDestroyed: () => false,
      webContents: {
        send: vi.fn(),
      },
    };

    initAutoUpdater(fakeWindow as any);

    expect((autoUpdater as any).autoDownload).toBe(true);
    expect((autoUpdater as any).autoInstallOnAppQuit).toBe(false);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ElectronAppEntry } from './electron-apps.js';
import { detectProcess, discoverAppPath, isChromeCDPVersionPayload, launchDetachedApp, launchElectronApp, probeCDP, resolveChromeEndpoint, resolveExecutableCandidates } from './launcher.js';

interface MockChildProcess {
  once: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  unref: ReturnType<typeof vi.fn>;
  emit: (event: string, value?: unknown) => void;
}

function createMockChildProcess(): MockChildProcess {
  const listeners = new Map<string, Array<(value?: unknown) => void>>();

  return {
    once: vi.fn((event: string, handler: (value?: unknown) => void) => {
      listeners.set(event, [...(listeners.get(event) ?? []), handler]);
    }),
    off: vi.fn((event: string, handler: (value?: unknown) => void) => {
      listeners.set(event, (listeners.get(event) ?? []).filter((listener) => listener !== handler));
    }),
    unref: vi.fn(),
    emit: (event: string, value?: unknown) => {
      for (const listener of listeners.get(event) ?? []) listener(value);
    },
  };
}

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}));

const cp = vi.mocked(await import('node:child_process'));
const fsMod = vi.mocked(await import('node:fs'));

describe('probeCDP', () => {
  it('returns false when CDP endpoint is unreachable', async () => {
    const result = await probeCDP(59999, 500);
    expect(result).toBe(false);
  });
});

describe('resolveChromeEndpoint', () => {
  async function importFreshLauncher() {
    vi.resetModules();
    return await import('./launcher.js');
  }

  function captureStderr() {
    return vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  }

  it('recognizes Chrome CDP version payloads but rejects Electron endpoints', () => {
    expect(isChromeCDPVersionPayload({ Browser: 'Chrome/142.0.0.0', 'User-Agent': 'Mozilla/5.0 Chrome/142 Safari/537.36' })).toBe(true);
    expect(isChromeCDPVersionPayload({ Browser: 'Chrome/142.0.0.0', 'User-Agent': 'Mozilla/5.0 Electron/38 Chrome/142 Safari/537.36' })).toBe(false);
  });

  it('prefers an already-listening Chrome CDP endpoint and creates a safe fresh target', async () => {
    const launchChrome = vi.fn();
    const createChromeTarget = vi.fn().mockResolvedValue('ws://127.0.0.1:9222/devtools/page/safe-tab');

    await expect(resolveChromeEndpoint({}, {
      probeChromeCDP: vi.fn().mockResolvedValue(true),
      createChromeTarget,
      launchChrome,
      pollForReady: vi.fn(),
      discoverChromeExecutable: vi.fn().mockReturnValue('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
    })).resolves.toBe('ws://127.0.0.1:9222/devtools/page/safe-tab');

    expect(createChromeTarget).toHaveBeenCalledWith(9222, undefined);
    expect(launchChrome).not.toHaveBeenCalled();
  });

  it('launches Google Chrome with the default logged-in profile when CDP is not already listening', async () => {
    const launchChrome = vi.fn().mockResolvedValue(undefined);
    const pollForReady = vi.fn().mockResolvedValue(undefined);
    const createChromeTarget = vi.fn().mockResolvedValue('ws://127.0.0.1:9333/devtools/page/fresh-tab');

    await expect(resolveChromeEndpoint({ port: 9333 }, {
      probeChromeCDP: vi.fn().mockResolvedValue(false),
      probeAnyCDP: vi.fn().mockResolvedValue(false),
      createChromeTarget,
      discoverChromeExecutable: vi.fn().mockReturnValue('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
      launchChrome,
      pollForReady,
    })).resolves.toBe('ws://127.0.0.1:9333/devtools/page/fresh-tab');

    expect(launchChrome).toHaveBeenCalledWith(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      expect.arrayContaining([
        '--remote-debugging-port=9333',
        '--profile-directory=Default',
        '--no-first-run',
        '--no-default-browser-check',
      ]),
    );
    const launchArgs = launchChrome.mock.calls[0][1] as string[];
    expect(launchArgs.some((arg) => arg.startsWith('--user-data-dir='))).toBe(false);
    expect(pollForReady).toHaveBeenCalledWith(9333);
    expect(createChromeTarget).toHaveBeenCalledWith(9333, undefined);
  });

  it('falls back when the default port is occupied by a non-Chrome CDP endpoint', async () => {
    const previous = process.env.OPENCLI_CHROME_CDP_GUIDANCE;
    process.env.OPENCLI_CHROME_CDP_GUIDANCE = '0';
    const launchChrome = vi.fn();

    await expect(resolveChromeEndpoint({ port: 9222 }, {
      probeChromeCDP: vi.fn().mockResolvedValue(false),
      probeAnyCDP: vi.fn().mockResolvedValue(true),
      discoverChromeExecutable: vi.fn().mockReturnValue('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
      launchChrome,
    })).resolves.toBeUndefined();

    expect(launchChrome).not.toHaveBeenCalled();
    if (previous === undefined) delete process.env.OPENCLI_CHROME_CDP_GUIDANCE;
    else process.env.OPENCLI_CHROME_CDP_GUIDANCE = previous;
  });

  it('falls back when Chrome auto-launch or readiness polling fails', async () => {
    const previous = process.env.OPENCLI_CHROME_CDP_GUIDANCE;
    process.env.OPENCLI_CHROME_CDP_GUIDANCE = '0';

    await expect(resolveChromeEndpoint({ port: 9444 }, {
      probeChromeCDP: vi.fn().mockResolvedValue(false),
      probeAnyCDP: vi.fn().mockResolvedValue(false),
      discoverChromeExecutable: vi.fn().mockReturnValue('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
      launchChrome: vi.fn().mockResolvedValue(undefined),
      pollForReady: vi.fn().mockRejectedValue(new Error('port never became ready')),
    })).resolves.toBeUndefined();

    if (previous === undefined) delete process.env.OPENCLI_CHROME_CDP_GUIDANCE;
    else process.env.OPENCLI_CHROME_CDP_GUIDANCE = previous;
  });

  it('emits customer Chrome CDP fallback guidance only once when Chrome cannot be auto-resolved', async () => {
    delete process.env.OPENCLI_CHROME_CDP_GUIDANCE;
    const { resolveChromeEndpoint: freshResolveChromeEndpoint } = await importFreshLauncher();
    const stderr = captureStderr();
    const deps = {
      probeChromeCDP: vi.fn().mockResolvedValue(false),
      probeAnyCDP: vi.fn().mockResolvedValue(false),
      discoverChromeExecutable: vi.fn().mockReturnValue(null),
    };

    await expect(freshResolveChromeEndpoint({ port: 9222 }, deps)).resolves.toBeUndefined();
    await expect(freshResolveChromeEndpoint({ port: 9222 }, deps)).resolves.toBeUndefined();

    const output = stderr.mock.calls.map((call) => String(call[0])).join('');
    expect((output.match(/Chrome CDP auto-connect is unavailable/g) ?? []).length).toBe(1);
    expect(output).toContain('falling back to Browser Bridge');
    expect(output).toContain('OPENCLI_CDP_ENDPOINT=http://127.0.0.1:9222');
    expect(output).toContain('--user-data-dir=');
    expect(output).toContain('OPENCLI_CHROME_CDP_GUIDANCE=0');
    stderr.mockRestore();
  });

  it('suppresses customer Chrome CDP fallback guidance when disabled by env', async () => {
    const previous = process.env.OPENCLI_CHROME_CDP_GUIDANCE;
    process.env.OPENCLI_CHROME_CDP_GUIDANCE = '0';
    const { resolveChromeEndpoint: freshResolveChromeEndpoint } = await importFreshLauncher();
    const stderr = captureStderr();

    await expect(freshResolveChromeEndpoint({ port: 9222 }, {
      probeChromeCDP: vi.fn().mockResolvedValue(false),
      probeAnyCDP: vi.fn().mockResolvedValue(false),
      discoverChromeExecutable: vi.fn().mockReturnValue(null),
    })).resolves.toBeUndefined();

    const output = stderr.mock.calls.map((call) => String(call[0])).join('');
    expect(output).not.toContain('Chrome CDP auto-connect is unavailable');
    if (previous === undefined) delete process.env.OPENCLI_CHROME_CDP_GUIDANCE;
    else process.env.OPENCLI_CHROME_CDP_GUIDANCE = previous;
    stderr.mockRestore();
  });

  it('falls back safely and guides when auto-launched Chrome never exposes CDP', async () => {
    delete process.env.OPENCLI_CHROME_CDP_GUIDANCE;
    const { resolveChromeEndpoint: freshResolveChromeEndpoint } = await importFreshLauncher();
    const stderr = captureStderr();
    const createChromeTarget = vi.fn().mockResolvedValue('ws://127.0.0.1:9444/devtools/page/unsafe');

    await expect(freshResolveChromeEndpoint({ port: 9444 }, {
      probeChromeCDP: vi.fn().mockResolvedValue(false),
      probeAnyCDP: vi.fn().mockResolvedValue(false),
      discoverChromeExecutable: vi.fn().mockReturnValue('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
      launchChrome: vi.fn().mockResolvedValue(undefined),
      pollForReady: vi.fn().mockRejectedValue(new Error('port never became ready')),
      createChromeTarget,
    })).resolves.toBeUndefined();

    const output = stderr.mock.calls.map((call) => String(call[0])).join('');
    expect(output).toContain('Chrome CDP auto-connect is unavailable');
    expect(output).toContain('port never became ready');
    expect(output).toContain('falling back to Browser Bridge');
    expect(createChromeTarget).not.toHaveBeenCalled();
    stderr.mockRestore();
  });

  it('does not claim direct Chrome CDP is ready when the port is occupied by non-Chrome CDP', async () => {
    delete process.env.OPENCLI_CHROME_CDP_GUIDANCE;
    const { resolveChromeEndpoint: freshResolveChromeEndpoint } = await importFreshLauncher();
    const stderr = captureStderr();
    const launchChrome = vi.fn();

    await expect(freshResolveChromeEndpoint({ port: 9222 }, {
      probeChromeCDP: vi.fn().mockResolvedValue(false),
      probeAnyCDP: vi.fn().mockResolvedValue(true),
      discoverChromeExecutable: vi.fn().mockReturnValue('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
      launchChrome,
    })).resolves.toBeUndefined();

    const output = stderr.mock.calls.map((call) => String(call[0])).join('');
    expect(output).toContain('non-Chrome CDP endpoint');
    expect(output).toContain('falling back to Browser Bridge');
    expect(output).not.toContain('Chrome CDP is ready');
    expect(launchChrome).not.toHaveBeenCalled();
    stderr.mockRestore();
  });
});

describe('detectProcess', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns false when pgrep finds no process', () => {
    cp.execFileSync.mockImplementation(() => {
      const err = new Error('exit 1') as Error & { status: number };
      err.status = 1;
      throw err;
    });
    const result = detectProcess('NonExistentApp');
    expect(result).toBe(false);
  });

  it.skipIf(process.platform === 'win32')('returns true when pgrep finds a process', () => {
    cp.execFileSync.mockReturnValue('12345\n');
    const result = detectProcess('Cursor');
    expect(result).toBe(true);
  });
});

describe('discoverAppPath', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it.skipIf(process.platform !== 'darwin')('returns path when osascript succeeds', () => {
    cp.execFileSync.mockReturnValue('/Applications/Cursor.app/\n');
    const result = discoverAppPath('Cursor');
    expect(result).toBe('/Applications/Cursor.app');
  });

  it.skipIf(process.platform !== 'darwin')('falls back to /Applications when osascript times out', () => {
    cp.execFileSync.mockImplementation(() => {
      throw new Error('app lookup timed out');
    });
    fsMod.existsSync.mockImplementation((candidate) => candidate === '/Applications/Codex.app');
    const result = discoverAppPath('Codex');
    expect(result).toBe('/Applications/Codex.app');
  });

  it.skipIf(process.platform !== 'darwin')('returns null when osascript fails and no standard app path exists', () => {
    cp.execFileSync.mockImplementation(() => {
      throw new Error('app not found');
    });
    fsMod.existsSync.mockReturnValue(false);
    const result = discoverAppPath('NonExistent');
    expect(result).toBeNull();
  });

  it.skipIf(process.platform === 'darwin')('returns null on non-darwin platform', () => {
    const result = discoverAppPath('Cursor');
    expect(result).toBeNull();
  });
});

describe('launchDetachedApp', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    cp.spawn.mockReset();
  });

  it('unrefs the process after spawn succeeds', async () => {
    const child = createMockChildProcess();
    cp.spawn.mockImplementation(() => {
      queueMicrotask(() => child.emit('spawn'));
      return child as unknown as ReturnType<typeof cp.spawn>;
    });

    await expect(launchDetachedApp('/Applications/Antigravity.app/Contents/MacOS/Antigravity', ['--remote-debugging-port=9234'], 'Antigravity'))
      .resolves
      .toBeUndefined();
    expect(child.unref).toHaveBeenCalledTimes(1);
  });

  it('converts ENOENT into a controlled launch error', async () => {
    const child = createMockChildProcess();
    cp.spawn.mockImplementation(() => {
      queueMicrotask(() => child.emit('error', Object.assign(new Error('missing binary'), { code: 'ENOENT' })));
      return child as unknown as ReturnType<typeof cp.spawn>;
    });

    await expect(launchDetachedApp('/Applications/Antigravity.app/Contents/MacOS/Antigravity', ['--remote-debugging-port=9234'], 'Antigravity'))
      .rejects
      .toThrow('Could not launch Antigravity');
    expect(child.unref).not.toHaveBeenCalled();
  });
});

describe('resolveExecutableCandidates', () => {
  it('prefers explicit executable candidates over processName', () => {
    const app: ElectronAppEntry = {
      port: 9234,
      processName: 'Antigravity',
      executableNames: ['Electron', 'Antigravity'],
    };

    expect(resolveExecutableCandidates('/Applications/Antigravity.app', app)).toEqual([
      '/Applications/Antigravity.app/Contents/MacOS/Electron',
      '/Applications/Antigravity.app/Contents/MacOS/Antigravity',
    ]);
  });
});

describe('launchElectronApp', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    cp.spawn.mockReset();
  });

  it('falls back to the next executable candidate when the first is missing', async () => {
    const firstChild = createMockChildProcess();
    const secondChild = createMockChildProcess();
    const app: ElectronAppEntry = {
      port: 9234,
      processName: 'Antigravity',
      executableNames: ['Electron', 'Antigravity'],
    };

    cp.spawn
      .mockImplementationOnce(() => {
        queueMicrotask(() => firstChild.emit('error', Object.assign(new Error('missing binary'), { code: 'ENOENT' })));
        return firstChild as unknown as ReturnType<typeof cp.spawn>;
      })
      .mockImplementationOnce(() => {
        queueMicrotask(() => secondChild.emit('spawn'));
        return secondChild as unknown as ReturnType<typeof cp.spawn>;
      });

    await expect(
      launchElectronApp('/Applications/Antigravity.app', app, ['--remote-debugging-port=9234'], 'Antigravity'),
    ).resolves.toBeUndefined();

    expect(cp.spawn).toHaveBeenNthCalledWith(
      1,
      '/Applications/Antigravity.app/Contents/MacOS/Electron',
      ['--remote-debugging-port=9234'],
      { detached: true, stdio: 'ignore' },
    );
    expect(cp.spawn).toHaveBeenNthCalledWith(
      2,
      '/Applications/Antigravity.app/Contents/MacOS/Antigravity',
      ['--remote-debugging-port=9234'],
      { detached: true, stdio: 'ignore' },
    );
    expect(secondChild.unref).toHaveBeenCalledTimes(1);
  });
});

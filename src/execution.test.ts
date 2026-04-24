import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CliCommand } from './registry.js';

const { mockMaybeBindWorkspaceToCurrentTab, mockResolveChromeEndpoint } = vi.hoisted(() => ({
  mockMaybeBindWorkspaceToCurrentTab: vi.fn(),
  mockResolveChromeEndpoint: vi.fn(),
}));

vi.mock('./browser/workspace-reuse.js', () => ({
  maybeBindWorkspaceToCurrentTab: mockMaybeBindWorkspaceToCurrentTab,
}));

vi.mock('./launcher.js', () => ({
  probeCDP: vi.fn().mockResolvedValue(true),
  resolveElectronEndpoint: vi.fn(),
  resolveChromeEndpoint: mockResolveChromeEndpoint,
}));

import { executeCommand, prepareCommandArgs } from './execution.js';
import { TimeoutError } from './errors.js';
import { cli, Strategy } from './registry.js';
import { withTimeoutMs } from './runtime.js';
import * as runtime from './runtime.js';
import * as capRouting from './capabilityRouting.js';

describe('executeCommand — non-browser timeout', () => {
  beforeEach(() => {
    mockMaybeBindWorkspaceToCurrentTab.mockReset().mockResolvedValue(false);
    mockResolveChromeEndpoint.mockReset().mockResolvedValue(undefined);
  });

  it('applies timeoutSeconds to non-browser commands', async () => {
    const cmd = cli({
      site: 'test-execution',
      name: 'non-browser-timeout',
      description: 'test non-browser timeout',
      browser: false,
      strategy: Strategy.PUBLIC,
      timeoutSeconds: 0.01,
      func: () => new Promise(() => {}),
    });

    // Sentinel timeout at 200ms — if the inner 10ms timeout fires first,
    // the error will be a TimeoutError with the command label, not 'sentinel'.
    const error = await withTimeoutMs(executeCommand(cmd, {}), 200, 'sentinel timeout')
      .catch((err) => err);

    expect(error).toBeInstanceOf(TimeoutError);
    expect(error).toMatchObject({
      code: 'TIMEOUT',
      message: 'test-execution/non-browser-timeout timed out after 0.01s',
    });
  });

  it('skips timeout when timeoutSeconds is 0', async () => {
    const cmd = cli({
      site: 'test-execution',
      name: 'non-browser-zero-timeout',
      description: 'test zero timeout bypasses wrapping',
      browser: false,
      strategy: Strategy.PUBLIC,
      timeoutSeconds: 0,
      func: () => new Promise(() => {}),
    });

    // With timeout guard skipped, the sentinel fires instead.
    await expect(
      withTimeoutMs(executeCommand(cmd, {}), 50, 'sentinel timeout'),
    ).rejects.toThrow('sentinel timeout');
  });

  it('calls closeWindow on browser command failure', async () => {
    const closeWindow = vi.fn().mockResolvedValue(undefined);
    const mockPage = { closeWindow } as any;

    // Mock shouldUseBrowserSession to return true
    vi.spyOn(capRouting, 'shouldUseBrowserSession').mockReturnValue(true);

    // Mock browserSession to invoke the callback with our mock page
    vi.spyOn(runtime, 'browserSession').mockImplementation(async (_Factory, fn) => {
      return fn(mockPage);
    });

    const cmd = cli({
      site: 'test-execution',
      name: 'browser-close-on-error',
      description: 'test closeWindow on failure',
      browser: true,
      strategy: Strategy.PUBLIC,
      func: async () => { throw new Error('adapter failure'); },
    });

    await expect(executeCommand(cmd, {})).rejects.toThrow('adapter failure');
    expect(closeWindow).toHaveBeenCalledTimes(1);

    vi.restoreAllMocks();
  });

  it('skips closeWindow when OPENCLI_LIVE=1 (success path)', async () => {
    const closeWindow = vi.fn().mockResolvedValue(undefined);
    const mockPage = { closeWindow } as any;

    vi.spyOn(capRouting, 'shouldUseBrowserSession').mockReturnValue(true);
    vi.spyOn(runtime, 'browserSession').mockImplementation(async (_Factory, fn) => fn(mockPage));

    const prev = process.env.OPENCLI_LIVE;
    process.env.OPENCLI_LIVE = '1';
    try {
      const cmd = cli({
        site: 'test-execution',
        name: 'browser-live-success',
        description: 'test closeWindow skipped with --live on success',
        browser: true,
        strategy: Strategy.PUBLIC,
        func: async () => [{ ok: true }],
      });

      await executeCommand(cmd, {});
      expect(closeWindow).not.toHaveBeenCalled();
    } finally {
      if (prev === undefined) delete process.env.OPENCLI_LIVE;
      else process.env.OPENCLI_LIVE = prev;
      vi.restoreAllMocks();
    }
  });

  it('skips closeWindow when OPENCLI_LIVE=1 (failure path)', async () => {
    const closeWindow = vi.fn().mockResolvedValue(undefined);
    const mockPage = { closeWindow } as any;

    vi.spyOn(capRouting, 'shouldUseBrowserSession').mockReturnValue(true);
    vi.spyOn(runtime, 'browserSession').mockImplementation(async (_Factory, fn) => fn(mockPage));

    const prev = process.env.OPENCLI_LIVE;
    process.env.OPENCLI_LIVE = '1';
    try {
      const cmd = cli({
        site: 'test-execution',
        name: 'browser-live-failure',
        description: 'test closeWindow skipped with --live on failure',
        browser: true,
        strategy: Strategy.PUBLIC,
        func: async () => { throw new Error('adapter failure'); },
      });

      await expect(executeCommand(cmd, {})).rejects.toThrow('adapter failure');
      expect(closeWindow).not.toHaveBeenCalled();
    } finally {
      if (prev === undefined) delete process.env.OPENCLI_LIVE;
      else process.env.OPENCLI_LIVE = prev;
      vi.restoreAllMocks();
    }
  });

  it('prefers binding the current site tab before pre-navigation when browser reuse is enabled', async () => {
    const closeWindow = vi.fn().mockResolvedValue(undefined);
    const goto = vi.fn().mockResolvedValue(undefined);
    const mockPage = { closeWindow, goto } as any;

    mockMaybeBindWorkspaceToCurrentTab.mockResolvedValue(true);
    vi.spyOn(capRouting, 'shouldUseBrowserSession').mockReturnValue(true);
    vi.spyOn(runtime, 'browserSession').mockImplementation(async (_Factory, fn) => fn(mockPage));

    const cmd = cli({
      site: 'chatgpt',
      name: 'browser-reuse',
      description: 'test current-tab reuse for site adapters',
      browser: true,
      strategy: Strategy.COOKIE,
      domain: 'chatgpt.com',
      func: async () => [{ ok: true }],
    });

    await executeCommand(cmd, {});

    expect(mockMaybeBindWorkspaceToCurrentTab).toHaveBeenCalledWith('site:chatgpt', { matchDomain: 'chatgpt.com' });
    expect(mockMaybeBindWorkspaceToCurrentTab.mock.invocationCallOrder[0]).toBeLessThan(goto.mock.invocationCallOrder[0]);
    vi.restoreAllMocks();
    mockMaybeBindWorkspaceToCurrentTab.mockReset();
  });

  it('prefers default Chrome CDP for normal web adapters before falling back to BrowserBridge reuse', async () => {
    const closeWindow = vi.fn().mockResolvedValue(undefined);
    const goto = vi.fn().mockResolvedValue(undefined);
    const mockPage = { closeWindow, goto } as any;

    mockResolveChromeEndpoint.mockResolvedValue('http://127.0.0.1:9333');
    vi.spyOn(capRouting, 'shouldUseBrowserSession').mockReturnValue(true);
    const browserSessionSpy = vi.spyOn(runtime, 'browserSession').mockImplementation(async (_Factory, fn) => fn(mockPage));

    const cmd = cli({
      site: 'chatgpt',
      name: 'browser-cdp-default-profile',
      description: 'test default Chrome CDP for web adapters',
      browser: true,
      strategy: Strategy.COOKIE,
      domain: 'chatgpt.com',
      func: async () => [{ ok: true }],
    });

    await executeCommand(cmd, {});

    expect(mockResolveChromeEndpoint).toHaveBeenCalledTimes(1);
    expect(browserSessionSpy.mock.calls[0][2]).toMatchObject({
      workspace: 'site:chatgpt',
      cdpEndpoint: 'http://127.0.0.1:9333',
    });
    expect(mockMaybeBindWorkspaceToCurrentTab).not.toHaveBeenCalled();
    vi.restoreAllMocks();
    mockResolveChromeEndpoint.mockReset();
    mockMaybeBindWorkspaceToCurrentTab.mockReset();
  });

  it('does not re-run custom validation when args are already prepared', async () => {
    const validateArgs = vi.fn();
    const cmd: CliCommand = {
      site: 'test-execution',
      name: 'prepared-validation',
      description: 'test prepared validation path',
      browser: false,
      strategy: Strategy.PUBLIC,
      args: [],
      validateArgs,
      func: async () => [],
    };

    const kwargs = prepareCommandArgs(cmd, {});
    await executeCommand(cmd, kwargs, false, { prepared: true });

    expect(validateArgs).toHaveBeenCalledTimes(1);
  });
});

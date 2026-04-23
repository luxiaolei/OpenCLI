import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockListSessions,
  mockBindCurrentTab,
} = vi.hoisted(() => ({
  mockListSessions: vi.fn(),
  mockBindCurrentTab: vi.fn(),
}));

vi.mock('./daemon-client.js', () => ({
  listSessions: mockListSessions,
  bindCurrentTab: mockBindCurrentTab,
}));

import { maybeBindWorkspaceToCurrentTab } from './workspace-reuse.js';

describe('maybeBindWorkspaceToCurrentTab', () => {
  beforeEach(() => {
    delete process.env.OPENCLI_REUSE_CURRENT_TAB;
    mockListSessions.mockReset().mockResolvedValue([]);
    mockBindCurrentTab.mockReset().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    delete process.env.OPENCLI_REUSE_CURRENT_TAB;
  });

  it('returns false when current-tab reuse is disabled', async () => {
    process.env.OPENCLI_REUSE_CURRENT_TAB = '0';

    await expect(maybeBindWorkspaceToCurrentTab('site:chatgpt', { matchDomain: 'chatgpt.com' })).resolves.toBe(false);
    expect(mockListSessions).not.toHaveBeenCalled();
    expect(mockBindCurrentTab).not.toHaveBeenCalled();
  });

  it('returns false when the workspace already has a live session', async () => {
    mockListSessions.mockResolvedValue([{ workspace: 'site:chatgpt', connected: true }]);

    await expect(maybeBindWorkspaceToCurrentTab('site:chatgpt', { matchDomain: 'chatgpt.com' })).resolves.toBe(false);
    expect(mockBindCurrentTab).not.toHaveBeenCalled();
  });

  it('binds the current tab when no workspace session exists yet', async () => {
    await expect(maybeBindWorkspaceToCurrentTab('site:chatgpt', { matchDomain: 'chatgpt.com' })).resolves.toBe(true);
    expect(mockBindCurrentTab).toHaveBeenCalledWith('site:chatgpt', { matchDomain: 'chatgpt.com' });
  });

  it('falls back quietly when no matching visible tab can be reused', async () => {
    mockBindCurrentTab.mockRejectedValue(new Error('No visible tab matching chatgpt.com'));

    await expect(maybeBindWorkspaceToCurrentTab('site:chatgpt', { matchDomain: 'chatgpt.com' })).resolves.toBe(false);
  });
});

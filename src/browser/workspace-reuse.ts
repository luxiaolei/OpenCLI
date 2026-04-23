import type { BrowserSessionInfo } from '../types.js';
import { bindCurrentTab, listSessions } from './daemon-client.js';

const DISABLED_VALUES = new Set(['0', 'false', 'no', 'off']);

export function isCurrentTabReuseEnabled(): boolean {
  const raw = process.env.OPENCLI_REUSE_CURRENT_TAB;
  if (raw === undefined) return true;
  return !DISABLED_VALUES.has(raw.trim().toLowerCase());
}

function hasWorkspaceSession(sessions: BrowserSessionInfo[], workspace: string): boolean {
  return sessions.some((session) => session?.workspace === workspace);
}

export async function maybeBindWorkspaceToCurrentTab(
  workspace: string,
  opts: { matchDomain?: string; matchPathPrefix?: string } = {},
): Promise<boolean> {
  if (!workspace || !isCurrentTabReuseEnabled()) return false;

  try {
    const sessions = await listSessions();
    if (hasWorkspaceSession(sessions, workspace)) return false;
  } catch {
    // Fall through and try the bind. BrowserBridge.connect() has already ensured
    // the daemon is up, so a transient sessions failure should not block reuse.
  }

  try {
    await bindCurrentTab(workspace, opts);
    return true;
  } catch {
    return false;
  }
}

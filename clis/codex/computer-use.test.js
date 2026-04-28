import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { getRegistry } from '@jackwener/opencli/registry';
import './computer-use.js';

function createPageMock(evaluateResults) {
  const queue = [...evaluateResults];
  return {
    evaluate: vi.fn().mockImplementation(async () => queue.shift()),
    wait: vi.fn().mockResolvedValue(undefined),
    nativeClick: vi.fn().mockResolvedValue(undefined),
    pressKey: vi.fn().mockResolvedValue(undefined),
  };
}

describe('codex computer-use command', () => {
  const command = getRegistry().get('codex/computer-use');
  const source = readFileSync(fileURLToPath(new URL('./computer-use.js', import.meta.url)), 'utf8');

  it('keeps one-off approval matching exact so it cannot click the persistent allow button by prefix', () => {
    expect(source).toContain('stripShortcut');
    expect(source).not.toContain("candidate.startsWith(label)");
    expect(source).toContain('isPersistentVariant');
  });

  it('supports localized Chinese labels for the Try in Chat button', () => {
    expect(source).toContain('在聊天中试用');
  });

  it('fires a full pointer event sequence for Try in Chat because plain click is flaky in the current Codex UI', () => {
    expect(source).toContain('pointerdown');
    expect(source).toContain('mouseup');
  });

  it('makes @Computer use visible in the composer before declaring success', async () => {
    const page = createPageMock([
      true,
      true,
      true,
    ]);
    const rows = await command.func(page, {});
    expect(page.nativeClick).not.toHaveBeenCalled();
    expect(page.evaluate.mock.calls.some(([script]) => String(script).includes('@Computer use'))).toBe(true);
    expect(rows).toEqual([
      {
        Status: 'Success',
        State: 'Composer ready',
        Approval: '',
        Hint: expect.stringContaining('--approve once'),
      },
    ]);
  });

  it('reuses an already-open Computer Use composer instead of forcing the settings path again', async () => {
    const page = createPageMock([
      true,
      true,
    ]);
    const rows = await command.func(page, {});
    expect(page.evaluate.mock.calls.some(([script]) => String(script).includes('@Computer use'))).toBe(true);
    expect(rows).toEqual([
      {
        Status: 'Success',
        State: 'Composer ready',
        Approval: '',
        Hint: expect.stringContaining('@Computer use'),
      },
    ]);
  });

  it('surfaces the settings-path blocker when Computer Use cannot even be reached', async () => {
    const page = createPageMock([
      false,
      null,
      false,
      false,
    ]);
    const rows = await command.func(page, {});
    expect(rows).toEqual([
      {
        Status: 'Blocked',
        State: 'App',
        Hint: expect.stringContaining('Settings trigger'),
      },
    ]);
  });

  it('retries Try in Chat lookup when the Computer Use pane renders slowly', async () => {
    const page = createPageMock([
      false,
      null,
      { x: 70, y: 80 },
      true,
      true,
    ]);
    const rows = await command.func(page, {});
    expect(page.nativeClick).toHaveBeenNthCalledWith(1, 70, 80);
    expect(rows).toEqual([
      {
        Status: 'Success',
        State: 'Composer ready',
        Approval: '',
        Hint: expect.stringContaining('@Computer use'),
      },
    ]);
  });

  it('prepends @Computer use when sending a prompt after attaching the tool', async () => {
    const page = createPageMock([
      true,
      true,
      true,
      'Allow Codex to use Safari? Always allow Allow Cancel',
    ]);
    const rows = await command.func(page, { text: 'Open Safari and stop at the approval prompt.' });
    expect(page.evaluate.mock.calls.some(([script]) => String(script).includes('@Computer use Open Safari and stop at the approval prompt.'))).toBe(true);
    expect(page.pressKey).toHaveBeenCalledWith('Enter');
    expect(rows).toEqual([
      {
        Status: 'Blocked',
        State: 'Waiting for approval',
        Prompt: 'Sent',
        Approval: '',
        Hint: expect.stringContaining('Always allow'),
      },
    ]);
  });

  it('can auto-click Always allow when explicitly requested', async () => {
    const page = createPageMock([
      true,
      true,
      true,
      true,
      true,
      'Allow Codex to use Safari? Always allow Allow Cancel',
      null,
      { x: 90, y: 100 },
      'Working for 3s',
    ]);
    const rows = await command.func(page, { text: 'Open Safari and stop at the approval prompt.', approve: 'always' });
    expect(page.nativeClick).toHaveBeenNthCalledWith(1, 90, 100);
    expect(rows).toEqual([
      {
        Status: 'Success',
        State: 'Approval clicked',
        Prompt: 'Sent',
        Approval: 'always',
        Hint: expect.stringContaining('Always allow'),
      },
    ]);
  });

  it('waits longer for a delayed approval card when automation is requested', async () => {
    const page = createPageMock([
      true,
      true,
      true,
      true,
      ...Array.from({ length: 10 }, (_, index) => `Working for ${index + 1}s`),
      'Allow Codex to use Safari? Always allow Allow Cancel',
      null,
      { x: 92, y: 102 },
      'Working for 11s',
    ]);
    const rows = await command.func(page, { text: 'Open Safari and stop at the approval prompt.', approve: 'once' });
    expect(page.nativeClick).toHaveBeenNthCalledWith(1, 92, 102);
    expect(rows).toEqual([
      {
        Status: 'Success',
        State: 'Approval clicked',
        Prompt: 'Sent',
        Approval: 'once',
        Hint: expect.stringContaining('one-off'),
      },
    ]);
  });

  it('maps one-off approval mode to Yes for command execution cards', async () => {
    const page = createPageMock([
      true,
      true,
      true,
      true,
      true,
      'Run this command? Yes, and don\'t ask again No Yes',
      null,
      { x: 91, y: 101 },
      'Working for 2s',
    ]);
    const rows = await command.func(page, { text: 'Open Terminal and run pwd.', approve: 'once' });
    expect(page.nativeClick).toHaveBeenNthCalledWith(1, 91, 101);
    expect(rows).toEqual([
      {
        Status: 'Success',
        State: 'Approval clicked',
        Prompt: 'Sent',
        Approval: 'once',
        Hint: expect.stringContaining('one-off'),
      },
    ]);
  });
});

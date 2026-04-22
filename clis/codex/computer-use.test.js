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

  it('opens Computer Use settings, clicks Try in Chat, and returns next-step guidance', async () => {
    const page = createPageMock([
      false,
      { x: 10, y: 20 },
      { x: 30, y: 40 },
      { x: 50, y: 60 },
      { x: 70, y: 80 },
      true,
    ]);
    const rows = await command.func(page, {});
    expect(page.nativeClick).toHaveBeenNthCalledWith(1, 10, 20);
    expect(page.nativeClick).toHaveBeenNthCalledWith(2, 30, 40);
    expect(page.nativeClick).toHaveBeenNthCalledWith(3, 50, 60);
    expect(page.nativeClick).toHaveBeenNthCalledWith(4, 70, 80);
    expect(rows).toEqual([
      {
        Status: 'Success',
        State: 'Composer ready',
        Approval: '',
        Hint: expect.stringContaining('--approve once'),
      },
    ]);
  });

  it('returns a focused hint when Try in Chat is unavailable', async () => {
    const page = createPageMock([
      true,
      { x: 11, y: 21 },
      null,
    ]);
    const rows = await command.func(page, {});
    expect(rows).toEqual([
      {
        Status: 'Blocked',
        State: 'Computer use',
        Hint: expect.stringContaining('If the plugin is not installed, click Install'),
      },
    ]);
  });

  it('retries Try in Chat lookup when the Computer Use pane renders slowly', async () => {
    const page = createPageMock([
      false,
      { x: 10, y: 20 },
      { x: 30, y: 40 },
      { x: 50, y: 60 },
      null,
      { x: 70, y: 80 },
      true,
    ]);
    const rows = await command.func(page, {});
    expect(page.nativeClick).toHaveBeenNthCalledWith(4, 70, 80);
    expect(rows).toEqual([
      {
        Status: 'Success',
        State: 'Composer ready',
        Approval: '',
        Hint: expect.stringContaining('opencli codex computer-use'),
      },
    ]);
  });

  it('can send a prompt immediately after attaching Computer Use and distinguishes approval blockers', async () => {
    const page = createPageMock([
      false,
      { x: 10, y: 20 },
      { x: 30, y: 40 },
      { x: 50, y: 60 },
      { x: 70, y: 80 },
      true,
      true,
      'Allow Codex to use Safari? Always allow Allow Cancel',
    ]);
    const rows = await command.func(page, { text: 'Open Safari and stop at the approval prompt.' });
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
      false,
      { x: 10, y: 20 },
      { x: 30, y: 40 },
      { x: 50, y: 60 },
      { x: 70, y: 80 },
      true,
      true,
      'Allow Codex to use Safari? Always allow Allow Cancel',
      { x: 90, y: 100 },
      'Working for 3s',
    ]);
    const rows = await command.func(page, { text: 'Open Safari and stop at the approval prompt.', approve: 'always' });
    expect(page.nativeClick).toHaveBeenNthCalledWith(5, 90, 100);
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
      false,
      { x: 10, y: 20 },
      { x: 30, y: 40 },
      { x: 50, y: 60 },
      { x: 70, y: 80 },
      true,
      true,
      ...Array.from({ length: 10 }, (_, index) => `Working for ${index + 1}s`),
      'Allow Codex to use Safari? Always allow Allow Cancel',
      { x: 92, y: 102 },
      'Working for 11s',
    ]);
    const rows = await command.func(page, { text: 'Open Safari and stop at the approval prompt.', approve: 'once' });
    expect(page.nativeClick).toHaveBeenNthCalledWith(5, 92, 102);
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
      false,
      { x: 10, y: 20 },
      { x: 30, y: 40 },
      { x: 50, y: 60 },
      { x: 70, y: 80 },
      true,
      true,
      'Run this command? Yes, and don\'t ask again No Yes',
      { x: 91, y: 101 },
      'Working for 2s',
    ]);
    const rows = await command.func(page, { text: 'Open Terminal and run pwd.', approve: 'once' });
    expect(page.nativeClick).toHaveBeenNthCalledWith(5, 91, 101);
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

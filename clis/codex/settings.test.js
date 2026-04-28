import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { getRegistry } from '@jackwener/opencli/registry';
import './settings.js';

function createPageMock(evaluateResults) {
  const queue = [...evaluateResults];
  return {
    evaluate: vi.fn().mockImplementation(async () => queue.shift()),
    wait: vi.fn().mockResolvedValue(undefined),
    nativeClick: vi.fn().mockResolvedValue(undefined),
  };
}

describe('codex settings command', () => {
  const command = getRegistry().get('codex/settings');
  const source = readFileSync(fileURLToPath(new URL('./settings.js', import.meta.url)), 'utf8');

  it('supports localized Chinese labels for settings and computer use navigation', () => {
    expect(source).toContain('设置');
    expect(source).toContain('电脑使用');
    expect(source).toContain('计算机使用');
  });

  it('opens settings and the computer use section via the direct settings path when plugins fallback is unavailable', async () => {
    const page = createPageMock([
      false,
      false,
      { x: 10, y: 20 },
      { x: 30, y: 40 },
      false,
      { x: 50, y: 60 },
    ]);
    const rows = await command.func(page, { section: 'computer-use' });
    expect(page.nativeClick).toHaveBeenNthCalledWith(1, 10, 20);
    expect(page.nativeClick).toHaveBeenNthCalledWith(2, 30, 40);
    expect(page.nativeClick).toHaveBeenNthCalledWith(3, 50, 60);
    expect(rows[0].Status).toBe('Success');
    expect(rows[0].View).toBe('computer use');
    expect(rows[0].Hint).toContain('Always allow');
  });

  it('falls back through the plugins page and can already land inside settings before section click is needed', async () => {
    const page = createPageMock([
      false,
      true,
      true,
      true,
      true,
    ]);
    const rows = await command.func(page, { section: 'computer-use' });
    expect(page.nativeClick).not.toHaveBeenCalled();
    expect(rows[0].Status).toBe('Success');
    expect(rows[0].View).toBe('computer use');
  });

  it('returns a focused failure when the settings trigger is missing', async () => {
    const page = createPageMock([false, null]);
    const rows = await command.func(page, { section: 'computer-use' });
    expect(rows).toEqual([
      {
        Status: 'Failed',
        View: 'App',
        Hint: 'Could not find the sidebar Settings trigger.',
      },
    ]);
  });
});

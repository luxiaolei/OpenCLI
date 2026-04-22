import { describe, expect, it, vi } from 'vitest';
import { getRegistry } from '@jackwener/opencli/registry';
import { buildCodexComputerUseHint, buildCodexGuideRows, buildCodexSettingsNavigationScript, classifyCodexComputerUseGate, normalizeCodexVisibleSessionState } from './utils.js';
import './read.js';
import './model.js';

function createPageMock(evaluateResult) {
  return {
    evaluate: vi.fn().mockResolvedValue(evaluateResult),
    wait: vi.fn().mockResolvedValue(undefined),
  };
}

describe('codex onboarding helpers', () => {
  it('builds a computer use hint with exact permission and navigation guidance', () => {
    const hint = buildCodexComputerUseHint('Codex returned an empty thread view.');
    expect(hint).toContain('Codex returned an empty thread view.');
    expect(hint).toContain('bottom-left Settings');
    expect(hint).toContain('Computer use');
    expect(hint).toContain('Screen Recording');
    expect(hint).toContain('Accessibility');
    expect(hint).toContain('Always allow');
    expect(hint).toContain('OPENCLI_CDP_ENDPOINT');
    expect(hint).toContain('9333');
    expect(hint).toContain('opencli codex settings computer-use');
  });

  it('includes environment-aware CDP endpoint guidance in the guide rows', () => {
    const rows = buildCodexGuideRows();
    expect(rows.some((row) => row.Step === 'Configure CDP endpoint')).toBe(true);
    const endpointRow = rows.find((row) => row.Step === 'Configure CDP endpoint');
    expect(endpointRow?.Details).toContain('OPENCLI_CDP_ENDPOINT');
    expect(endpointRow?.Details).toContain('127.0.0.1');
    expect(endpointRow?.Details).toContain('non-default');
    expect(endpointRow?.Details).toContain('OPENCLI_CDP_TARGET');
  });

  it('normalizes visible model and reasoning pills from the app shell', () => {
    expect(normalizeCodexVisibleSessionState({
      visibleTexts: ['GPT-5.4', 'Extra High', 'Work locally'],
    })).toEqual({
      model: 'GPT-5.4',
      reasoning: 'Extra High',
      needsHint: false,
    });
  });

  it('requests help guidance when model state is missing', () => {
    expect(normalizeCodexVisibleSessionState({ visibleTexts: [] })).toEqual({
      model: 'Unknown or Not Found',
      reasoning: 'Unknown or Not Found',
      needsHint: true,
    });
  });

  it('encodes the two-step settings navigation path through the account menu', () => {
    const script = buildCodexSettingsNavigationScript('Computer use');
    expect(script).toContain('aria-haspopup');
    expect(script).toContain('[role="menuitem"]');
    expect(script).toContain('Settings');
    expect(script).toContain('Computer use');
  });

  it('classifies missing macOS permissions as a computer-use blocker', () => {
    const gate = classifyCodexComputerUseGate('Computer Use needs Screen Recording and Accessibility in Privacy & Security before it can continue.');
    expect(gate).toMatchObject({
      status: 'Blocked',
      state: 'Waiting for macOS permissions',
    });
    expect(gate?.hint).toContain('Screen Recording');
    expect(gate?.hint).toContain('Accessibility');
  });

  it('classifies in-app approvals as a separate computer-use blocker', () => {
    const gate = classifyCodexComputerUseGate('Allow Codex to use Safari? Always allow Allow Cancel');
    expect(gate).toMatchObject({
      status: 'Blocked',
      state: 'Waiting for approval',
    });
    expect(gate?.hint).toContain('Always allow');
  });

  it('classifies Apple event authentication failures separately from generic macOS permissions', () => {
    const gate = classifyCodexComputerUseGate('Safari focus attempt hit macOS permission gating: Apple event error -10000: Sender process is not authenticated');
    expect(gate).toMatchObject({
      kind: 'apple-events',
      status: 'Blocked',
      state: 'Waiting for Apple Events authentication',
    });
    expect(gate?.hint).toContain('Apple Events');
    expect(gate?.hint).toContain('restart Codex');
  });

  it('prefers the latest approval card over stale older permission guidance in the page text tail', () => {
    const stale = 'Earlier note: Open System Settings -> Privacy & Security -> Screen Recording and Accessibility, then enable Codex.app.';
    const latest = 'Elevated Risk Allow Codex to use Safari? Always allow Cancel Allow';
    const gate = classifyCodexComputerUseGate(`${stale} ${'x '.repeat(1500)} ${latest}`);
    expect(gate).toMatchObject({
      kind: 'approval',
      state: 'Waiting for approval',
    });
  });
});

describe('codex read command', () => {
  const command = getRegistry().get('codex/read');

  it('returns onboarding guidance when the thread view is empty', async () => {
    const page = createPageMock('');
    const rows = await command.func(page, {});
    expect(rows[0].Content).toContain('Screen Recording');
    expect(rows[0].Content).toContain('opencli codex settings computer-use');
  });
});

describe('codex model command', () => {
  const command = getRegistry().get('codex/model');

  it('reads visible model and reasoning labels from the app shell', async () => {
    const page = createPageMock({
      visibleTexts: ['GPT-5.4', 'Extra High', 'Work locally'],
    });
    const rows = await command.func(page, {});
    expect(rows).toEqual([
      {
        Status: 'Active',
        Model: 'GPT-5.4',
        Reasoning: 'Extra High',
        Hint: '',
      },
    ]);
  });

  it('returns guidance when model state cannot be found', async () => {
    const page = createPageMock({ visibleTexts: [] });
    const rows = await command.func(page, {});
    expect(rows[0].Model).toBe('Unknown or Not Found');
    expect(rows[0].Hint).toContain('Always allow');
  });
});

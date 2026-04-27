import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { getRegistry } from '@jackwener/opencli/registry';
import {
  buildCodexComputerUseHint,
  buildCodexGuideRows,
  buildCodexJobId,
  buildCodexSettingsNavigationScript,
  classifyCodexComputerUseGate,
  classifyCodexWatchState,
  getCodexJobsDir,
  hashCodexText,
  loadCodexJob,
  normalizeCodexPrompt,
  normalizeCodexPromptOptions,
  normalizeCodexThreadSnapshot,
  normalizeCodexVisibleSessionState,
  saveCodexJob,
} from './utils.js';
import './read.js';
import './model.js';
import './submit.js';
import './watch.js';
import './result.js';
import './run.js';

function createPageMock(evaluateResult) {
  return {
    evaluate: vi.fn().mockResolvedValue(evaluateResult),
    wait: vi.fn().mockResolvedValue(undefined),
    pressKey: vi.fn().mockResolvedValue(undefined),
  };
}

function createPageMockSequence(evaluateResults) {
  const queue = [...evaluateResults];
  return {
    evaluate: vi.fn().mockImplementation(async () => queue.shift()),
    wait: vi.fn().mockResolvedValue(undefined),
    pressKey: vi.fn().mockResolvedValue(undefined),
  };
}

async function withTempStateDir(run) {
  const previous = process.env.OPENCLI_STATE_DIR;
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencli-codex-state-'));
  process.env.OPENCLI_STATE_DIR = stateDir;
  try {
    return await run(stateDir);
  } finally {
    if (previous === undefined) delete process.env.OPENCLI_STATE_DIR;
    else process.env.OPENCLI_STATE_DIR = previous;
  }
}

describe('codex job and watch helpers', () => {
  it('builds safe codex job ids', () => {
    expect(buildCodexJobId(new Date('2026-04-27T01:05:00Z'), 'abcdef123456')).toBe('codex_20260427_010500_abcdef');
    expect(buildCodexJobId(new Date('2026-04-27T01:05:00Z'), '../../bad!')).toMatch(/^codex_20260427_010500_[A-Za-z0-9]{6}$/);
  });

  it('resolves the codex jobs directory under OPENCLI_STATE_DIR', () => {
    expect(getCodexJobsDir({ OPENCLI_STATE_DIR: '/tmp/opencli-state' })).toBe('/tmp/opencli-state/codex/jobs');
  });

  it('hashes normalized text deterministically', () => {
    expect(hashCodexText(' hello\nworld ')).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(hashCodexText('hello world')).toBe(hashCodexText(' hello\nworld '));
  });

  it('prefixes Browser and Computer Use tags exactly once', () => {
    expect(normalizeCodexPrompt('Do it', { browser: true, computerUse: true })).toBe('@Browser\n@Computer Use\n\nDo it');
    expect(normalizeCodexPrompt('@Browser\nDo it', { browser: true })).toBe('@Browser\n\nDo it');
  });

  it('defaults approve=always only for computer-use prompts', () => {
    expect(normalizeCodexPromptOptions('Do it', { browser: true }).approve).toBe('none');
    expect(normalizeCodexPromptOptions('Do it', { computerUse: true }).approve).toBe('always');
    expect(normalizeCodexPromptOptions('Do it', { computerUse: true, approve: 'once' }).approve).toBe('once');
  });

  it('normalizes thread snapshot and chooses assistant result over grouped turn text', () => {
    const snapshot = normalizeCodexThreadSnapshot({
      turns: ['user prompt 8:51 AM assistant final answer 8:51 AM'],
      assistantBlocks: ['assistant final answer'],
      bodyText: 'old stale permission guidance',
      generating: false,
    });
    expect(snapshot.turnCount).toBe(1);
    expect(snapshot.tailText).toContain('user prompt');
    expect(snapshot.assistantText).toBe('assistant final answer');
    expect(snapshot.assistantHash).toMatch(/^sha256:/);
    expect(snapshot.isGenerating).toBe(false);
  });

  it('classifies in-app approval from newest tail', () => {
    expect(classifyCodexWatchState({ tailText: 'Allow Codex to use Safari? Allow ↵ Cancel Esc' }).status).toBe('waiting_for_approval');
  });

  it('classifies Apple Events auth failure distinctly', () => {
    expect(classifyCodexWatchState({ tailText: 'Apple event error -10000: Sender process is not authenticated' }).status).toBe('blocked_permissions');
  });

  it('does not classify stale body permissions when the newest tail is clean', () => {
    expect(classifyCodexWatchState({
      tailText: 'Done',
      tailHash: 'sha256:done',
      bodyText: 'Old Screen Recording permission guidance',
    }, { stableCount: 1, stablePolls: 3 }).status).toBe('running');
  });

  it('classifies stable unchanged hash as final', () => {
    expect(classifyCodexWatchState({
      tailText: 'Done',
      tailHash: 'sha256:x',
      generating: false,
    }, { previousHash: 'sha256:x', stableCount: 3, stablePolls: 3 }).status).toBe('final');
  });

  it('does not finish on a stable assistant block that predates the submitted job', () => {
    const oldHash = hashCodexText('old answer');
    expect(classifyCodexWatchState({
      tailText: 'new prompt 9:00 AM',
      tailHash: hashCodexText('new prompt 9:00 AM'),
      assistantText: 'old answer',
      assistantHash: oldHash,
      assistantBlockCount: 1,
      turnCount: 2,
      generating: false,
    }, {
      previousHash: oldHash,
      stableCount: 3,
      stablePolls: 3,
      anchorHash: hashCodexText('old grouped turn'),
      anchorTurnCount: 1,
      anchorAssistantHash: oldHash,
      anchorAssistantCount: 1,
    }).status).toBe('running');
  });

  it('does not classify a normal answer about tracebacks as an adapter error', () => {
    expect(classifyCodexWatchState({
      tailText: 'A Python traceback shows where an exception was raised. This is educational content, not a failed Codex run.',
      tailHash: 'sha256:traceback-answer',
      generating: false,
    }, { previousHash: 'sha256:traceback-answer', stableCount: 3, stablePolls: 3 }).status).toBe('final');
  });

  it('can disable approval gate detection for ordinary non-computer-use answers', () => {
    expect(classifyCodexWatchState({
      tailText: 'This documentation example says: Allow Codex to use Safari? That is only an example, not a live approval card.',
      tailHash: 'sha256:ordinary-approval-example',
      generating: false,
    }, {
      previousHash: 'sha256:ordinary-approval-example',
      stableCount: 3,
      stablePolls: 3,
      allowGateDetection: false,
    }).status).toBe('final');
  });

  it('does not classify explanatory request or command failure examples as adapter errors', () => {
    expect(classifyCodexWatchState({
      tailText: 'A request failed error can be raised by HTTP clients. Likewise, the words command failed can appear in documentation without indicating this Codex run failed.',
      tailHash: 'sha256:failure-doc-example',
      generating: false,
    }, { previousHash: 'sha256:failure-doc-example', stableCount: 3, stablePolls: 3 }).status).toBe('final');
  });

  it('does not treat ordinary final answers mentioning running or thinking as still generating', () => {
    expect(classifyCodexWatchState({
      tailText: 'I finished running tests and thinking through the edge cases. The result is ready.',
      tailHash: 'sha256:ordinary-running-answer',
      generating: false,
    }, { previousHash: 'sha256:ordinary-running-answer', stableCount: 3, stablePolls: 3 }).status).toBe('final');
  });

  it('saves and loads a codex job json file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencli-codex-jobs-'));
    const job = { schema_version: 1, job_id: 'codex_test', status: 'submitted' };
    saveCodexJob(job, dir);
    expect(loadCodexJob('codex_test', dir).status).toBe('submitted');
  });
});

describe('codex submit/watch/result/run workflow commands', () => {
  it('submit writes a job file and injects normalized prompt flags', async () => withTempStateDir(async () => {
    const command = getRegistry().get('codex/submit');
    const page = createPageMockSequence([
      { turns: ['old prompt 9:00 AM old answer 9:00 AM'], assistantBlocks: ['old answer'], bodyText: 'old prompt old answer', generating: false },
      true,
    ]);

    const result = await command.func(page, {
      text: 'Do it',
      browser: true,
      'computer-use': true,
      timeout: 10,
      poll: 0,
    });

    expect(result.job_id).toMatch(/^codex_\d{8}_\d{6}_[A-Za-z0-9]{6}$/);
    expect(result.status).toBe('submitted');
    expect(page.pressKey).toHaveBeenCalledWith('Enter');
    const job = loadCodexJob(result.job_id);
    expect(job.prompt.sent).toBe('@Browser\n@Computer Use\n\nDo it');
    expect(job.prompt.approve).toBe('always');
    expect(job.watch.timeout_sec).toBe(10);
    expect(job.watch.poll_sec).toBe(1);
    expect(job.thread_anchor.before_assistant_count).toBe(1);
    expect(job.thread_anchor.before_assistant_hash).toBe(hashCodexText('old answer'));
  }));

  it('watch stores final assistant text after stable assistant hashes', async () => withTempStateDir(async () => {
    const job = saveCodexJob({
      schema_version: 1,
      job_id: 'codex_watch_test',
      created_at: '2026-04-27T01:05:00.000Z',
      status: 'submitted',
      diagnostic: { kind: 'old', message: 'old approval clicked' },
      prompt: { raw: 'question', sent: 'question', approve: 'none' },
      thread_anchor: { before_turn_count: 0, before_tail_hash: hashCodexText(''), before_assistant_count: 0, before_assistant_hash: '' },
      watch: { timeout_sec: 1, poll_sec: 1, stable_polls: 2, polls: 0 },
    });
    const command = getRegistry().get('codex/watch');
    const rawSnapshot = {
      turns: ['question 9:00 AM answer 9:00 AM'],
      assistantBlocks: ['answer'],
      bodyText: 'question answer',
      generating: false,
    };
    const page = createPageMockSequence([rawSnapshot, rawSnapshot]);

    const result = await command.func(page, { job: job.job_id, timeout: 1, poll: 1, 'stable-polls': 2, approve: 'none' });

    expect(result.status).toBe('final');
    expect(result.summary).toBe('answer');
    const saved = loadCodexJob(job.job_id);
    expect(saved.result.text).toBe('answer');
    expect(saved.diagnostic).toBeUndefined();
  }));

  it('result prefers assistant-only text over grouped user prompt turns', async () => withTempStateDir(async () => {
    const job = saveCodexJob({
      schema_version: 1,
      job_id: 'codex_result_test',
      created_at: '2026-04-27T01:05:00.000Z',
      status: 'final',
      prompt: { raw: 'Reply with TOKEN', sent: 'Reply with TOKEN', approve: 'none' },
      thread_anchor: { before_turn_count: 0, before_tail_hash: hashCodexText('') },
      watch: { timeout_sec: 1, poll_sec: 0, stable_polls: 2, polls: 2 },
    });
    const output = path.join(getCodexJobsDir(), 'answer.md');
    const command = getRegistry().get('codex/result');
    const page = createPageMock({
      turns: ['Reply with TOKEN 9:00 AM TOKEN 9:00 AM'],
      assistantBlocks: ['TOKEN'],
      bodyText: 'Reply with TOKEN TOKEN',
      generating: false,
    });

    const result = await command.func(page, { job: job.job_id, output });

    expect(result.text).toBe('TOKEN');
    expect(result.text).not.toBe('Reply with TOKEN 9:00 AM TOKEN 9:00 AM');
    expect(fs.readFileSync(output, 'utf-8')).toBe('TOKEN');
  }));

  it('result prefers stored final text over an unrelated current live thread', async () => withTempStateDir(async () => {
    const job = saveCodexJob({
      schema_version: 1,
      job_id: 'codex_stored_result_test',
      created_at: '2026-04-27T01:05:00.000Z',
      status: 'final',
      prompt: { raw: 'original', sent: 'original', approve: 'none' },
      thread_anchor: { before_turn_count: 0, before_tail_hash: hashCodexText('') },
      result: { text: 'STORED_RESULT', source: 'assistant', final_hash: hashCodexText('STORED_RESULT') },
    });
    const command = getRegistry().get('codex/result');
    const page = createPageMock({
      turns: ['other thread 9:00 AM WRONG_RESULT 9:00 AM'],
      assistantBlocks: ['WRONG_RESULT'],
      bodyText: 'other thread WRONG_RESULT',
      generating: false,
    });

    const result = await command.func(page, { job: job.job_id });

    expect(result.text).toBe('STORED_RESULT');
    expect(loadCodexJob(job.job_id).result.text).toBe('STORED_RESULT');
  }));

  it('result does not persist a stale pre-submit assistant answer before the new answer arrives', async () => withTempStateDir(async () => {
    const oldHash = hashCodexText('OLD_ANSWER');
    const job = saveCodexJob({
      schema_version: 1,
      job_id: 'codex_stale_result_guard_test',
      created_at: '2026-04-27T01:05:00.000Z',
      status: 'submitted',
      prompt: { raw: 'NEW_PROMPT', sent: 'NEW_PROMPT', approve: 'none' },
      thread_anchor: {
        before_turn_count: 1,
        before_tail_hash: hashCodexText('OLD_PROMPT OLD_ANSWER'),
        before_assistant_count: 1,
        before_assistant_hash: oldHash,
      },
      watch: { timeout_sec: 1, poll_sec: 1, stable_polls: 2, polls: 0 },
    });
    const command = getRegistry().get('codex/result');
    const page = createPageMock({
      turns: ['OLD_PROMPT 9:00 AM OLD_ANSWER 9:00 AM', 'NEW_PROMPT 9:01 AM'],
      assistantBlocks: ['OLD_ANSWER'],
      bodyText: 'OLD_PROMPT OLD_ANSWER NEW_PROMPT',
      generating: false,
    });

    const result = await command.func(page, { job: job.job_id });

    expect(result.text).toBe('');
    expect(loadCodexJob(job.job_id).result).toBeUndefined();
  }));

  it('run performs submit, watch, and result without shelling out', async () => withTempStateDir(async () => {
    const command = getRegistry().get('codex/run');
    const rawSnapshot = {
      turns: ['question 9:00 AM answer 9:00 AM'],
      assistantBlocks: ['answer'],
      bodyText: 'question answer',
      generating: false,
    };
    const page = createPageMockSequence([
      { turns: [], assistantBlocks: [], bodyText: '', generating: false },
      true,
      rawSnapshot,
      rawSnapshot,
      rawSnapshot,
    ]);

    const result = await command.func(page, { text: 'question', timeout: 1, poll: 1, 'stable-polls': 2 });

    expect(result.status).toBe('final');
    expect(result.result.text).toBe('answer');
    expect(loadCodexJob(result.job_id).result.text).toBe('answer');
  }));
});

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

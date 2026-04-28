import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jackwener/opencli/registry', () => ({
  cli: (definition) => definition,
  Strategy: { UI: 'ui' },
}));

const { mockSubmitCodexJob, mockRunCodexJob } = vi.hoisted(() => ({
  mockSubmitCodexJob: vi.fn(),
  mockRunCodexJob: vi.fn(),
}));

vi.mock('./submit.js', () => ({ submitCodexJob: mockSubmitCodexJob }));
vi.mock('./run.js', () => ({ runCodexJob: mockRunCodexJob }));

import { automationsCommand } from './automations.js';

describe('codex automations command', () => {
  const page = { goto: vi.fn(), wait: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    page.goto = vi.fn(async () => undefined);
    page.wait = vi.fn(async () => undefined);
    mockSubmitCodexJob.mockResolvedValue({ job_id: 'codex_job_123', status: 'submitted', next: 'opencli codex watch --job codex_job_123 -f json' });
    mockRunCodexJob.mockResolvedValue({ job_id: 'codex_job_123', status: 'final', result: { text: 'done' }, next: 'opencli codex result --job codex_job_123 -f json' });
  });

  it('opens the Codex Automations pane through the documented deeplink', async () => {
    const rows = await automationsCommand.func(page, { action: 'open' });

    expect(page.goto).toHaveBeenCalledWith('codex://automations', { waitUntil: 'load', settleMs: 1000 });
    expect(rows).toEqual([{ Status: 'Success', Action: 'open', View: 'Automations', Hint: 'Opened codex://automations. Use action=list/create/inbox with --submit or --run for prompt-level management.' }]);
  });

  it('submits a conservative create-automation prompt with schedule, project, and model details', async () => {
    const result = await automationsCommand.func(page, {
      action: 'create',
      text: 'every morning summarize repo risk',
      schedule: '0 9 * * *',
      project: '/Users/xlmini/hermes-agent',
      model: 'gpt-5.4',
      reasoning: 'high',
      submit: true,
    });

    expect(mockSubmitCodexJob).toHaveBeenCalledTimes(1);
    const submittedKwargs = mockSubmitCodexJob.mock.calls[0][1];
    expect(submittedKwargs.text).toContain('Create a Codex App automation');
    expect(submittedKwargs.text).toContain('every morning summarize repo risk');
    expect(submittedKwargs.text).toContain('Schedule: 0 9 * * *');
    expect(submittedKwargs.text).toContain('Project/path: /Users/xlmini/hermes-agent');
    expect(submittedKwargs.text).toContain('Model: gpt-5.4');
    expect(submittedKwargs.text).toContain('Reasoning: high');
    expect(submittedKwargs.new).toBe(true);
    expect(result).toEqual({ job_id: 'codex_job_123', status: 'submitted', next: 'opencli codex watch --job codex_job_123 -f json' });
  });

  it('runs a list request end-to-end when --run is set', async () => {
    const result = await automationsCommand.func(page, { action: 'list', run: true, timeout: 60, poll: 2 });

    expect(mockRunCodexJob).toHaveBeenCalledTimes(1);
    const runKwargs = mockRunCodexJob.mock.calls[0][1];
    expect(runKwargs.text).toContain('List Codex App automations');
    expect(runKwargs.timeout).toBe(60);
    expect(runKwargs.poll).toBe(2);
    expect(result.status).toBe('final');
  });

  it('returns a prompt preview without changing state when submit/run are not requested', async () => {
    const rows = await automationsCommand.func(page, { action: 'inbox' });

    expect(mockSubmitCodexJob).not.toHaveBeenCalled();
    expect(mockRunCodexJob).not.toHaveBeenCalled();
    expect(rows[0].Status).toBe('Preview');
    expect(rows[0].Action).toBe('inbox');
    expect(rows[0].Hint).toContain('--submit');
  });
});

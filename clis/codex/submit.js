import { cli, Strategy } from '@jackwener/opencli/registry';
import { SelectorError } from '@jackwener/opencli/errors';
import {
  buildCodexJobId,
  normalizeCodexPromptOptions,
  readCodexThreadSnapshot,
  saveCodexJob,
  startNewCodexThread,
  submitCodexPromptToComposer,
} from './utils.js';

function numberOption(value, fallback, minimum = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, number);
}

export async function submitCodexJob(page, kwargs = {}, options = {}) {
  const useNewThread = !!kwargs.new && !kwargs.current;
  if (useNewThread) {
    await startNewCodexThread(page);
  }

  const before = await readCodexThreadSnapshot(page);
  const prompt = normalizeCodexPromptOptions(kwargs.text, {
    browser: !!kwargs.browser,
    computerUse: !!kwargs['computer-use'],
    approve: kwargs.approve,
  });

  const submitted = await submitCodexPromptToComposer(page, prompt.sent);
  if (!submitted) throw new SelectorError('Codex Composer input element');

  const now = new Date().toISOString();
  const jobId = options.jobId || buildCodexJobId();
  const timeoutSec = numberOption(kwargs.timeout, 1800, 1);
  const pollSec = numberOption(kwargs.poll, 5, 1);
  const stablePolls = numberOption(kwargs['stable-polls'], 3, 1);
  const approvalTimeoutSec = numberOption(kwargs['approval-timeout'], 30, 1);
  const job = saveCodexJob({
    schema_version: 1,
    job_id: jobId,
    created_at: now,
    updated_at: now,
    status: 'submitted',
    cdp: {
      endpoint: process.env.OPENCLI_CDP_ENDPOINT || '',
      target: process.env.OPENCLI_CDP_TARGET || '',
    },
    prompt: {
      raw: prompt.raw,
      sent: prompt.sent,
      browser: prompt.browser,
      computer_use: prompt.computer_use,
      approve: prompt.approve,
      approval_timeout_sec: approvalTimeoutSec,
    },
    thread_anchor: {
      before_turn_count: before.turnCount,
      before_tail_hash: before.tailHash,
      before_assistant_count: before.assistantBlockCount,
      before_assistant_hash: before.assistantHash,
    },
    watch: {
      timeout_sec: timeoutSec,
      poll_sec: pollSec,
      stable_polls: stablePolls,
      polls: 0,
      latest_hash: '',
    },
  }, options.jobsDir);

  return {
    job_id: job.job_id,
    status: job.status,
    job_path: options.jobsDir ? undefined : undefined,
    thread_anchor: job.thread_anchor,
    prompt: {
      browser: job.prompt.browser,
      computer_use: job.prompt.computer_use,
      approve: job.prompt.approve,
    },
    watch: job.watch,
    next: `opencli codex watch --job ${job.job_id} -f json`,
  };
}

export const submitCommand = cli({
  site: 'codex',
  name: 'submit',
  description: 'Submit a Codex App prompt and record a local job for watch/result',
  domain: 'localhost',
  strategy: Strategy.UI,
  browser: true,
  navigateBefore: true,
  timeoutSeconds: 120,
  args: [
    { name: 'text', required: true, positional: true, help: 'Prompt to submit' },
    { name: 'new', type: 'bool', required: false, default: false, help: 'Start a new Codex thread before sending' },
    { name: 'current', type: 'bool', required: false, default: false, help: 'Use the current Codex thread (default)' },
    { name: 'browser', type: 'bool', required: false, default: false, help: 'Prefix prompt with @Browser' },
    { name: 'computer-use', type: 'bool', required: false, default: false, help: 'Prefix prompt with @Computer Use' },
    { name: 'approve', required: false, valueRequired: true, choices: ['once', 'always', 'cancel', 'none'], help: 'Approval mode: once, always, cancel, or none. Defaults to always with --computer-use, otherwise none' },
    { name: 'approval-timeout', type: 'int', required: false, default: 30, help: 'Seconds to wait for a delayed approval card when approval automation is used later' },
    { name: 'timeout', type: 'int', required: false, default: 1800, help: 'Default watch timeout seconds stored in the job' },
    { name: 'poll', type: 'int', required: false, default: 5, help: 'Default watch poll interval seconds stored in the job' },
  ],
  columns: ['job_id', 'status', 'next'],
  func: submitCodexJob,
});

import { cli, Strategy } from '@jackwener/opencli/registry';
import { resultCodexJob } from './result.js';
import { submitCodexJob } from './submit.js';
import { watchCodexJob } from './watch.js';

export async function runCodexJob(page, kwargs = {}, options = {}) {
  const submit = await submitCodexJob(page, kwargs, options);
  const watch = await watchCodexJob(page, {
    job: submit.job_id,
    timeout: kwargs.timeout,
    poll: kwargs.poll,
    'stable-polls': kwargs['stable-polls'],
    approve: kwargs.approve,
  }, options);
  const result = await resultCodexJob(page, {
    job: submit.job_id,
    output: kwargs.output,
  }, options);

  return {
    job_id: submit.job_id,
    status: watch.status,
    submit,
    watch,
    result,
    next: result.text
      ? `opencli codex result --job ${submit.job_id} -f json`
      : watch.next,
  };
}

export const runCommand = cli({
  site: 'codex',
  name: 'run',
  description: 'Submit a Codex App prompt, watch it, and return the result',
  domain: 'localhost',
  strategy: Strategy.UI,
  browser: true,
  navigateBefore: true,
  timeoutSeconds: 86400,
  args: [
    { name: 'text', required: true, positional: true, help: 'Prompt to submit and watch' },
    { name: 'new', type: 'bool', required: false, default: false, help: 'Start a new Codex thread before sending' },
    { name: 'current', type: 'bool', required: false, default: false, help: 'Use the current Codex thread (default)' },
    { name: 'browser', type: 'bool', required: false, default: false, help: 'Prefix prompt with @Browser' },
    { name: 'computer-use', type: 'bool', required: false, default: false, help: 'Prefix prompt with @Computer Use' },
    { name: 'approve', required: false, valueRequired: true, choices: ['once', 'always', 'cancel', 'none'], help: 'Approval mode: once, always, cancel, or none. Defaults to always with --computer-use, otherwise none' },
    { name: 'approval-timeout', type: 'int', required: false, default: 30, help: 'Seconds to wait for a delayed approval card when approval automation is used later' },
    { name: 'timeout', type: 'int', required: false, default: 1800, help: 'Watch timeout seconds' },
    { name: 'poll', type: 'int', required: false, default: 5, help: 'Watch poll interval seconds' },
    { name: 'stable-polls', type: 'int', required: false, default: 3, help: 'Number of stable polls required before final' },
    { name: 'output', required: false, valueRequired: true, help: 'Optional path to write final result text as an artifact' },
  ],
  columns: ['job_id', 'status', 'result', 'next'],
  func: runCodexJob,
});

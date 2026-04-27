import { cli, Strategy } from '@jackwener/opencli/registry';
import {
  classifyCodexWatchState,
  clickCodexApprovalButton,
  extractCodexAssistantResult,
  isCodexWatchTerminal,
  loadCodexJob,
  normalizeCodexApprovalMode,
  readCodexThreadSnapshot,
  saveCodexJob,
  selectCodexWatchContentHash,
  truncateCodexText,
} from './utils.js';

function numberOption(value, fallback, minimum = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, number);
}

function buildWatchContext(job, details = {}) {
  return {
    previousHash: details.previousHash,
    latestHash: details.latestHash,
    stableCount: details.stableCount,
    stablePolls: details.stablePolls,
    anchorHash: job.thread_anchor?.before_tail_hash,
    anchorTurnCount: job.thread_anchor?.before_turn_count,
    anchorAssistantHash: job.thread_anchor?.before_assistant_hash,
    anchorAssistantCount: job.thread_anchor?.before_assistant_count,
    promptRaw: job.prompt?.raw,
    promptSent: job.prompt?.sent,
    allowGateDetection: !!(job.prompt?.computer_use || job.prompt?.computerUse || details.approveMode !== 'none'),
    timedOut: details.timedOut,
  };
}

function latestSnapshotHash(snapshot, job) {
  return selectCodexWatchContentHash(snapshot, buildWatchContext(job));
}

function nextWaitSeconds(pollSec, startedAt, timeoutMs) {
  const remainingSec = (timeoutMs - (Date.now() - startedAt)) / 1000;
  if (remainingSec <= 0) return 0;
  return Math.min(pollSec, remainingSec);
}

function terminalNext(status, jobId) {
  if (status === 'final') return `opencli codex result --job ${jobId} -f json`;
  if (status === 'waiting_for_approval') return `Approve in Codex or rerun: opencli codex watch --job ${jobId} --approve always -f json`;
  if (status === 'blocked_permissions') return 'Grant the requested macOS permissions, restart Codex if required, then rerun the job.';
  if (status === 'timeout') return `Re-run with a higher timeout: opencli codex watch --job ${jobId} --timeout 1800 -f json`;
  if (status === 'error') return 'Inspect the newest Codex turn, then retry or fix the reported error.';
  return `opencli codex watch --job ${jobId} -f json`;
}

function updateJobForSnapshot(job, snapshot, classification, details) {
  const result = extractCodexAssistantResult(snapshot, job);
  const latestHash = latestSnapshotHash(snapshot, job);
  const next = {
    ...job,
    status: classification.status,
    watch: {
      ...(job.watch || {}),
      timeout_sec: details.timeoutSec,
      poll_sec: details.pollSec,
      stable_polls: details.stablePolls,
      polls: Number(job.watch?.polls || 0) + 1,
      latest_hash: latestHash,
      stable_count: details.stableCount,
      elapsed_ms: details.elapsedMs,
    },
  };
  if (classification.diagnostic) {
    next.diagnostic = classification.diagnostic;
  } else {
    delete next.diagnostic;
  }
  if (classification.status === 'final') {
    next.result = {
      final_hash: snapshot.assistantHash || snapshot.tailHash,
      text: result.text,
      source: result.source,
    };
  }
  return next;
}

export async function watchCodexJob(page, kwargs = {}, options = {}) {
  const jobId = String(kwargs.job || options.jobId || '').trim();
  if (!jobId) throw new Error('Missing required --job id');
  let job = loadCodexJob(jobId, options.jobsDir);
  const timeoutSec = numberOption(kwargs.timeout, Number(job.watch?.timeout_sec || 1800), 1);
  const pollSec = numberOption(kwargs.poll, Number(job.watch?.poll_sec || 5), 1);
  const stablePolls = numberOption(kwargs['stable-polls'], Number(job.watch?.stable_polls || 3), 1);
  const approveMode = normalizeCodexApprovalMode(kwargs.approve, job.prompt?.approve || 'none');
  const startedAt = Date.now();
  const timeoutMs = timeoutSec * 1000;
  let previousHash = job.watch?.latest_hash || '';
  let stableCount = 0;
  let lastSnapshot = null;
  let lastClassification = null;
  let pollCount = 0;

  while (true) {
    lastSnapshot = await readCodexThreadSnapshot(page);
    pollCount += 1;
    const latestHash = latestSnapshotHash(lastSnapshot, job);
    stableCount = latestHash && latestHash === previousHash ? stableCount + 1 : (latestHash ? 1 : 0);
    const elapsedMs = Date.now() - startedAt;
    lastClassification = classifyCodexWatchState(lastSnapshot, buildWatchContext(job, {
      previousHash,
      latestHash,
      stableCount,
      stablePolls,
      approveMode,
      timedOut: elapsedMs >= timeoutMs && pollCount > 1,
    }));
    previousHash = latestHash;

    if (lastClassification.status === 'waiting_for_approval' && approveMode !== 'none') {
      const clicked = await clickCodexApprovalButton(page, approveMode);
      if (clicked) {
        job = saveCodexJob({
          ...job,
          status: 'running',
          diagnostic: {
            kind: 'approval',
            message: `Clicked Codex approval button with mode ${approveMode}.`,
            hint: 'Continuing to watch the Codex thread.',
          },
          watch: {
            ...(job.watch || {}),
            timeout_sec: timeoutSec,
            poll_sec: pollSec,
            stable_polls: stablePolls,
            polls: Number(job.watch?.polls || 0) + 1,
            latest_hash: latestHash,
            stable_count: stableCount,
            elapsed_ms: elapsedMs,
          },
        }, options.jobsDir);
        const waitSec = nextWaitSeconds(pollSec, startedAt, timeoutMs);
        if (waitSec <= 0) continue;
        await page.wait(waitSec);
        continue;
      }
    }

    job = saveCodexJob(updateJobForSnapshot(job, lastSnapshot, lastClassification, {
      timeoutSec,
      pollSec,
      stablePolls,
      stableCount,
      elapsedMs,
    }), options.jobsDir);

    if (isCodexWatchTerminal(lastClassification.status)) {
      const result = extractCodexAssistantResult(lastSnapshot, job);
      return {
        job_id: job.job_id,
        status: lastClassification.status,
        polls: pollCount,
        elapsed_ms: elapsedMs,
        latest_hash: latestHash,
        summary: truncateCodexText(result.text),
        diagnostic: job.diagnostic,
        next: terminalNext(lastClassification.status, job.job_id),
      };
    }

    const waitSec = nextWaitSeconds(pollSec, startedAt, timeoutMs);
    if (waitSec <= 0) continue;
    await page.wait(waitSec);
  }
}

export const watchCommand = cli({
  site: 'codex',
  name: 'watch',
  description: 'Watch a submitted Codex App job until final, blocked, error, or timeout',
  domain: 'localhost',
  strategy: Strategy.UI,
  browser: true,
  navigateBefore: true,
  timeoutSeconds: 86400,
  args: [
    { name: 'job', required: true, valueRequired: true, help: 'Codex job id returned by codex submit' },
    { name: 'timeout', type: 'int', required: false, help: 'Watch timeout seconds (default from job, fallback 1800)' },
    { name: 'poll', type: 'int', required: false, help: 'Poll interval seconds (default from job, fallback 5)' },
    { name: 'stable-polls', type: 'int', required: false, default: 3, help: 'Number of stable polls required before final' },
    { name: 'approve', required: false, valueRequired: true, choices: ['once', 'always', 'cancel', 'none'], help: 'Optional approval handling while watching' },
  ],
  columns: ['job_id', 'status', 'polls', 'elapsed_ms', 'latest_hash', 'summary', 'next'],
  func: watchCodexJob,
});

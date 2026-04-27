import fs from 'node:fs';
import path from 'node:path';
import { cli, Strategy } from '@jackwener/opencli/registry';
import {
  extractCodexAssistantResult,
  loadCodexJob,
  readCodexThreadSnapshot,
  saveCodexJob,
} from './utils.js';

function writeResultArtifact(outputPath, text) {
  if (!outputPath) return '';
  const target = path.resolve(String(outputPath));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, String(text || ''), 'utf-8');
  return target;
}

function buildResultDiagnostic(job, resultText) {
  if (resultText) return job.diagnostic || null;
  if (job.diagnostic) return job.diagnostic;
  if (job.status && job.status !== 'final') {
    return {
      kind: job.status,
      message: `Codex job is ${job.status}; no final assistant text is available yet.`,
      hint: `Run opencli codex watch --job ${job.job_id} -f json or inspect the Codex app.`,
    };
  }
  return null;
}

export async function resultCodexJob(page, kwargs = {}, options = {}) {
  const jobId = String(kwargs.job || options.jobId || '').trim();
  if (!jobId) throw new Error('Missing required --job id');

  let job = loadCodexJob(jobId, options.jobsDir);
  let extracted = job.result?.text
    ? { text: job.result.text, source: job.result.source || 'job' }
    : { text: '', source: 'none' };
  let snapshot = null;
  const shouldRereadLive = !!kwargs['reread-live'] || options.reread === true || !extracted.text;

  if (page && shouldRereadLive) {
    try {
      snapshot = await readCodexThreadSnapshot(page);
      const fromSnapshot = extractCodexAssistantResult(snapshot, job);
      if (fromSnapshot.text) extracted = fromSnapshot;
    } catch (error) {
      if (!extracted.text) {
        job = {
          ...job,
          diagnostic: {
            kind: 'snapshot-read',
            message: error instanceof Error ? error.message : String(error),
            hint: 'Could not re-read the live Codex thread; returning the stored job state if available.',
          },
        };
      }
    }
  }

  if (extracted.text) {
    job = saveCodexJob({
      ...job,
      result: {
        ...(job.result || {}),
        text: extracted.text,
        source: extracted.source,
        final_hash: snapshot?.assistantHash || snapshot?.tailHash || job.result?.final_hash || '',
      },
    }, options.jobsDir);
  }

  const artifact = writeResultArtifact(kwargs.output, extracted.text);
  return {
    job_id: job.job_id,
    status: job.status || (extracted.text ? 'final' : 'unknown'),
    text: extracted.text,
    source: extracted.source,
    output: artifact,
    diagnostic: buildResultDiagnostic(job, extracted.text),
  };
}

export const resultCommand = cli({
  site: 'codex',
  name: 'result',
  description: 'Return the final assistant result or blocker diagnostics for a Codex App job',
  domain: 'localhost',
  strategy: Strategy.UI,
  browser: true,
  navigateBefore: true,
  timeoutSeconds: 120,
  args: [
    { name: 'job', required: true, valueRequired: true, help: 'Codex job id returned by codex submit' },
    { name: 'output', required: false, valueRequired: true, help: 'Optional path to write final result text as an artifact' },
    { name: 'reread-live', type: 'bool', required: false, default: false, help: 'Re-read the currently open Codex thread and allow it to replace stored final text' },
  ],
  columns: ['job_id', 'status', 'source', 'text', 'output', 'diagnostic'],
  defaultFormat: 'plain',
  func: resultCodexJob,
});

# Codex App Run / Submit / Watch / Result Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Turn OpenCLI's Codex Desktop App adapter from a set of one-off UI commands into a reliable owner workflow: `submit` a Codex App task, `watch` it until a classified terminal state, fetch the `result`, and expose `run` as the convenient one-shot wrapper.

**Architecture:** Keep the Codex App as the execution surface and drive it through Electron Chrome DevTools Protocol (CDP). Add a small local job ledger under the user's OpenCLI state directory so a prompt submission can be decoupled from polling/result extraction. Build the watcher around newest-thread-tail classification and stable-answer hashing, not around a single blocking `ask` timeout.

**Tech Stack:** OpenCLI JS adapter commands in `clis/codex/*.js`, shared DOM/state helpers in `clis/codex/utils.js`, build-time command manifest from `src/build-manifest.ts`, Vitest tests for pure helpers and command contracts, macOS Codex Desktop App exposed on CDP.

---

## Current baseline snapshot

Captured on: `2026-04-27 08:44:36 CST +0800`

Repo / install state:

- Active binary: `/opt/homebrew/bin/opencli`
- Active realpath: `/Users/xlmini/.openclaw/workspace-agents/opencli-cli-operator/repos/OpenCLI-fork/dist/src/main.js`
- Active OpenCLI version: `1.7.6`
- Repo: `/Users/xlmini/.openclaw/workspace-agents/opencli-cli-operator/repos/OpenCLI-fork`
- Git branch: `main`
- Git HEAD: `caa7b11`
- Remotes:
  - `origin`: `https://github.com/luxiaolei/OpenCLI.git`
  - `upstream`: `https://github.com/jackwener/OpenCLI.git`

Codex App / CDP state:

- `/Applications/Codex.app`: present
- Bundle ID: `com.openai.codex`
- Codex App version: `26.422.30944` / build `2080`
- CDP port `9222`: not listening during this check
- CDP port `9333`: listening and identifies as Codex:
  - User-Agent includes `Codex/26.422.30944 Chrome/146.0.7680.179 Electron/41.2.0`

Use these environment variables for local validation on this Mac:

```bash
export OPENCLI_CDP_ENDPOINT="http://127.0.0.1:9333"
export OPENCLI_CDP_TARGET="app://-/index.html?hostId=local"
```

Live `opencli codex --help` currently exposes:

```text
ask
computer-use
export
extract-diff
guide
history
model
read
send
settings
```

Important mismatch to fix or document: `docs/adapters/desktop/codex.md` mentions `status`, `dump`, `screenshot`, and `new`, and corresponding files exist under `clis/codex/`, but they are not currently visible in `opencli codex --help`. The likely cause for at least `status` is that `src/build-manifest.ts` only scans modules containing literal `cli(`, while `clis/codex/status.js` exports `makeStatusCommand(...)` and therefore is skipped by the manifest builder.

## Owner workflow intent

The owner wants a production control pattern, not a fragile demo:

```bash
opencli codex run "..." --new --browser --computer-use --approve always --timeout 1800 --poll 5 -f json
opencli codex run "..." --current --browser --computer-use --approve always --timeout 1800 --poll 5 -f json
opencli codex submit "..." --browser --computer-use --approve always -f json
opencli codex watch --job <job_id> --timeout 1800 --poll 5 -f json
opencli codex result --job <job_id> -f json
```

The target mental model:

1. `submit`: prepare the prompt, optionally start a fresh thread, submit it, and record a job anchor.
2. `watch`: poll the newest Codex thread state until `final`, `waiting_for_approval`, `blocked_permissions`, `error`, or `timeout`.
3. `result`: read the stable final assistant result and useful metadata/artifacts.
4. `run`: do `submit + watch + result` in one command for simple cases.

## Non-goals / safety boundaries

- Do not bypass macOS TCC permissions. Screen Recording, Accessibility, and some Apple Events grants may still require one-time manual setup.
- Do not click native macOS security/privacy dialogs automatically.
- Do not rely on stale whole-page text for approval/permission classification; classify from the newest response/tail.
- Do not promise that Codex Browser Use / Computer Use is healthy just because CDP is healthy. Report those separately.
- Do not make `ask --timeout` the long-running production path. Keep it as a short convenience command.

## Smoke-driven selector revision

The 2026-04-27 smoke trial confirmed that the broad selector `[data-content-search-turn-key]` is useful for detecting that a thread changed, but it is **not enough** for final result extraction. In the observed Codex DOM, one `[data-content-search-turn-key]` container grouped the user prompt and assistant answer together:

```text
OpenCLI smoke test ... CODEX_OPENCLI_SMOKE_OK 8:51 AM CODEX_OPENCLI_SMOKE_OK 8:51 AM
```

The final assistant answer was visible deeper in the DOM as a markdown/content node with text exactly:

```text
CODEX_OPENCLI_SMOKE_OK
```

Plan consequence:

- `watch` may still use a coarse latest block hash as a running/final stability signal.
- `result` must not decide success by searching for a token anywhere in whole-thread text; that false-positives on the user's own prompt.
- Add a second extraction layer that prefers latest assistant markdown/content blocks, then falls back to splitting the newest turn block only if assistant blocks are not visible.
- Prompt design for smoke tests should avoid answer tokens that appear contiguously in the prompt, or the checker must use assistant-only extraction.

## Current adapter anatomy

Existing files:

- `clis/codex/send.js`
  - Finds the final `[contenteditable="true"]` or `textarea`, inserts text, presses Enter.
- `clis/codex/ask.js`
  - Records prior `[data-content-search-turn-key]` count, sends prompt, waits for first new turn, then returns immediately.
  - Current limitation: first new turn is not necessarily the final answer for long tool/Browser/Computer Use runs.
- `clis/codex/read.js`
  - Reads all `[data-content-search-turn-key]` turns or falls back to `main`/`document.body.innerText`.
- `clis/codex/computer-use.js`
  - Attaches Computer Use, can send a prompt, and can automate in-app approval cards.
- `clis/codex/utils.js`
  - Already contains useful Computer Use blocker helpers, including `classifyCodexComputerUseGate(rawText)`.
- `cli-manifest.json`
  - Built from `clis/**.js` by `npm run build-manifest`.

## Target command contract

### `opencli codex submit`

Purpose: submit prompt and write a job file.

Proposed options:

```text
opencli codex submit <text>
  --new                    Start a new Codex thread before sending.
  --current                Use the current Codex thread. Default for MVP.
  --browser                Prefix prompt with @Browser.
  --computer-use           Prefix prompt with @Computer Use.
  --approve <mode>         once | always | cancel | none. Default: always when --computer-use is set, otherwise none.
  --approval-timeout <sec> Default 30.
  --timeout <sec>          Default 1800. Stored as watcher default, not used to block submit.
  --poll <sec>             Default 5. Stored as watcher default.
  -f, --format <format>    json | table | plain.
```

MVP behavior:

- Use existing current-thread flow unless `--new` has been implemented and verified.
- Record a generated `job_id` and pre-submit anchors:
  - `before_turn_count`
  - `before_tail_hash`
  - `submitted_at`
  - normalized prompt text
  - CDP endpoint/target used
- Submit the prompt through the same robust composer insertion path used by `send`.
- Return immediately after successful submission.

Output shape (`-f json`):

```json
{
  "job_id": "codex_20260427_090500_ab12cd",
  "status": "submitted",
  "thread_anchor": {
    "before_turn_count": 12,
    "before_tail_hash": "sha256:..."
  },
  "prompt": {
    "browser": true,
    "computer_use": true,
    "approve": "always"
  },
  "next": "opencli codex watch --job codex_20260427_090500_ab12cd -f json"
}
```

### `opencli codex watch`

Purpose: poll the job's thread until a stable or blocked state.

Proposed options:

```text
opencli codex watch --job <job_id>
  --timeout <sec>          Default from job, fallback 1800.
  --poll <sec>             Default from job, fallback 5.
  --stable-polls <n>       Default 3.
  --approve <mode>         Optional approval handling while watching.
  -f, --format <format>    json | table | plain.
```

State machine:

- `running`
  - Latest assistant turn is changing.
  - Stop/generating indicator is visible.
  - Browser Use / Computer Use / tool activity is ongoing.
- `waiting_for_approval`
  - Newest tail contains app-risk approval text, e.g. `Allow Codex to use Safari?`, `Allow ↵`, `Don't ask again`, `Yes`, `Yes, and don't ask again`.
- `blocked_permissions`
  - Newest tail mentions `Screen Recording`, `Accessibility`, `Apple event error -10000`, or `Sender process is not authenticated`.
- `error`
  - Newest tail shows stream disconnects, request failures, rate limits, tool failures, Browser Use failure, or Computer Use failure.
- `final`
  - No generating/Stop indicator remains and latest assistant answer hash is stable across `--stable-polls` polls.
- `timeout`
  - Watch timeout reached before a terminal state.

Classification rule: use the newest thread tail / latest response region first, never the whole historical page body unless tail extraction fails.

Output shape (`-f json`):

```json
{
  "job_id": "codex_20260427_090500_ab12cd",
  "status": "final",
  "polls": 8,
  "elapsed_ms": 40231,
  "latest_hash": "sha256:...",
  "summary": "latest assistant text, truncated for terminal output",
  "next": "opencli codex result --job codex_20260427_090500_ab12cd -f json"
}
```

### `opencli codex result`

Purpose: return the stable final output for a job.

Proposed options:

```text
opencli codex result --job <job_id>
  --output <path>          Optional markdown/json file output.
  --full                   Include full readable thread text.
  -f, --format <format>    json | markdown | plain.
```

MVP behavior:

- Load job file.
- Re-read current thread through CDP.
- Extract latest assistant response newer than the submit anchor when possible.
- Return stored terminal state plus latest result text.
- If job is blocked/error/timeout, return the blocker and a precise next action.

### `opencli codex run`

Purpose: one-shot wrapper for common use.

Proposed options: union of `submit`, `watch`, and `result` flags.

Behavior:

1. Call submit flow.
2. Call watch flow with timeout/poll options.
3. If final, call result flow.
4. If blocked/error/timeout, return the diagnostic and do not pretend success.

## Job state storage

Proposed path:

```text
~/.opencli/codex/jobs/<job_id>.json
```

Reasoning:

- Hidden OpenCLI state keeps job ledgers out of project repos.
- The path is deterministic and easy to inspect manually.
- Job files are small, append/update friendly, and do not need a DB for MVP.

Job schema v1:

```json
{
  "schema_version": 1,
  "job_id": "codex_20260427_090500_ab12cd",
  "created_at": "2026-04-27T01:05:00.000Z",
  "updated_at": "2026-04-27T01:05:40.000Z",
  "status": "submitted|running|waiting_for_approval|blocked_permissions|error|final|timeout",
  "cdp": {
    "endpoint": "http://127.0.0.1:9333",
    "target": "app://-/index.html?hostId=local"
  },
  "prompt": {
    "raw": "...",
    "sent": "@Browser\n@Computer Use\n\n...",
    "browser": true,
    "computer_use": true,
    "approve": "always"
  },
  "thread_anchor": {
    "before_turn_count": 12,
    "before_tail_hash": "sha256:..."
  },
  "watch": {
    "timeout_sec": 1800,
    "poll_sec": 5,
    "stable_polls": 3,
    "polls": 8,
    "latest_hash": "sha256:..."
  },
  "result": {
    "final_hash": "sha256:...",
    "text": "..."
  },
  "diagnostic": {
    "kind": "approval|permissions|apple-events|stream|rate-limit|selector|unknown",
    "message": "...",
    "hint": "..."
  }
}
```

## Prompt decoration rules

- If `--browser`, prefix exactly:

```text
@Browser

<user prompt>
```

- If `--computer-use`, prefix exactly:

```text
@Computer Use

<user prompt>
```

- If both are requested:

```text
@Browser
@Computer Use

<user prompt>
```

- Do not require the owner to type those tags manually.
- Do not add Computer Use when the task only needs Browser Use.
- Do not add Browser Use when the task only needs external desktop apps.

## Implementation tasks

### Task 1: Add pure job ID, hashing, and state-directory helpers

**Objective:** Create deterministic helpers that can be tested without Codex App.

**Files:**

- Modify: `clis/codex/utils.js`
- Test: `clis/codex/utils.test.js`

**Step 1: Write failing tests**

Add tests covering:

```js
import {
  buildCodexJobId,
  getCodexJobsDir,
  hashCodexText,
  normalizeCodexPrompt,
} from './utils.js';

it('builds safe codex job ids', () => {
  expect(buildCodexJobId(new Date('2026-04-27T01:05:00Z'), 'abcdef123456')).toBe('codex_20260427_010500_abcdef');
});

it('hashes normalized text deterministically', () => {
  expect(hashCodexText(' hello\nworld ')).toMatch(/^sha256:[0-9a-f]{64}$/);
  expect(hashCodexText('hello world')).toBe(hashCodexText(' hello\nworld '));
});

it('prefixes Browser and Computer Use tags exactly once', () => {
  expect(normalizeCodexPrompt('Do it', { browser: true, computerUse: true })).toBe('@Browser\n@Computer Use\n\nDo it');
});
```

**Step 2: Run tests to verify failure**

```bash
npm test -- clis/codex/utils.test.js
```

Expected: fails because helpers do not exist.

**Step 3: Implement minimal helpers**

Add pure functions to `clis/codex/utils.js`:

```js
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function getCodexJobsDir(env = process.env) {
  return env.OPENCLI_CODEX_JOBS_DIR || path.join(os.homedir(), '.opencli', 'codex', 'jobs');
}

export function ensureCodexJobsDir(dir = getCodexJobsDir()) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function buildCodexJobId(date = new Date(), entropy = crypto.randomBytes(6).toString('hex')) {
  const stamp = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '').replace('T', '_');
  return `codex_${stamp}_${String(entropy).slice(0, 6).replace(/[^a-zA-Z0-9]/g, '')}`;
}

export function normalizeCodexText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function hashCodexText(value = '') {
  return `sha256:${crypto.createHash('sha256').update(normalizeCodexText(value)).digest('hex')}`;
}

export function normalizeCodexPrompt(text, opts = {}) {
  const tags = [];
  if (opts.browser) tags.push('@Browser');
  if (opts.computerUse) tags.push('@Computer Use');
  const body = String(text || '').trim();
  return tags.length ? `${tags.join('\n')}\n\n${body}` : body;
}
```

**Step 4: Run tests to verify pass**

```bash
npm test -- clis/codex/utils.test.js
```

Expected: pass.

### Task 2: Add DOM snapshot/tail extraction helper

**Objective:** Extract latest thread state consistently for submit/watch/result.

**Files:**

- Modify: `clis/codex/utils.js`
- Test: `clis/codex/utils.test.js`

**Step 1: Write failing tests**

Test a pure normalizer, not CDP itself:

```js
import { normalizeCodexThreadSnapshot } from './utils.js';

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
});
```

**Step 2: Implement helper**

Add to `clis/codex/utils.js`:

```js
export function normalizeCodexThreadSnapshot(raw = {}) {
  const turns = Array.isArray(raw.turns)
    ? raw.turns.map((value) => String(value || '').trim()).filter(Boolean)
    : [];
  const assistantBlocks = Array.isArray(raw.assistantBlocks)
    ? raw.assistantBlocks.map((value) => String(value || '').trim()).filter(Boolean)
    : [];
  const bodyText = String(raw.bodyText || '').trim();
  const tailText = turns.length ? turns[turns.length - 1] : bodyText;
  const assistantText = assistantBlocks.length ? assistantBlocks[assistantBlocks.length - 1] : '';
  return {
    turnCount: turns.length,
    turns,
    assistantBlocks,
    bodyText,
    tailText,
    tailHash: hashCodexText(tailText),
    assistantText,
    assistantHash: assistantText ? hashCodexText(assistantText) : '',
    generating: !!raw.generating,
    hasStop: !!raw.hasStop,
  };
}

export async function readCodexThreadSnapshot(page) {
  const raw = await page.evaluate(`
    (function() {
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const turns = Array.from(document.querySelectorAll('[data-content-search-turn-key]'))
        .map((node) => normalize(node.innerText || node.textContent))
        .filter(Boolean);
      // Smoke-tested on 2026-04-27: Codex may put user+assistant inside one
      // data-content-search-turn-key container, while the assistant answer is
      // a deeper markdown/content block. Prefer these for result extraction.
      const assistantBlocks = Array.from(document.querySelectorAll('[class*="markdownContent"], .markdown, [data-testid*="assistant"], [data-message-author-role="assistant"]'))
        .map((node) => normalize(node.innerText || node.textContent))
        .filter(Boolean);
      const buttons = Array.from(document.querySelectorAll('button')).map((node) => normalize(node.innerText || node.textContent));
      const hasStop = buttons.some((text) => /^Stop$/i.test(text) || /stop generating/i.test(text));
      const bodyText = normalize(document.body.innerText || document.body.textContent || '');
      return { turns, assistantBlocks, bodyText, hasStop, generating: hasStop };
    })()
  `);
  return normalizeCodexThreadSnapshot(raw);
}
```

**Step 3: Verify**

```bash
npm test -- clis/codex/utils.test.js
```

### Task 3: Add watcher classifier helper

**Objective:** Centralize state classification and prevent stale-text false positives.

**Files:**

- Modify: `clis/codex/utils.js`
- Test: `clis/codex/utils.test.js`

**Step 1: Write failing tests**

```js
import { classifyCodexWatchState } from './utils.js';

it('classifies in-app approval from newest tail', () => {
  expect(classifyCodexWatchState({ tailText: 'Allow Codex to use Safari? Allow ↵ Cancel Esc' }).status).toBe('waiting_for_approval');
});

it('classifies Apple Events auth failure distinctly', () => {
  expect(classifyCodexWatchState({ tailText: 'Apple event error -10000: Sender process is not authenticated' }).status).toBe('blocked_permissions');
});

it('classifies stable unchanged hash as final', () => {
  expect(classifyCodexWatchState({ tailText: 'Done', tailHash: 'sha256:x', generating: false }, { previousHash: 'sha256:x', stableCount: 3, stablePolls: 3 }).status).toBe('final');
});
```

**Step 2: Implement classifier**

Rules:

1. Inspect `snapshot.tailText` first.
2. Reuse `classifyCodexComputerUseGate(tailText)` for permission/approval categories.
3. Add stream/rate-limit/tool-failure regexes.
4. If generating/hasStop, return `running`.
5. If tail hash is unchanged for enough polls, return `final`.
6. Otherwise return `running`.

**Step 3: Verify**

```bash
npm test -- clis/codex/utils.test.js
```

### Task 4: Add job persistence helpers

**Objective:** Store and update job files safely.

**Files:**

- Modify: `clis/codex/utils.js`
- Test: `clis/codex/utils.test.js`

**Step 1: Write failing tests**

Use a temp directory through `OPENCLI_CODEX_JOBS_DIR` or explicit path injection.

```js
import { saveCodexJob, loadCodexJob } from './utils.js';

it('saves and loads a codex job json file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencli-codex-jobs-'));
  const job = { schema_version: 1, job_id: 'codex_test', status: 'submitted' };
  saveCodexJob(job, dir);
  expect(loadCodexJob('codex_test', dir).status).toBe('submitted');
});
```

**Step 2: Implement helper**

```js
export function getCodexJobPath(jobId, dir = getCodexJobsDir()) {
  if (!/^codex_[A-Za-z0-9_]+$/.test(jobId)) throw new Error(`Invalid Codex job id: ${jobId}`);
  return path.join(dir, `${jobId}.json`);
}

export function saveCodexJob(job, dir = getCodexJobsDir()) {
  ensureCodexJobsDir(dir);
  const next = { ...job, updated_at: new Date().toISOString() };
  fs.writeFileSync(getCodexJobPath(job.job_id, dir), JSON.stringify(next, null, 2));
  return next;
}

export function loadCodexJob(jobId, dir = getCodexJobsDir()) {
  return JSON.parse(fs.readFileSync(getCodexJobPath(jobId, dir), 'utf-8'));
}
```

**Step 3: Verify**

```bash
npm test -- clis/codex/utils.test.js
```

### Task 5: Extract shared composer injection helper

**Objective:** Avoid divergent `send`, `ask`, and `submit` injection logic.

**Files:**

- Modify: `clis/codex/utils.js`
- Modify: `clis/codex/send.js`
- Modify: `clis/codex/ask.js`
- Test: existing adapter command smoke tests where feasible.

**Step 1: Add helper**

```js
export async function submitCodexPromptToComposer(page, text) {
  const injected = await page.evaluate(`
    (function(text) {
      const editables = Array.from(document.querySelectorAll('[contenteditable="true"]'));
      const composer = editables.length > 0 ? editables[editables.length - 1] : document.querySelector('textarea');
      if (!composer) return false;
      composer.focus();
      document.execCommand('insertText', false, text);
      return true;
    })(${JSON.stringify(text)})
  `);
  if (!injected) return false;
  await page.wait(0.5);
  await page.pressKey('Enter');
  return true;
}
```

**Step 2: Refactor `send.js`**

Replace inline evaluate/press code with helper.

**Step 3: Refactor `ask.js`**

Keep public behavior but use `readCodexThreadSnapshot` and `submitCodexPromptToComposer`.

**Step 4: Verify**

```bash
npm test -- clis/codex/utils.test.js
npm run build-manifest
opencli codex send --help
opencli codex ask --help
```

### Task 6: Implement `submit` command

**Objective:** Add non-blocking job creation and prompt submission.

**Files:**

- Create: `clis/codex/submit.js`
- Test: `clis/codex/submit.test.js` if command-level tests are practical; otherwise cover pure helper flow in `utils.test.js`.
- Generated: `cli-manifest.json` after `npm run build-manifest`.

**Command skeleton:**

```js
import { cli, Strategy } from '@jackwener/opencli/registry';
import { SelectorError } from '@jackwener/opencli/errors';
import {
  buildCodexJobId,
  normalizeCodexPrompt,
  readCodexThreadSnapshot,
  saveCodexJob,
  submitCodexPromptToComposer,
} from './utils.js';

export const submitCommand = cli({
  site: 'codex',
  name: 'submit',
  description: 'Submit a Codex App prompt and record a local job for watch/result',
  domain: 'localhost',
  strategy: Strategy.UI,
  browser: true,
  args: [
    { name: 'text', required: true, positional: true, help: 'Prompt to submit' },
    { name: 'browser', type: 'bool', required: false, default: false, help: 'Prefix prompt with @Browser' },
    { name: 'computer-use', type: 'bool', required: false, default: false, help: 'Prefix prompt with @Computer Use' },
    { name: 'approve', required: false, default: '', help: 'Approval mode: once, always, cancel, or none' },
    { name: 'timeout', type: 'int', required: false, default: 1800, help: 'Default watch timeout seconds' },
    { name: 'poll', type: 'int', required: false, default: 5, help: 'Default watch poll interval seconds' },
  ],
  columns: ['Job', 'Status', 'Next'],
  navigateBefore: true,
  func: async (page, kwargs) => {
    const before = await readCodexThreadSnapshot(page);
    const computerUse = !!kwargs['computer-use'];
    const sent = normalizeCodexPrompt(kwargs.text, { browser: !!kwargs.browser, computerUse });
    const ok = await submitCodexPromptToComposer(page, sent);
    if (!ok) throw new SelectorError('Codex Composer input element');
    const jobId = buildCodexJobId();
    const approve = kwargs.approve || (computerUse ? 'always' : 'none');
    const job = saveCodexJob({
      schema_version: 1,
      job_id: jobId,
      created_at: new Date().toISOString(),
      status: 'submitted',
      cdp: {
        endpoint: process.env.OPENCLI_CDP_ENDPOINT || '',
        target: process.env.OPENCLI_CDP_TARGET || '',
      },
      prompt: { raw: kwargs.text, sent, browser: !!kwargs.browser, computer_use: computerUse, approve },
      thread_anchor: { before_turn_count: before.turnCount, before_tail_hash: before.tailHash },
      watch: { timeout_sec: Number(kwargs.timeout || 1800), poll_sec: Number(kwargs.poll || 5), stable_polls: 3, polls: 0 },
    });
    return [{ Job: job.job_id, Status: 'submitted', Next: `opencli codex watch --job ${job.job_id} -f json` }];
  },
});
```

**Verification:**

```bash
npm run build-manifest
opencli codex submit --help
```

Expected: help includes `submit`.

### Task 7: Implement `watch` command

**Objective:** Poll a submitted job to terminal state.

**Files:**

- Create: `clis/codex/watch.js`
- Test: pure classifier tests in `clis/codex/utils.test.js`; optional command test with mocked page.
- Generated: `cli-manifest.json`

**Behavior details:**

- Load job file.
- Poll with `readCodexThreadSnapshot(page)`.
- Track `stableCount` by comparing `tailHash` across polls.
- Call `classifyCodexWatchState(snapshot, { previousHash, stableCount, stablePolls })`.
- Save each state transition to the job file.
- Return immediately on terminal state.

**Verification:**

```bash
npm run build-manifest
opencli codex watch --help
```

Expected: help includes `watch`.

### Task 8: Implement `result` command

**Objective:** Return final or blocked result for a job.

**Files:**

- Create: `clis/codex/result.js`
- Test: result extraction helper if added.
- Generated: `cli-manifest.json`

**Behavior details:**

- Load job.
- Re-read thread if CDP is available.
- Prefer `job.result.text`, then `snapshot.assistantText`, then latest snapshot tail.
- Never treat a token found only in the original prompt as proof of success; compare against assistant-only extraction or text added after `before_tail_hash`.
- Include diagnostic if status is blocked/error/timeout.
- Optional `--output` writes markdown/json artifact.

**Verification:**

```bash
npm run build-manifest
opencli codex result --help
```

Expected: help includes `result`.

### Task 9: Implement `run` command

**Objective:** Provide one command for `submit + watch + result`.

**Files:**

- Create: `clis/codex/run.js`
- Generated: `cli-manifest.json`

**Design choice:** avoid shelling out to `opencli`; call shared internal functions used by submit/watch/result. This prevents divergent behavior and makes tests easier.

**Verification:**

```bash
npm run build-manifest
opencli codex run --help
```

Expected: help includes `run`.

### Task 10: Reconcile hidden `status` / `new` / `dump` / `screenshot` commands

**Objective:** Make docs match live help, or make live help match docs.

**Files:**

- Inspect/modify: `clis/codex/status.js`
- Inspect/modify: `clis/codex/new.js`
- Inspect/modify: `clis/codex/dump.js`
- Inspect/modify: `clis/codex/screenshot.js`
- Modify if needed: `src/build-manifest.ts`
- Test: `src/build-manifest.test.ts` if available/appropriate
- Generated: `cli-manifest.json`
- Docs: `docs/adapters/desktop/codex.md`

**Likely fix:** Update `src/build-manifest.ts` so command modules exported via helper factories are scanned/imported too, or convert helper-based command files to include explicit `cli(...)` exports.

**Verification:**

```bash
npm run build-manifest
opencli codex --help
```

Expected decision:

- If commands are intended: help exposes `status`, `new`, `dump`, `screenshot`.
- If commands are not production-ready: docs stop advertising them.

### Task 11: Update docs

**Objective:** Document production Codex workflow and local macOS caveats.

**Files:**

- Modify: `docs/adapters/desktop/codex.md`
- Keep: `docs/plans/2026-04-27-codex-app-run-submit-watch-result.md` as the implementation plan / decision log.

**Required doc updates:**

- Explain CDP endpoint/target (`9333` + `app://-/index.html?hostId=local` on this Mac).
- Distinguish CDP health, Browser Use health, Computer Use health, and macOS permissions.
- Add `submit/watch/result/run` examples.
- Explain job ledger path and cleanup.
- Document default approval mode for `--computer-use`: `always` unless overridden.

### Task 12: Build and focused validation

**Objective:** Verify the fork remains healthy after changes.

**Commands:**

```bash
npm run build
npm test -- clis/codex/utils.test.js
opencli --version
opencli codex --help
python3 - <<'PY'
import os, shutil
p = shutil.which('opencli')
print(p)
print(os.path.realpath(p))
PY
```

Expected:

- Build succeeds.
- Tests pass.
- `opencli` realpath still points to local fork `dist/src/main.js`.
- `opencli codex --help` includes new commands.

### Task 13: End-to-end smoke validation

**Objective:** Prove the workflow matches the owner's intended model before broader implementation/action.

**Safe prompt:**

```text
OpenCLI smoke test 2026-04-27. Do not use tools, do not edit files. Reply with exactly: CODEX_OPENCLI_SMOKE_OK
```

**Preflight:**

```bash
export OPENCLI_CDP_ENDPOINT="http://127.0.0.1:9333"
export OPENCLI_CDP_TARGET="app://-/index.html?hostId=local"
curl -s http://127.0.0.1:9333/json/version
opencli codex read -f plain
```

**Current-command emulation before implementation:**

```bash
opencli codex send "OpenCLI smoke test 2026-04-27. Do not use tools, do not edit files. Reply with exactly: CODEX_OPENCLI_SMOKE_OK"
# emulate watch by polling:
opencli codex read -f plain
```

**Future-command validation after implementation:**

```bash
opencli codex run "OpenCLI smoke test 2026-04-27. Do not use tools, do not edit files. Reply with exactly: CODEX_OPENCLI_SMOKE_OK" --current --timeout 180 --poll 5 -f json
```

Expected success:

- `submit` returns a job id quickly.
- `watch` classifies `running` then `final`.
- `result` contains exactly `CODEX_OPENCLI_SMOKE_OK` or a clearly parseable final assistant message containing that token.

Expected failure handling:

- If OpenCLI cannot find composer: revise selector/injection plan before implementation.
- If read returns stale/wrong window: revise CDP target selection and preflight.
- If Codex stream disconnects: classify as `error`, do not treat as final.
- If approval/permission cards appear: classify as `waiting_for_approval` or `blocked_permissions` and update the plan.

## Acceptance criteria

A successful implementation must satisfy all of these:

- `opencli codex --help` lists `submit`, `watch`, `result`, and `run`.
- `opencli codex submit ... -f json` creates a job file and returns without waiting for final answer.
- `opencli codex watch --job ... -f json` reaches one of the documented terminal states.
- `opencli codex result --job ... -f json` returns final text or blocker diagnostics.
- `opencli codex run ... -f json` performs the full cycle and never silently claims success on blocked/error/timeout.
- Watch classification uses newest tail text and stable hashes, not whole-page stale text.
- Browser/Computer Use prompt tags are injected automatically from flags.
- `--computer-use` defaults to durable in-app approval automation (`--approve always`) unless overridden.
- macOS native permissions remain explicit/manual when required.
- Docs match live help.
- Build/tests pass and active global `opencli` remains linked to the local fork.

## Trial log

### 2026-04-27 initial preflight and smoke trial

Status: passed with plan revisions.

Preflight facts verified:

- Active OpenCLI fork: `/Users/xlmini/.openclaw/workspace-agents/opencli-cli-operator/repos/OpenCLI-fork`
- Codex CDP endpoint: `http://127.0.0.1:9333`
- Codex main target: `app://-/index.html?hostId=local`
- Live Codex command set: `ask`, `computer-use`, `export`, `extract-diff`, `guide`, `history`, `model`, `read`, `send`, `settings`
- Hermes non-login shell needed explicit PATH for `opencli`/`node`:

```bash
PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
```

Smoke command used:

```bash
PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin \
OPENCLI_CDP_ENDPOINT=http://127.0.0.1:9333 \
OPENCLI_CDP_TARGET='app://-/index.html?hostId=local' \
/opt/homebrew/bin/opencli codex send \
'OpenCLI smoke test 2026-04-27. Do not use tools, do not edit files. Reply with exactly: CODEX_OPENCLI_SMOKE_OK'
```

Observed `send` result:

```text
- Status: Success
  InjectedText: 'OpenCLI smoke test 2026-04-27. Do not use tools, do not edit files. Reply with exactly: CODEX_OPENCLI_SMOKE_OK'
```

Observed `read` lifecycle:

1. First poll showed the prompt plus `Thinking`.
2. Second poll showed the prompt and assistant answer:

```text
Content: OpenCLI smoke test 2026-04-27. Do not use tools, do not edit files. Reply with exactly: CODEX_OPENCLI_SMOKE_OK

8:51 AM

CODEX_OPENCLI_SMOKE_OK

8:51 AM
```

Direct CDP DOM inspection after completion:

- Target was correct: `app://-/index.html?hostId=local` with title `Codex`.
- `[data-content-search-turn-key]` count was `1`.
- That single turn grouped both user prompt and assistant answer.
- The assistant-only final answer was visible as a deeper markdown/content block with text exactly `CODEX_OPENCLI_SMOKE_OK`.

Plan revisions from this trial:

- Keep the overall submit/watch/result plan.
- Add assistant-only extraction to `readCodexThreadSnapshot` / `result` because grouped turn text can false-positive on the user's prompt.
- Keep stable hash polling, but treat coarse turn hash as a lifecycle signal, not as the final-result extractor.
- Add explicit PATH guidance to validation commands when running from Hermes/non-login shells.

Decision: the basic control assumption is valid. OpenCLI can submit into Codex App through CDP and poll/read the resulting answer. Proceed with implementation after applying the selector/result-extraction revisions above.

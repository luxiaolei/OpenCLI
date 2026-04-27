import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function buildCodexComputerUseHint(prefix = '') {
  const lines = [];
  if (prefix) lines.push(prefix.trim());
  lines.push('Codex Computer Use setup:');
  lines.push('1. In the Codex app sidebar, click the bottom-left Settings button. It opens the account menu; click Settings there.');
  lines.push('2. In Settings, open Computer use. If the plugin is not installed, click Install. If it is installed, use Try in Chat.');
  lines.push('3. In macOS, open System Settings -> Privacy & Security -> Screen Recording and Accessibility, then enable Codex.app.');
  lines.push('4. When Codex asks to use an app, choose Always allow if you want durable approval. Confirm the app appears under Settings -> Computer use -> Always-allowed apps.');
  lines.push('5. If a Codex command returns empty output, return to the main Codex app/thread and rerun the command after setup.');
  lines.push('6. If Codex is listening on a non-default CDP port, export OPENCLI_CDP_ENDPOINT=http://127.0.0.1:<port> first (for example 9333). If OpenCLI lands on the wrong window, also set OPENCLI_CDP_TARGET=app://-/index.html?hostId=local.');
  lines.push('Shortcuts: run `opencli codex guide` for the checklist, `opencli codex settings computer-use` to open the exact settings section, or `opencli codex computer-use ["prompt"]` to attach Computer Use and optionally send a prompt immediately. Add `--approve once|always` if you also want OpenCLI to click a delayed in-app approval card.');
  return lines.join('\n');
}

export function classifyCodexComputerUseGate(rawText = '') {
  const text = String(rawText || '').replace(/\s+/g, ' ').trim();
  if (!text) return null;

  const scope = text.slice(-2000);
  const lower = scope.toLowerCase();
  const appleEventsAuthFailure = /apple event error -10000|sender process is not authenticated/.test(lower);
  if (appleEventsAuthFailure) {
    return {
      kind: 'apple-events',
      status: 'Blocked',
      state: 'Waiting for Apple Events authentication',
      hint: 'Codex got past the in-app approval card, but macOS is still rejecting Apple Events. Leave any native automation prompt visible if it appears, ensure Codex.app keeps its Accessibility and Screen Recording permissions, then restart Codex and rerun the Computer Use step.',
    };
  }

  const mentionsPermissions = /screen recording|screen capture|accessibility/.test(lower);
  const mentionsPermissionFlow = /privacy\s*&\s*security|system settings|enable codex|grant|permission/.test(lower);
  if (mentionsPermissions && mentionsPermissionFlow) {
    return {
      kind: 'permissions',
      status: 'Blocked',
      state: 'Waiting for macOS permissions',
      hint: 'Codex is blocked by macOS permissions. Open System Settings -> Privacy & Security -> Screen Recording and Accessibility, enable Codex.app, restart Codex if macOS asks, then rerun `opencli codex computer-use`.',
    };
  }

  const mentionsApprovalPrompt = /allow codex to use [^?]+\?|yes, and don'?t ask again|don'?t ask again|always allow/.test(lower)
    && /allow|cancel|yes|no/.test(lower);
  if (mentionsApprovalPrompt) {
    return {
      kind: 'approval',
      status: 'Blocked',
      state: 'Waiting for approval',
      hint: 'Codex is waiting on an in-app approval card. Choose `Always allow` if you want a sticky allowlist, or `Allow` / `Yes` for a one-off run, then resend or continue the prompt.',
    };
  }

  return null;
}

export function buildCodexGuideRows() {
  return [
    {
      Step: 'Configure CDP endpoint',
      Details: 'If Codex is listening on a non-default debug port for your machine, set OPENCLI_CDP_ENDPOINT=http://127.0.0.1:<port> before running `opencli codex ...` (for example 127.0.0.1:9333). If multiple Codex windows/targets exist or OpenCLI attaches to the wrong one, also set OPENCLI_CDP_TARGET=app://-/index.html?hostId=local. This is environment-specific and should be adjusted per computer.',
    },
    {
      Step: 'Open Settings',
      Details: 'In the Codex sidebar, click the bottom-left Settings button. It opens the account menu; click Settings there.',
    },
    {
      Step: 'Open Computer use',
      Details: 'In the Settings sidebar, click Computer use. If the plugin card shows Install, click it. If it is already installed, use Try in Chat.',
    },
    {
      Step: 'Grant macOS permissions',
      Details: 'Open System Settings -> Privacy & Security -> Screen Recording and Accessibility, then enable Codex.app.',
    },
    {
      Step: 'Make approvals sticky',
      Details: 'When Codex asks to use an app, choose Always allow if you want persistent approval. Check Settings -> Computer use -> Always-allowed apps to confirm.',
    },
    {
      Step: 'If output is empty',
      Details: 'Return to the main Codex app/thread and rerun the command. Use `opencli codex settings computer-use` to jump back to the setup screen.',
    },
  ];
}

export function normalizeCodexVisibleSessionState(raw = {}) {
  const visibleTexts = Array.isArray(raw.visibleTexts)
    ? raw.visibleTexts
      .map((value) => String(value || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
    : [];

  const model = visibleTexts.find((value) => /^(GPT|gpt)-\d/.test(value) || /^Codex-Spark$/i.test(value))
    || 'Unknown or Not Found';
  const reasoning = visibleTexts.find((value) => /^(Low|Medium|High|Extra High)$/i.test(value))
    || 'Unknown or Not Found';

  return {
    model,
    reasoning,
    needsHint: model === 'Unknown or Not Found',
  };
}

export function buildCodexSettingsNavigationScript(section = '') {
  return `
    (async function(targetSection) {
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const same = (a, b) => normalize(a).toLowerCase() === normalize(b).toLowerCase();
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const clickNode = (node) => {
        if (!(node instanceof HTMLElement)) return false;
        try { node.focus({ preventScroll: true }); } catch {}
        try { node.click(); return true; } catch { return false; }
      };
      const getSettingsShell = () => {
        const text = normalize(document.body.innerText || '');
        return text.includes('Back to app') && text.includes('Computer use');
      };
      const openSettingsShell = async () => {
        if (getSettingsShell()) return { ok: true, via: 'already-open' };
        const trigger = Array.from(document.querySelectorAll('button')).find((node) => {
          return same(node.innerText || node.textContent || '', 'Settings')
            && node.getAttribute('aria-haspopup') === 'menu';
        });
        if (!trigger || !clickNode(trigger)) {
          return { ok: false, reason: 'settings-trigger-not-found' };
        }
        await sleep(100);
        const menuItem = Array.from(document.querySelectorAll('[role="menuitem"]')).find((node) => same(node.innerText || node.textContent || '', 'Settings'));
        if (!menuItem || !clickNode(menuItem)) {
          return { ok: false, reason: 'settings-menu-item-not-found' };
        }
        await sleep(150);
        return { ok: true, via: 'menu' };
      };

      const shell = await openSettingsShell();
      if (!shell.ok) {
        return {
          status: 'Failed',
          view: 'App',
          hint: shell.reason === 'settings-trigger-not-found'
            ? 'Could not find the sidebar Settings trigger.'
            : 'Could not find the Settings menu item after opening the account menu.',
        };
      }

      if (!normalize(targetSection)) {
        return { status: 'Success', view: 'Settings', hint: '' };
      }

      const candidates = Array.from(document.querySelectorAll('button,[role="tab"],[role="link"],div[role="link"]'));
      const sectionNode = candidates.find((node) => same(node.innerText || node.textContent || '', targetSection));
      if (!sectionNode || !clickNode(sectionNode)) {
        return {
          status: 'Partial',
          view: 'Settings',
          hint: 'Settings opened, but the requested section was not found in the sidebar.',
        };
      }
      await sleep(100);
      return {
        status: 'Success',
        view: normalize(targetSection),
        hint: '',
      };
    })(${JSON.stringify(section)});
  `;
}

const MANAGED_PROMPT_TAGS = ['@Browser', '@Computer Use'];
const TERMINAL_WATCH_STATES = new Set(['final', 'waiting_for_approval', 'blocked_permissions', 'error', 'timeout']);

export function normalizeCodexText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function cleanCodexBlockText(value = '') {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

export function hashCodexText(value = '') {
  return `sha256:${crypto.createHash('sha256').update(normalizeCodexText(value)).digest('hex')}`;
}

export function buildCodexJobId(date = new Date(), entropy = crypto.randomBytes(6).toString('hex')) {
  const safeDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const stamp = [
    safeDate.getUTCFullYear(),
    String(safeDate.getUTCMonth() + 1).padStart(2, '0'),
    String(safeDate.getUTCDate()).padStart(2, '0'),
    '_',
    String(safeDate.getUTCHours()).padStart(2, '0'),
    String(safeDate.getUTCMinutes()).padStart(2, '0'),
    String(safeDate.getUTCSeconds()).padStart(2, '0'),
  ].join('');
  const rawEntropy = String(entropy || '');
  const cleaned = rawEntropy.replace(/[^A-Za-z0-9]/g, '');
  const fallback = crypto.createHash('sha256').update(rawEntropy || String(Date.now())).digest('hex');
  const suffix = `${cleaned}${fallback}`.slice(0, 6);
  return `codex_${stamp}_${suffix}`;
}

export function getOpencliStateDir(env = process.env) {
  return env.OPENCLI_STATE_DIR || path.join(os.homedir(), '.opencli', 'state');
}

export function getCodexJobsDir(env = process.env) {
  return path.join(getOpencliStateDir(env), 'codex', 'jobs');
}

export function ensureCodexJobsDir(dir = getCodexJobsDir()) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getCodexJobPath(jobId, dir = getCodexJobsDir()) {
  const id = String(jobId || '').trim();
  if (!/^codex_[A-Za-z0-9_]+$/.test(id)) {
    throw new Error(`Invalid Codex job id: ${jobId}`);
  }
  return path.join(dir, `${id}.json`);
}

export function readJsonFileSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read JSON file ${filePath}: ${message}`);
  }
}

export function writeJsonFileSafe(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
  fs.renameSync(tmpPath, filePath);
  return filePath;
}

export function saveCodexJob(job, dir = getCodexJobsDir()) {
  if (!job?.job_id) throw new Error('Codex job is missing job_id');
  ensureCodexJobsDir(dir);
  const now = new Date().toISOString();
  const next = {
    schema_version: 1,
    ...job,
    updated_at: now,
  };
  if (!next.created_at) next.created_at = now;
  writeJsonFileSafe(getCodexJobPath(next.job_id, dir), next);
  return next;
}

export function loadCodexJob(jobId, dir = getCodexJobsDir()) {
  const filePath = getCodexJobPath(jobId, dir);
  const job = readJsonFileSafe(filePath, null);
  if (!job) throw new Error(`Codex job not found: ${jobId}`);
  return job;
}

export function normalizeCodexApprovalMode(rawMode = '', fallback = 'none') {
  const mode = String(rawMode ?? '').replace(/\s+/g, '-').trim().toLowerCase();
  if (!mode) return fallback;
  if (['none', 'once', 'always', 'cancel'].includes(mode)) return mode;
  return fallback;
}

function stripLeadingManagedPromptTags(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').trim().split('\n');
  while (lines.length) {
    const first = lines[0].trim().toLowerCase();
    if (!MANAGED_PROMPT_TAGS.some((tag) => tag.toLowerCase() === first)) break;
    lines.shift();
    while (lines.length && !lines[0].trim()) lines.shift();
  }
  return lines.join('\n').trim();
}

export function normalizeCodexPrompt(text, opts = {}) {
  const tags = [];
  if (opts.browser) tags.push('@Browser');
  if (opts.computerUse || opts.computer_use || opts['computer-use']) tags.push('@Computer Use');
  const body = stripLeadingManagedPromptTags(text);
  return tags.length ? `${tags.join('\n')}\n\n${body}`.trimEnd() : String(text || '').trim();
}

export function normalizeCodexPromptOptions(text, opts = {}) {
  const browser = !!opts.browser;
  const computerUse = !!(opts.computerUse || opts.computer_use || opts['computer-use']);
  const approve = normalizeCodexApprovalMode(
    opts.approve,
    computerUse ? 'always' : 'none',
  );
  return {
    raw: String(text || '').trim(),
    sent: normalizeCodexPrompt(text, { browser, computerUse }),
    browser,
    computerUse,
    computer_use: computerUse,
    approve,
  };
}

export function normalizeCodexThreadSnapshot(raw = {}) {
  const turns = Array.isArray(raw.turns)
    ? raw.turns.map(cleanCodexBlockText).filter(Boolean)
    : [];
  const assistantBlocks = Array.isArray(raw.assistantBlocks)
    ? raw.assistantBlocks.map(cleanCodexBlockText).filter(Boolean)
    : [];
  const bodyText = cleanCodexBlockText(raw.bodyText || '');
  const tailText = turns.length ? turns[turns.length - 1] : bodyText;
  const assistantText = assistantBlocks.length ? assistantBlocks[assistantBlocks.length - 1] : '';
  const isGenerating = !!(raw.isGenerating || raw.generating || raw.hasStop);
  return {
    turns,
    assistantBlocks,
    assistantText,
    tailText,
    bodyText,
    tailHash: hashCodexText(tailText),
    assistantHash: assistantText ? hashCodexText(assistantText) : '',
    turnCount: turns.length,
    assistantBlockCount: assistantBlocks.length,
    isGenerating,
    generating: isGenerating,
    hasStop: !!raw.hasStop,
  };
}

export async function readCodexThreadSnapshot(page) {
  const raw = await page.evaluate(`
    (function() {
      const normalize = (value) => String(value || '')
        .replace(/\\r\\n?/g, '\\n')
        .replace(/[ \\t]+$/gm, '')
        .replace(/\\n{4,}/g, '\\n\\n\\n')
        .trim();
      const textOf = (node) => normalize(node && (node.innerText || node.textContent || ''));
      const isVisible = (node) => {
        if (!(node instanceof Element)) return false;
        const style = window.getComputedStyle(node);
        if (style.visibility === 'hidden' || style.display === 'none') return false;
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const turns = Array.from(document.querySelectorAll('[data-content-search-turn-key]'))
        .filter(isVisible)
        .map(textOf)
        .filter(Boolean);
      const assistantSelectors = [
        '[data-message-author-role="assistant"]',
        '[data-testid*="assistant" i]',
        '[aria-label*="assistant" i]',
        '[class*="assistant" i] [class*="markdown" i]',
        '[class*="markdownContent"]',
        '[class*="markdown-content" i]',
        '[class*="markdown" i]',
        '.markdown',
        'article [class*="prose" i]'
      ];
      const seen = new Set();
      const assistantBlocks = [];
      for (const selector of assistantSelectors) {
        for (const node of Array.from(document.querySelectorAll(selector))) {
          if (!isVisible(node) || seen.has(node)) continue;
          seen.add(node);
          const text = textOf(node);
          if (text) assistantBlocks.push(text);
        }
      }
      const buttons = Array.from(document.querySelectorAll('button,[role="button"]'))
        .filter(isVisible)
        .map(textOf)
        .filter(Boolean);
      const tail = turns.length ? turns[turns.length - 1] : '';
      const hasStop = buttons.some((text) => /^Stop$/i.test(text) || /stop generating/i.test(text));
      const activity = tail.split('\\n').some((line) => /^(Thinking|Working|Browsing|Running|Generating|Using Browser|Using Computer)(?:[.…]*|\\s*\\d+%?)$/i.test(normalize(line)));
      const bodyText = normalize(document.body && (document.body.innerText || document.body.textContent || ''));
      return { turns, assistantBlocks, bodyText, hasStop, isGenerating: hasStop || activity };
    })()
  `);
  return normalizeCodexThreadSnapshot(raw);
}

export async function submitCodexPromptToComposer(page, text) {
  const injected = await page.evaluate(`
    (function(input) {
      const explicit = document.querySelector('[data-codex-composer="true"][contenteditable="true"]');
      const editables = Array.from(document.querySelectorAll('[contenteditable="true"]'));
      const composer = explicit || editables[editables.length - 1] || document.querySelector('textarea');
      if (!composer) return false;
      try { composer.focus({ preventScroll: true }); } catch {}
      if (composer instanceof HTMLTextAreaElement) {
        composer.value = input;
        composer.dispatchEvent(new Event('input', { bubbles: true }));
        composer.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      try { document.execCommand('selectAll', false); } catch {}
      let ok = false;
      try { ok = document.execCommand('insertText', false, input); } catch {}
      if (!ok) {
        try {
          composer.textContent = input;
          composer.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: input }));
          ok = true;
        } catch {}
      }
      const value = String(composer.innerText || composer.textContent || '').replace(/\\s+/g, ' ').trim();
      return ok && value.includes(String(input || '').replace(/\\s+/g, ' ').trim());
    })(${JSON.stringify(String(text || ''))})
  `);
  if (!injected) return false;
  await page.wait(0.5);
  await page.pressKey('Enter');
  return true;
}

export async function startNewCodexThread(page) {
  const isMac = process.platform === 'darwin';
  await page.pressKey(isMac ? 'Meta+N' : 'Control+N');
  await page.wait(1);
  return true;
}

function focusCodexWatchText(snapshot = {}) {
  const parts = [];
  if (snapshot.tailText) parts.push(snapshot.tailText);
  if (snapshot.assistantText && snapshot.assistantText !== snapshot.tailText) parts.push(snapshot.assistantText);
  return parts.join('\n\n').trim();
}

function hasNewAssistantAfterAnchor(snapshot = {}, context = {}) {
  const assistantHash = snapshot.assistantHash || '';
  if (!assistantHash) return false;
  const anchorAssistantHash = context.anchorAssistantHash || '';
  const anchorAssistantCount = Number(context.anchorAssistantCount || 0);
  const assistantBlockCount = Number(snapshot.assistantBlockCount ?? snapshot.assistantBlocks?.length ?? 0);
  return assistantHash !== anchorAssistantHash || assistantBlockCount > anchorAssistantCount;
}

function hasNewTailAfterAnchor(snapshot = {}, context = {}) {
  const anchorHash = context.anchorHash || '';
  const anchorTurnCount = Number(context.anchorTurnCount || 0);
  const turnCount = Number(snapshot.turnCount || 0);
  return Boolean(snapshot.tailHash && snapshot.tailHash !== anchorHash && turnCount > anchorTurnCount);
}

function hasCodexWatchAnchor(context = {}) {
  return Boolean(context.anchorHash || context.anchorAssistantHash || context.anchorTurnCount || context.anchorAssistantCount);
}

function hasCodexAssistantAnchor(context = {}) {
  return Boolean(context.anchorAssistantHash || context.anchorAssistantCount);
}

function tailHasContentAfterSubmittedPrompt(snapshot = {}, context = {}) {
  const prompts = [context.promptSent, context.promptRaw]
    .map((value) => cleanCodexBlockText(value || ''))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  if (!prompts.length) return true;
  let candidate = cleanCodexBlockText(snapshot.tailText || '');
  for (const prompt of prompts) {
    const normalizedCandidate = normalizeCodexText(candidate).toLowerCase();
    const normalizedPrompt = normalizeCodexText(prompt).toLowerCase();
    if (normalizedCandidate.startsWith(normalizedPrompt)) {
      candidate = candidate.slice(prompt.length).trim();
      break;
    }
  }
  candidate = candidate
    .replace(/^(\d{1,2}:\d{2}\s*(?:AM|PM)\s*)+/i, '')
    .replace(/^(Thinking|Working|Generating)\b\s*/i, '')
    .trim();
  return Boolean(candidate);
}

export function selectCodexWatchContentHash(snapshot = {}, context = {}) {
  if (!hasCodexWatchAnchor(context)) return snapshot.assistantHash || snapshot.tailHash || '';
  if (snapshot.assistantHash) {
    if (hasNewAssistantAfterAnchor(snapshot, context)) return snapshot.assistantHash;
    if (hasCodexAssistantAnchor(context)) return '';
  }
  if (hasNewTailAfterAnchor(snapshot, context) && tailHasContentAfterSubmittedPrompt(snapshot, context)) {
    return snapshot.tailHash || '';
  }
  return '';
}

function hasNewContentAfterAnchor(snapshot = {}, context = {}) {
  const hasAnchor = hasCodexWatchAnchor(context);
  if (!hasAnchor) return Boolean(snapshot.assistantHash || snapshot.tailHash);
  if (hasNewAssistantAfterAnchor(snapshot, context)) return true;
  if (hasCodexAssistantAnchor(context) && snapshot.assistantHash) return false;
  return hasNewTailAfterAnchor(snapshot, context) && tailHasContentAfterSubmittedPrompt(snapshot, context);
}

function classifyCodexError(text = '') {
  const lower = normalizeCodexText(text).toLowerCase();
  if (!lower) return null;
  if (/rate limit|too many requests|quota exceeded|usage limit/.test(lower)) {
    return { kind: 'rate-limit', message: text, hint: 'Codex reported a rate limit or quota failure. Wait and retry later.' };
  }
  if (/(?:^|\n)\s*(stream (disconnected|ended|failed)|network error|request failed|failed to fetch|connection lost|error sending request)\b/.test(lower)) {
    return { kind: 'stream', message: text, hint: 'Codex stream or network connection failed. Re-run the job or inspect the app.' };
  }
  if (/(?:^|\n)\s*(browser use|computer use|tool|command)\s+(failed|error|crashed|unavailable)\b/.test(lower)
    || /(?:^|\n)\s*(failed|error|crashed|unavailable)\s+(browser use|computer use|tool|command)\b/.test(lower)) {
    return { kind: 'tool', message: text, hint: 'A Codex tool run failed. Inspect the newest assistant turn for details.' };
  }
  if (/\b(error|exception|traceback)\b/.test(lower) && !/permission/.test(lower)) {
    const looksLikeRunFailure = /(?:^|\n)\s*(error|exception)\s*:/.test(lower)
      || /(?:^|\n)\s*traceback \(most recent call last\):/.test(lower)
      || /(?:^|\n)\s*(request|stream|browser use|computer use|tool|command)\s+(failed|error|exception|traceback)\b/.test(lower)
      || /(?:^|\n)\s*(failed|error|exception|traceback)\s+(request|stream|browser use|computer use|tool|command)\b/.test(lower)
      || /codex\s+(error|exception|traceback)/.test(lower);
    if (looksLikeRunFailure) {
      return { kind: 'unknown', message: text, hint: 'Codex reported an error in the newest turn.' };
    }
  }
  return null;
}

export function classifyCodexWatchState(snapshot = {}, context = {}) {
  const timedOut = !!context.timedOut;
  if (timedOut) {
    return {
      status: 'timeout',
      terminal: true,
      diagnostic: { kind: 'timeout', message: 'Codex watch timed out before reaching a terminal state.', hint: 'Increase --timeout or inspect the Codex app.' },
    };
  }

  const newestText = focusCodexWatchText(snapshot);
  const allowGateDetection = context.allowGateDetection !== false;
  const gate = allowGateDetection ? classifyCodexComputerUseGate(newestText) : null;
  if (gate?.kind === 'approval') {
    return {
      status: 'waiting_for_approval',
      terminal: true,
      diagnostic: { kind: 'approval', message: gate.state, hint: gate.hint },
    };
  }
  if (gate?.kind === 'permissions' || gate?.kind === 'apple-events') {
    return {
      status: 'blocked_permissions',
      terminal: true,
      diagnostic: { kind: gate.kind, message: gate.state, hint: gate.hint },
    };
  }

  const error = classifyCodexError(newestText);
  if (error) {
    return { status: 'error', terminal: true, diagnostic: error };
  }

  if (snapshot.isGenerating || snapshot.generating || snapshot.hasStop) {
    return { status: 'running', terminal: false };
  }

  const candidateHash = selectCodexWatchContentHash(snapshot, context);
  const latestHash = candidateHash || (!hasCodexWatchAnchor(context) ? (context.latestHash || snapshot.assistantHash || snapshot.tailHash) : '');
  const stablePolls = Math.max(1, Number(context.stablePolls || 3));
  const inferredStableCount = context.previousHash && latestHash && context.previousHash === latestHash
    ? Number(context.stableCount || 1)
    : Number(context.stableCount || 0);
  if (latestHash && inferredStableCount >= stablePolls && hasNewContentAfterAnchor(snapshot, context)) {
    return { status: 'final', terminal: true };
  }

  return { status: 'running', terminal: false };
}

export function isCodexWatchTerminal(status) {
  return TERMINAL_WATCH_STATES.has(status);
}

function stripPromptEchoFromTurn(text, job = {}) {
  let candidate = cleanCodexBlockText(text);
  const prompts = [job.prompt?.sent, job.prompt?.raw]
    .map((value) => cleanCodexBlockText(value || ''))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  for (const prompt of prompts) {
    if (candidate.startsWith(prompt)) {
      candidate = candidate.slice(prompt.length).trim();
      break;
    }
    const normalizedCandidate = normalizeCodexText(candidate);
    const normalizedPrompt = normalizeCodexText(prompt);
    if (normalizedCandidate.startsWith(normalizedPrompt)) {
      const index = candidate.toLowerCase().indexOf(prompt.toLowerCase());
      if (index >= 0) candidate = candidate.slice(index + prompt.length).trim();
    }
  }
  return candidate
    .replace(/^(\d{1,2}:\d{2}\s*(?:AM|PM)\s*)+/i, '')
    .replace(/^(Thinking|Working|Generating)\b\s*/i, '')
    .trim();
}

export function extractCodexAssistantResult(snapshot = {}, job = {}) {
  if (snapshot.assistantText) {
    const context = {
      anchorAssistantHash: job.thread_anchor?.before_assistant_hash,
      anchorAssistantCount: job.thread_anchor?.before_assistant_count,
    };
    if (!hasCodexAssistantAnchor(context) || hasNewAssistantAfterAnchor(snapshot, context)) {
      return { text: snapshot.assistantText, source: 'assistant' };
    }
  }
  const anchorCount = Math.max(0, Number(job.thread_anchor?.before_turn_count || 0));
  const turns = Array.isArray(snapshot.turns) ? snapshot.turns : [];
  const newTurns = turns.slice(Math.min(anchorCount, turns.length));
  const turnCandidate = newTurns.length ? newTurns[newTurns.length - 1] : '';
  if (turnCandidate) {
    const stripped = stripPromptEchoFromTurn(turnCandidate, job);
    if (stripped) return { text: stripped, source: 'turn_after_anchor' };
    if (job.prompt?.sent || job.prompt?.raw) return { text: '', source: 'none' };
    return { text: turnCandidate, source: 'turn_grouped' };
  }
  if (snapshot.tailText && snapshot.tailHash !== job.thread_anchor?.before_tail_hash) {
    const stripped = stripPromptEchoFromTurn(snapshot.tailText, job);
    if (stripped) return { text: stripped, source: 'tail_after_anchor' };
    if (job.prompt?.sent || job.prompt?.raw) return { text: '', source: 'none' };
    return { text: snapshot.tailText, source: 'tail' };
  }
  return { text: '', source: 'none' };
}

export function truncateCodexText(text = '', maxLength = 500) {
  const normalized = normalizeCodexText(text);
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`;
}

function getApprovalButtonLabels(mode) {
  if (mode === 'always') return ['Yes, and don’t ask again', "Yes, and don't ask again", 'Always allow', 'Allow', 'Yes'];
  if (mode === 'once') return ['Allow', 'Yes'];
  if (mode === 'cancel') return ['Cancel', 'No'];
  return [];
}

export async function clickCodexApprovalButton(page, rawMode = 'none') {
  const mode = normalizeCodexApprovalMode(rawMode, 'none');
  const labels = getApprovalButtonLabels(mode);
  if (!labels.length) return false;
  return page.evaluate(`
    (function(labels) {
      const wanted = labels.map((label) => String(label || '').replace(/\\s+/g, ' ').trim().toLowerCase());
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const stripShortcut = (value) => normalize(value).replace(/\\s+(↵|enter|esc|escape)$/i, '').trim();
      const clickNode = (node) => {
        if (!(node instanceof HTMLElement)) return false;
        try { node.focus({ preventScroll: true }); } catch {}
        try { node.click(); return true; } catch { return false; }
      };
      if (${JSON.stringify(mode)} === 'always') {
        const checkbox = Array.from(document.querySelectorAll('button,[role="checkbox"],div[role="checkbox"]')).find((candidate) => {
          const label = normalize(candidate.innerText || candidate.textContent || candidate.getAttribute('aria-label') || '').toLowerCase();
          const checked = normalize(candidate.getAttribute('aria-checked') || candidate.getAttribute('data-state') || '').toLowerCase();
          return (label.includes("don't ask again") || label.includes('don’t ask again')) && !(checked === 'true' || checked === 'checked');
        });
        if (checkbox) clickNode(checkbox);
      }
      const nodes = Array.from(document.querySelectorAll('button,[role="button"],div[role="button"]'));
      for (const label of wanted) {
        const node = nodes.find((candidate) => {
          const text = stripShortcut(candidate.innerText || candidate.textContent || '').toLowerCase();
          const aria = stripShortcut(candidate.getAttribute('aria-label') || '').toLowerCase();
          const title = stripShortcut(candidate.getAttribute('title') || '').toLowerCase();
          return text === label || aria === label || title === label;
        });
        if (clickNode(node)) return true;
      }
      return false;
    })(${JSON.stringify(labels)})
  `);
}

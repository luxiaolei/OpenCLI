import { request as httpRequest } from 'node:http';
import WebSocket from 'ws';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { buildCodexComputerUseHint, classifyCodexComputerUseGate } from './utils.js';
import { settingsCommand } from './settings.js';

const TRY_IN_CHAT_LABELS = ['try in chat', '在聊天中试用', '在聊天中试试'];
const COMPUTER_USE_COMPOSER_LABELS = ['computer use', '计算机使用', '电脑使用'];
const COMPUTER_USE_MENTION = '@Computer use';

const locateTryInChatScript = `
  (function() {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const labels = ${JSON.stringify(TRY_IN_CHAT_LABELS)};
    const btn = Array.from(document.querySelectorAll('button,[role="button"],a,div[role="button"]')).find((node) => {
      const label = normalize(node.getAttribute('aria-label') || '');
      const text = normalize(node.innerText || node.textContent || '');
      return labels.includes(label) || labels.includes(text);
    });
    if (!(btn instanceof HTMLElement)) return null;
    const rect = btn.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  })()
`;

const fireTryInChatScript = `
  (function() {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const labels = ${JSON.stringify(TRY_IN_CHAT_LABELS)};
    const target = Array.from(document.querySelectorAll('button,[role="button"],a,div[role="button"]')).find((node) => {
      const text = normalize(node.innerText || node.textContent || '');
      const aria = normalize(node.getAttribute('aria-label') || '');
      return labels.includes(text) || labels.includes(aria);
    });
    if (!(target instanceof HTMLElement)) return false;
    const init = { bubbles: true, cancelable: true, composed: true, view: window };
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      target.dispatchEvent(new MouseEvent(type, init));
    }
    return true;
  })()
`;

const hasComputerUseComposerScript = `
  (function() {
    const text = String(document.body.innerText || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const hasComputerUse = ${JSON.stringify(COMPUTER_USE_COMPOSER_LABELS)}.some((label) => text.includes(label));
    const hasComposerInput = Boolean(document.querySelector('[data-codex-composer="true"][contenteditable="true"], textarea, [contenteditable="true"]'));
    const hasSubmitButton = Array.from(document.querySelectorAll('button,[role="button"]')).some((node) => {
      const label = String(node.innerText || node.textContent || node.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      return ['submit', '提交'].includes(label);
    });
    return hasComputerUse && hasComposerInput && hasSubmitButton;
  })()
`;

const readVisibleTextScript = `
  (function() {
    return String(document.body.innerText || '').replace(/\\s+/g, ' ').trim();
  })()
`;

function buildInjectComposerPromptScript(text) {
  return `
    (function(input) {
      const explicit = document.querySelector('[data-codex-composer="true"][contenteditable="true"]');
      const editables = Array.from(document.querySelectorAll('[contenteditable="true"]'));
      const composer = explicit || editables[editables.length - 1] || document.querySelector('textarea');
      if (!composer) return false;
      try { composer.focus({ preventScroll: true }); } catch {}
      if (composer instanceof HTMLTextAreaElement) {
        composer.value = input;
        composer.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }
      try { document.execCommand('selectAll', false); } catch {}
      try { document.execCommand('insertText', false, input); } catch {}
      const value = String(composer.innerText || composer.textContent || '').replace(/\\s+/g, ' ').trim();
      return value.includes(String(input).trim());
    })(${JSON.stringify(text)})
  `;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function clickCoords(page, coords) {
  if (!coords || Number.isNaN(coords.x) || Number.isNaN(coords.y)) return false;
  if (typeof page.cdp === 'function') {
    await page.cdp('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: coords.x,
      y: coords.y,
      button: 'none',
    });
  }
  if (typeof page.nativeClick === 'function') {
    await page.nativeClick(coords.x, coords.y);
    return true;
  }
  return page.evaluate(`
    (function(point) {
      const node = document.elementFromPoint(point.x, point.y);
      if (!(node instanceof HTMLElement)) return false;
      try { node.focus({ preventScroll: true }); } catch {}
      try { node.click(); return true; } catch { return false; }
    })(${JSON.stringify(coords)})
  `);
}

function resolveRawCdpConfig() {
  const endpoint = process.env.OPENCLI_CDP_ENDPOINT;
  if (!endpoint) return null;
  return {
    endpoint,
    target: process.env.OPENCLI_CDP_TARGET || 'app://-/index.html?hostId=local',
  };
}

async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(url, { method: 'GET' }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function withRawCdp(config, run) {
  const endpointUrl = new URL(config.endpoint);
  const targets = await fetchJson(new URL('/json', endpointUrl));
  const pageTarget = Array.isArray(targets)
    ? targets.find((target) => target?.type === 'page' && String(target?.url || '').includes(config.target))
    : null;
  if (!pageTarget?.webSocketDebuggerUrl) {
    throw new Error('Codex CDP target not found');
  }

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl, { headers: { Origin: '' } });
  let messageId = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      pending.get(data.id)(data);
      pending.delete(data.id);
    }
  };
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++messageId;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`timeout ${method}`));
      }
    }, 15000);
  });

  try {
    await send('Runtime.enable');
    return await run(send);
  } finally {
    ws.close();
  }
}

async function rawEvaluate(config, expression) {
  return withRawCdp(config, async (send) => {
    const response = await send('Runtime.evaluate', { expression, returnByValue: true });
    return response?.result?.result?.value;
  });
}

async function rawClick(config, coords) {
  if (!coords || Number.isNaN(coords.x) || Number.isNaN(coords.y)) return false;
  await withRawCdp(config, async (send) => {
    await send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: coords.x,
      y: coords.y,
      button: 'none',
    });
    await send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: coords.x,
      y: coords.y,
      button: 'left',
      clickCount: 1,
    });
    await send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: coords.x,
      y: coords.y,
      button: 'left',
      clickCount: 1,
    });
  });
  return true;
}

async function waitForTryInChatCoords(page, attempts = 4) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const coords = await page.evaluate(locateTryInChatScript);
    if (coords) return coords;
    await page.wait({ time: 1 });
  }
  return null;
}

async function waitForTryInChatCoordsRaw(config, attempts = 4) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const coords = await rawEvaluate(config, locateTryInChatScript);
    if (coords) return coords;
    await sleep(200);
  }
  return null;
}

async function tryOpenComputerUseFromSettings(page) {
  const openedFromDom = await page.evaluate(fireTryInChatScript);
  if (openedFromDom) {
    await page.wait({ time: 1 });
    return true;
  }

  const tryInChatCoords = await waitForTryInChatCoords(page);
  const openedChat = await clickCoords(page, tryInChatCoords);
  if (openedChat) return true;

  const config = resolveRawCdpConfig();
  if (!config) return false;
  const rawCoords = await waitForTryInChatCoordsRaw(config);
  return rawClick(config, rawCoords);
}

async function checkComputerUseComposerReady(page) {
  const ready = await page.evaluate(hasComputerUseComposerScript);
  if (ready) return true;
  const config = resolveRawCdpConfig();
  if (!config) return false;
  return Boolean(await rawEvaluate(config, hasComputerUseComposerScript));
}

async function setComposerText(page, text) {
  const injected = await page.evaluate(buildInjectComposerPromptScript(text));
  if (injected) {
    await page.wait({ time: 1 });
    return true;
  }

  const config = resolveRawCdpConfig();
  if (!config) return false;
  return withRawCdp(config, async (send) => {
    const focused = await send('Runtime.evaluate', {
      expression: buildInjectComposerPromptScript(''),
      returnByValue: true,
    });
    if (!focused?.result?.result?.value) return false;
    await send('Input.insertText', { text });
    return true;
  });
}

function buildComputerUseInvocationText(text = '') {
  const trimmed = String(text || '').trim();
  return trimmed ? `${COMPUTER_USE_MENTION} ${trimmed}` : COMPUTER_USE_MENTION;
}

async function ensureComputerUseInvocationVisible(page) {
  return setComposerText(page, buildComputerUseInvocationText());
}

async function sendComputerUsePrompt(page, text) {
  const injected = await setComposerText(page, buildComputerUseInvocationText(text));
  if (injected) {
    await page.pressKey('Enter');
    return true;
  }

  const config = resolveRawCdpConfig();
  if (!config) return false;
  return withRawCdp(config, async (send) => {
    const focused = await send('Runtime.evaluate', {
      expression: buildInjectComposerPromptScript(''),
      returnByValue: true,
    });
    if (!focused?.result?.result?.value) return false;
    await send('Input.insertText', { text: buildComputerUseInvocationText(text) });
    await send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      windowsVirtualKeyCode: 13,
      code: 'Enter',
      key: 'Enter',
      text: '\r',
      unmodifiedText: '\r',
    });
    await send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      windowsVirtualKeyCode: 13,
      code: 'Enter',
      key: 'Enter',
    });
    return true;
  });
}

async function readVisibleText(page) {
  const visibleText = await page.evaluate(readVisibleTextScript);
  if (visibleText) return String(visibleText);
  const config = resolveRawCdpConfig();
  if (!config) return '';
  return String(await rawEvaluate(config, readVisibleTextScript) || '');
}

function normalizeApprovalMode(rawMode = '') {
  const mode = String(rawMode || '').replace(/\s+/g, '-').trim().toLowerCase();
  return ['once', 'always', 'cancel'].includes(mode) ? mode : null;
}

function describeApprovalMode(mode) {
  if (mode === 'always') return 'Always allow';
  if (mode === 'once') return 'one-off';
  if (mode === 'cancel') return 'cancel';
  return mode;
}

function getApprovalButtonLabels(mode) {
  if (mode === 'always') {
    return ['Yes, and don’t ask again', "Yes, and don't ask again", 'Always allow', 'Allow', 'Yes'];
  }
  if (mode === 'once') {
    return ['Allow', 'Yes'];
  }
  if (mode === 'cancel') {
    return ['Cancel', 'No'];
  }
  return [];
}

function buildLocateApprovalButtonScript(mode) {
  return `
    (function() {
      const wanted = ${JSON.stringify(getApprovalButtonLabels(mode).map((label) => label.toLowerCase()))};
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const stripShortcut = (value) => normalize(value).replace(/\s+(↵|enter|esc|escape)$/i, '').trim();
      const isPersistentVariant = (value) => value.includes("don't ask again") || value.includes('don’t ask again');
      const matches = (candidate, label) => {
        const cleaned = stripShortcut(candidate);
        if (!cleaned) return false;
        if (isPersistentVariant(cleaned)) return isPersistentVariant(label) && cleaned === label;
        return cleaned === label;
      };
      const nodes = Array.from(document.querySelectorAll('button,[role="button"],div[role="button"]'));
      for (const label of wanted) {
        const node = nodes.find((candidate) => {
          const text = normalize(candidate.innerText || candidate.textContent || '');
          const aria = normalize(candidate.getAttribute('aria-label') || '');
          const title = normalize(candidate.getAttribute('title') || '');
          return matches(text, label) || matches(aria, label) || matches(title, label);
        });
        if (node instanceof HTMLElement) {
          const rect = node.getBoundingClientRect();
          return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          };
        }
      }
      return null;
    })()
  `;
}

const locateApprovalCheckboxScript = `
  (function() {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const node = Array.from(document.querySelectorAll('button,[role="checkbox"],div[role="checkbox"]')).find((candidate) => {
      const text = normalize(candidate.innerText || candidate.textContent || '');
      const aria = normalize(candidate.getAttribute('aria-label') || '');
      const title = normalize(candidate.getAttribute('title') || '');
      const label = text || aria || title;
      const checked = normalize(candidate.getAttribute('aria-checked') || candidate.getAttribute('data-state') || '');
      return label.includes("don't ask again") || label.includes('don’t ask again')
        ? !(checked === 'true' || checked === 'checked')
        : false;
    });
    if (!(node instanceof HTMLElement)) return null;
    const rect = node.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  })()
`;

async function waitForComputerUseGate(page, attempts = 4) {
  let lastText = '';
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    lastText = await readVisibleText(page);
    const gate = classifyCodexComputerUseGate(lastText);
    if (gate) return { gate, text: lastText };
    await page.wait({ time: 1 });
  }
  return { gate: null, text: lastText };
}

async function waitForApprovalButtonCoords(page, mode, attempts = 4) {
  const script = buildLocateApprovalButtonScript(mode);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const coords = await page.evaluate(script);
    if (coords) return coords;
    await page.wait({ time: 1 });
  }
  return null;
}

async function waitForApprovalButtonCoordsRaw(config, mode, attempts = 4) {
  const script = buildLocateApprovalButtonScript(mode);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const coords = await rawEvaluate(config, script);
    if (coords) return coords;
    await sleep(200);
  }
  return null;
}

async function maybeToggleApprovalCheckbox(page, mode) {
  if (mode !== 'always') return false;
  const coords = await page.evaluate(locateApprovalCheckboxScript);
  const clicked = await clickCoords(page, coords);
  if (clicked) {
    await page.wait({ time: 1 });
    return true;
  }

  const config = resolveRawCdpConfig();
  if (!config) return false;
  const rawCoords = await rawEvaluate(config, locateApprovalCheckboxScript);
  if (!(await rawClick(config, rawCoords))) return false;
  await page.wait({ time: 1 });
  return true;
}

async function clickApprovalButton(page, mode) {
  await maybeToggleApprovalCheckbox(page, mode);

  const coords = await waitForApprovalButtonCoords(page, mode);
  const clicked = await clickCoords(page, coords);
  if (clicked) return true;

  const config = resolveRawCdpConfig();
  if (!config) return false;
  const rawCoords = await waitForApprovalButtonCoordsRaw(config, mode);
  return rawClick(config, rawCoords);
}

async function waitForApprovalCardToClear(page, attempts = 3) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const gate = classifyCodexComputerUseGate(await readVisibleText(page));
    if (!gate || gate.kind !== 'approval') return true;
    await page.wait({ time: 1 });
  }
  return false;
}

export const computerUseCommand = cli({
  site: 'codex',
  name: 'computer-use',
  description: 'Open Codex Computer Use, attach it to the current composer, optionally send a prompt, and optionally click an in-app approval card',
  domain: 'localhost',
  strategy: Strategy.UI,
  browser: true,
  args: [
    {
      name: 'text',
      required: false,
      positional: true,
      help: 'Optional prompt to send immediately after Computer Use is attached',
    },
    {
      name: 'approve',
      required: false,
      help: 'Optional approval mode after a prompt is sent: once, always, or cancel',
    },
    {
      name: 'approve-timeout',
      type: 'int',
      required: false,
      default: 30,
      help: 'Seconds to wait for a delayed approval card when --approve is used (default: 30)',
    },
  ],
  columns: ['Status', 'State', 'Prompt', 'Approval', 'Hint'],
  func: async (page, kwargs) => {
    const promptText = String(kwargs.text || '').trim();
    const rawApprovalMode = String(kwargs.approve || '').trim();
    const approvalMode = rawApprovalMode ? normalizeApprovalMode(rawApprovalMode) : null;
    const approvalTimeout = Math.max(2, parseInt(String(kwargs['approve-timeout'] || '30'), 10) || 30);
    if (rawApprovalMode && !approvalMode) {
      return [{
        Status: 'Failed',
        State: 'Args',
        Prompt: promptText ? 'Pending' : 'Skipped',
        Approval: rawApprovalMode,
        Hint: 'Unsupported `--approve` mode. Use `once`, `always`, or `cancel`.',
      }];
    }

    const continueFromReadyComposer = async () => {
      if (!promptText) {
        const invocationVisible = await ensureComputerUseInvocationVisible(page);
        if (!invocationVisible) {
          return [{
            Status: 'Partial',
            State: 'Composer ready',
            Approval: approvalMode || '',
            Hint: 'Computer Use chat opened, but `@Computer use` could not be inserted into the composer yet.',
          }];
        }
        return [{
          Status: 'Success',
          State: 'Composer ready',
          Approval: approvalMode || '',
          Hint: 'Computer Use is attached to the composer. `@Computer use` is visible in the chat box. Next run `opencli codex send "..."` or `opencli codex ask "..."`, or pass a prompt directly via `opencli codex computer-use "..."`. Use `--approve once` or `--approve always` if you also want OpenCLI to click a future in-app approval card.',
        }];
      }

      const promptSent = await sendComputerUsePrompt(page, promptText);
      if (!promptSent) {
        return [{
          Status: 'Partial',
          State: 'Composer ready',
          Prompt: 'Not sent',
          Hint: buildCodexComputerUseHint('Computer Use is attached, but the prompt could not be injected into the composer.'),
        }];
      }
      await page.wait({ time: 1 });

      const gateAttempts = approvalMode ? approvalTimeout : 4;
      const { gate } = await waitForComputerUseGate(page, gateAttempts);
      if (gate?.kind === 'approval' && approvalMode) {
        const clicked = await clickApprovalButton(page, approvalMode);
        if (!clicked) {
          return [{
            Status: 'Partial',
            State: gate.state,
            Prompt: promptText ? 'Sent' : 'Skipped',
            Approval: approvalMode,
            Hint: `Codex is waiting for approval, but the ${describeApprovalMode(approvalMode)} button could not be found yet.`,
          }];
        }

        await page.wait({ time: 1 });
        const cleared = await waitForApprovalCardToClear(page);
        return [{
          Status: cleared ? 'Success' : 'Partial',
          State: 'Approval clicked',
          Prompt: promptText ? 'Sent' : 'Skipped',
          Approval: approvalMode,
          Hint: cleared
            ? `Clicked ${describeApprovalMode(approvalMode)} on the in-app approval card. Continue monitoring the Codex thread for the next step.`
            : `Clicked ${describeApprovalMode(approvalMode)} on the in-app approval card, but the approval UI still looks present. Keep monitoring the Codex thread.`,
        }];
      }

      if (gate) {
        return [{
          Status: gate.status,
          State: gate.state,
          Prompt: promptText ? 'Sent' : 'Skipped',
          Approval: approvalMode || '',
          Hint: approvalMode && gate.kind === 'permissions'
            ? `${gate.hint} In-app approval automation cannot bypass macOS TCC.`
            : gate.hint,
        }];
      }

      return [{
        Status: 'Success',
        State: 'Prompt sent',
        Prompt: 'Sent',
        Approval: approvalMode || '',
        Hint: 'Computer Use is attached and the prompt was submitted. Use `opencli codex read`, `opencli codex ask`, or the Codex app thread to monitor progress. When Codex asks to use an app, choose `Always allow` if you want persistent approval, or rerun with `--approve once|always` to automate that in-app card.',
      }];
    };

    const readyNow = await checkComputerUseComposerReady(page);
    if (readyNow) {
      return continueFromReadyComposer();
    }

    let openedChat = await tryOpenComputerUseFromSettings(page);
    if (!openedChat) {
      const [settingsRow] = await settingsCommand.func(page, { section: 'computer-use' });
      if (!settingsRow || settingsRow.Status !== 'Success') {
        return [{
          Status: 'Blocked',
          State: settingsRow?.View || 'App',
          Hint: settingsRow?.Hint || buildCodexComputerUseHint('Could not reach the Codex Computer Use settings.'),
        }];
      }

      openedChat = await tryOpenComputerUseFromSettings(page);
      if (!openedChat) {
        return [{
          Status: 'Blocked',
          State: 'Computer use',
          Hint: buildCodexComputerUseHint('Codex opened Computer use, but Try in Chat was not available. If the plugin is not installed, click Install first.'),
        }];
      }
    }

    await page.wait({ time: 1 });
    const ready = await checkComputerUseComposerReady(page);
    if (!ready) {
      return [{
        Status: 'Partial',
        State: 'Chat opened',
        Hint: buildCodexComputerUseHint('Computer Use may have opened, but the attachment was not visible yet.'),
      }];
    }

    return continueFromReadyComposer();
  },
});

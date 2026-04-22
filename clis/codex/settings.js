import { request as httpRequest } from 'node:http';
import WebSocket from 'ws';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { buildCodexComputerUseHint } from './utils.js';

const SETTINGS_LABELS = ['settings', '设置'];
const BACK_TO_APP_LABELS = ['back to app', '返回应用'];
const COMPUTER_USE_SECTION_LABELS = ['computer use', '电脑使用', '计算机使用'];

const hasSettingsShellScript = `
  (function() {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const text = normalize(document.body.innerText || '');
    const hasBack = ${JSON.stringify(BACK_TO_APP_LABELS)}.some((label) => text.includes(label));
    const hasComputerUse = ${JSON.stringify(COMPUTER_USE_SECTION_LABELS)}.some((label) => text.includes(label));
    return hasBack && hasComputerUse;
  })()
`;

const locateSettingsTriggerScript = `
  (function() {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const labels = ${JSON.stringify(SETTINGS_LABELS)};
    const trigger = Array.from(document.querySelectorAll('button')).find((node) => {
      const text = normalize(node.innerText || node.textContent || '');
      const aria = normalize(node.getAttribute('aria-label') || '');
      return (labels.includes(text) || labels.includes(aria))
        && normalize(node.getAttribute('aria-haspopup') || '') === 'menu';
    });
    if (!(trigger instanceof HTMLElement)) return null;
    const rect = trigger.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  })()
`;

const locateSettingsMenuItemScript = `
  (function() {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const labels = ${JSON.stringify(SETTINGS_LABELS)};
    const item = Array.from(document.querySelectorAll('[role="menuitem"]')).find((node) => {
      const text = normalize(node.innerText || node.textContent || '');
      const aria = normalize(node.getAttribute('aria-label') || '');
      return labels.includes(text) || labels.includes(aria);
    });
    if (!(item instanceof HTMLElement)) return null;
    const rect = item.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  })()
`;

function buildLocateSettingsSectionScript(section) {
  const target = String(section || '').replace(/-/g, ' ').trim().toLowerCase();
  const aliases = target === 'computer use'
    ? COMPUTER_USE_SECTION_LABELS
    : [target];
  return `
    (function() {
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      const labels = ${JSON.stringify(aliases)};
      const node = Array.from(document.querySelectorAll('button,[role="tab"],[role="link"],div[role="link"]')).find((candidate) => {
        const text = normalize(candidate.innerText || candidate.textContent || '');
        const aria = normalize(candidate.getAttribute('aria-label') || '');
        return labels.includes(text) || labels.includes(aria);
      });
      if (!(node instanceof HTMLElement)) return null;
      const rect = node.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    })()
  `;
}

function buildResult(status, view, hint = '') {
  return [{ Status: status, View: view, Hint: hint }];
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

async function openSettingsViaRawCdp(section) {
  const config = resolveRawCdpConfig();
  if (!config) return null;
  const alreadyInSettings = await rawEvaluate(config, hasSettingsShellScript);

  if (!alreadyInSettings) {
    const triggerCoords = await rawEvaluate(config, locateSettingsTriggerScript);
    if (!triggerCoords || !(await rawClick(config, triggerCoords))) {
      return buildResult('Failed', 'App', 'Could not find the sidebar Settings trigger.');
    }
    await sleep(150);

    const menuItemCoords = await rawEvaluate(config, locateSettingsMenuItemScript);
    if (!menuItemCoords || !(await rawClick(config, menuItemCoords))) {
      return buildResult('Failed', 'App', 'Could not find the Settings menu item after opening the account menu.');
    }
    await sleep(250);
  }

  if (!section) {
    return buildResult('Success', 'Settings', '');
  }

  const sectionCoords = await rawEvaluate(config, buildLocateSettingsSectionScript(section));
  if (!sectionCoords || !(await rawClick(config, sectionCoords))) {
    return buildResult('Partial', 'Settings', 'Settings opened, but the requested section was not found in the sidebar.');
  }
  await sleep(150);

  return buildResult(
    'Success',
    section,
    section.toLowerCase() === 'computer use'
      ? buildCodexComputerUseHint('Settings opened. Complete the remaining Computer Use permissions and approvals there.')
      : '',
  );
}

export const settingsCommand = cli({
  site: 'codex',
  name: 'settings',
  description: 'Open Codex settings, optionally jumping straight to a specific section such as computer-use',
  domain: 'localhost',
  strategy: Strategy.UI,
  browser: true,
  args: [
    {
      name: 'section',
      required: false,
      positional: true,
      help: 'Optional settings section, for example computer-use',
    },
  ],
  columns: ['Status', 'View', 'Hint'],
  func: async (page, kwargs) => {
    const section = String(kwargs.section || '').replace(/-/g, ' ').trim();
    const alreadyInSettings = await page.evaluate(hasSettingsShellScript);

    if (!alreadyInSettings) {
      const triggerCoords = await page.evaluate(locateSettingsTriggerScript);
      const openedMenu = await clickCoords(page, triggerCoords);
      if (!openedMenu) {
        return (await openSettingsViaRawCdp(section))
          || buildResult('Failed', 'App', 'Could not find the sidebar Settings trigger.');
      }
      await page.wait({ time: 1 });

      const menuItemCoords = await page.evaluate(locateSettingsMenuItemScript);
      const openedSettings = await clickCoords(page, menuItemCoords);
      if (!openedSettings) {
        return (await openSettingsViaRawCdp(section))
          || buildResult('Failed', 'App', 'Could not find the Settings menu item after opening the account menu.');
      }
      await page.wait({ time: 1 });
    }

    if (!section) {
      return buildResult('Success', 'Settings', '');
    }

    const sectionCoords = await page.evaluate(buildLocateSettingsSectionScript(section));
    const openedSection = await clickCoords(page, sectionCoords);
    await page.wait({ time: 1 });
    if (!openedSection) {
      return (await openSettingsViaRawCdp(section))
        || buildResult('Partial', 'Settings', 'Settings opened, but the requested section was not found in the sidebar.');
    }

    return buildResult(
      'Success',
      section,
      section.toLowerCase() === 'computer use'
        ? buildCodexComputerUseHint('Settings opened. Complete the remaining Computer Use permissions and approvals there.')
        : '',
    );
  },
});

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

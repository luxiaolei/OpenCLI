import { cli, Strategy } from '@jackwener/opencli/registry';
import { runCodexJob } from './run.js';
import { submitCodexJob } from './submit.js';

const AUTOMATIONS_DEEPLINK = 'codex://automations';
const SUPPORTED_ACTIONS = new Set(['open', 'list', 'inbox', 'create', 'edit', 'pause', 'resume', 'delete', 'run']);

function asBool(value) {
  return value === true || value === '' || String(value ?? '').toLowerCase() === 'true';
}

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeAction(value) {
  const action = clean(value || 'open').toLowerCase();
  return SUPPORTED_ACTIONS.has(action) ? action : '';
}

function optionalLine(label, value) {
  const text = clean(value);
  return text ? `- ${label}: ${text}` : '';
}

export function buildCodexAutomationsPrompt(kwargs = {}) {
  const action = normalizeAction(kwargs.action) || 'list';
  const text = clean(kwargs.text);
  const lines = [
    'You are managing Codex App Automations from inside the Codex desktop app.',
    'Use the documented Codex App Automations surface. If direct automation CRUD is unavailable, open the Automations pane and report the exact blocker instead of guessing.',
    '',
  ];

  if (action === 'list') {
    lines.push('List Codex App automations visible in the Automations pane. Include name, scope/project/thread, schedule, enabled/paused state, latest run state, and any triage inbox items if visible.');
  } else if (action === 'inbox') {
    lines.push('Open the Automations triage inbox and summarize pending automation run results. Include automation name, run time, status, and recommended next action.');
  } else if (action === 'create') {
    lines.push('Create a Codex App automation with these requirements:');
    lines.push(`- Task: ${text || '(missing task; ask for the task before creating anything)'}`);
    lines.push(optionalLine('Schedule', kwargs.schedule));
    lines.push(optionalLine('Project/path', kwargs.project));
    lines.push(optionalLine('Thread/context', kwargs.thread));
    lines.push(optionalLine('Model', kwargs.model));
    lines.push(optionalLine('Reasoning', kwargs.reasoning));
    lines.push(optionalLine('Notes', kwargs.notes));
    lines.push('Before finalizing, verify the automation summary in the UI. If the app asks for confirmation, stop and report the pending confirmation rather than clicking blindly.');
  } else if (['edit', 'pause', 'resume', 'delete', 'run'].includes(action)) {
    lines.push(`${action[0].toUpperCase()}${action.slice(1)} the matching Codex App automation.`);
    lines.push(`- Target: ${text || '(missing automation name/id/query; ask for the target before changing anything)'}`);
    lines.push(optionalLine('Schedule', kwargs.schedule));
    lines.push(optionalLine('Project/path', kwargs.project));
    lines.push(optionalLine('Thread/context', kwargs.thread));
    lines.push(optionalLine('Model', kwargs.model));
    lines.push(optionalLine('Reasoning', kwargs.reasoning));
    lines.push(optionalLine('Notes', kwargs.notes));
    if (action === 'delete') {
      lines.push('Deletion is destructive: stop at the final confirmation and report what would be deleted unless the user explicitly requested deletion in this prompt.');
    }
  } else {
    lines.push('Open the Automations pane and report what automation controls are visible.');
  }

  lines.push('', 'Return a concise structured result with: status, automation name(s), schedule, scope, latest run/triage state, and any blocker.');
  return lines.filter((line) => line !== '').join('\n');
}

function previewRows(action, prompt) {
  return [{
    Status: 'Preview',
    Action: action,
    View: 'Automations',
    Hint: `Prompt prepared. Re-run with --submit for submit/watch/result workflow, or --run to wait for completion. Prompt: ${prompt}`,
  }];
}

async function openAutomationsPane(page) {
  await page.goto(AUTOMATIONS_DEEPLINK, { waitUntil: 'load', settleMs: 1000 });
  if (typeof page.wait === 'function') {
    await page.wait({ time: 1 }).catch(() => undefined);
  }
  return [{
    Status: 'Success',
    Action: 'open',
    View: 'Automations',
    Hint: 'Opened codex://automations. Use action=list/create/inbox with --submit or --run for prompt-level management.',
  }];
}

export async function manageCodexAutomations(page, kwargs = {}, options = {}) {
  const action = normalizeAction(kwargs.action);
  if (!action) {
    return [{
      Status: 'Failed',
      Action: clean(kwargs.action),
      View: 'Automations',
      Hint: `Unsupported action. Use one of: ${Array.from(SUPPORTED_ACTIONS).join(', ')}.`,
    }];
  }

  const submit = asBool(kwargs.submit);
  const run = asBool(kwargs.run);
  if (action === 'open' && !submit && !run) {
    return openAutomationsPane(page);
  }

  const prompt = buildCodexAutomationsPrompt(kwargs);
  if (!submit && !run) {
    return previewRows(action, prompt);
  }

  const jobKwargs = {
    ...kwargs,
    text: prompt,
    new: kwargs.new === undefined ? true : asBool(kwargs.new),
    current: asBool(kwargs.current),
    browser: false,
    'computer-use': false,
  };

  if (run) {
    return runCodexJob(page, jobKwargs, options);
  }
  return submitCodexJob(page, jobKwargs, options);
}

export const automationsCommand = cli({
  site: 'codex',
  name: 'automations',
  description: 'Open or manage Codex App Automations through deeplink and conservative prompt-level workflows',
  domain: 'localhost',
  strategy: Strategy.UI,
  browser: true,
  navigateBefore: false,
  timeoutSeconds: 86400,
  args: [
    { name: 'action', required: false, positional: true, help: 'Action: open, list, inbox, create, edit, pause, resume, delete, or run', default: 'open' },
    { name: 'text', required: false, positional: true, help: 'Automation task, target name/id, or query depending on action' },
    { name: 'schedule', required: false, valueRequired: true, help: 'Schedule in natural language or cron form' },
    { name: 'project', required: false, valueRequired: true, help: 'Project name or absolute path for project automation scope' },
    { name: 'thread', required: false, valueRequired: true, help: 'Thread URL/id/name or context note for thread automations' },
    { name: 'model', required: false, valueRequired: true, help: 'Preferred model for the automation, e.g. gpt-5.4' },
    { name: 'reasoning', required: false, valueRequired: true, help: 'Preferred reasoning effort, e.g. low, medium, high' },
    { name: 'notes', required: false, valueRequired: true, help: 'Additional management instructions' },
    { name: 'submit', type: 'bool', required: false, default: false, help: 'Submit the generated automation-management prompt and return a job id' },
    { name: 'run', type: 'bool', required: false, default: false, help: 'Submit, watch, and return the automation-management result' },
    { name: 'new', type: 'bool', required: false, default: true, help: 'Use a new Codex thread for prompt-level management (default)' },
    { name: 'current', type: 'bool', required: false, default: false, help: 'Use the current Codex thread instead of a new one' },
    { name: 'timeout', type: 'int', required: false, default: 1800, help: 'Watch timeout seconds when --run is used' },
    { name: 'poll', type: 'int', required: false, default: 5, help: 'Watch poll interval seconds when --run is used' },
    { name: 'stable-polls', type: 'int', required: false, default: 3, help: 'Stable polls required before final when --run is used' },
  ],
  columns: ['Status', 'Action', 'View', 'Hint'],
  func: manageCodexAutomations,
});

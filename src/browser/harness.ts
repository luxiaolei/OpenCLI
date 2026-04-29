/**
 * Browser Harness bridge — experimental extensionless browser backend.
 *
 * Talks to browser-use/browser-harness over its local JSONL socket:
 *   Chrome -> CDP WS -> browser_harness.daemon -> /tmp/bu-<name>.sock -> OpenCLI
 *
 * Enable with:
 *   OPENCLI_BROWSER_BACKEND=browser-harness
 *   OPENCLI_BROWSER_HARNESS_NAME=opencli-eval   # or BU_NAME
 */

import { connect as netConnect, type Socket, type NetConnectOpts } from 'node:net';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { BrowserCookie, IPage, ScreenshotOptions } from '../types.js';
import type { IBrowserFactory } from '../runtime.js';
import { wrapForEval } from './utils.js';
import { generateStealthJs } from './stealth.js';
import { waitForDomStableJs } from './dom-helpers.js';
import { isRecord, saveBase64ToFile } from '../utils.js';
import { BasePage } from './base-page.js';

const DEFAULT_HARNESS_NAME = 'default';
const DEFAULT_TIMEOUT_MS = 30_000;
const INTERNAL_URL_PREFIXES = ['chrome://', 'chrome-extension://', 'devtools://'];

type HarnessResponse = { result?: unknown; error?: string; session_id?: string; page?: unknown };
export type HarnessEndpoint = { kind: 'unix'; path: string } | { kind: 'tcp'; host: string; port: number };


type HarnessTarget = {
  targetId?: string;
  type?: string;
  url?: string;
  title?: string;
};

export class BrowserHarnessBridge implements IBrowserFactory {
  private _name = harnessName();
  private _page: BrowserHarnessPage | null = null;

  async connect(opts?: { timeout?: number; workspace?: string; cdpEndpoint?: string }): Promise<IPage> {
    const timeoutMs = Math.max(1, opts?.timeout ?? 30) * 1000;
    const endpoint = harnessEndpoint(this._name);
    if (!harnessEndpointExists(endpoint)) {
      await ensureHarnessDaemon(this._name, timeoutMs);
    }

    const client = new BrowserHarnessClient(this._name, timeoutMs);
    try {
      await client.send('Target.getTargets');
    } catch (error) {
      const hint = harnessTroubleshootingHint(this._name);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Browser Harness backend could not connect (${harnessEndpointLabel(endpoint)}): ${message}. ${hint}`);
    }
    this._page = new BrowserHarnessPage(client);
    await this._page.ensureAttached();
    return this._page;
  }

  async close(): Promise<void> {
    this._page = null;
  }
}

class BrowserHarnessPage extends BasePage {
  private _sessionId: string | undefined;
  private _targetId: string | undefined;
  private _pageEnabled = false;
  private _pendingAttachTargetId: string | undefined;
  private _networkCapturing = false;
  private _networkCapturePattern = '';

  constructor(private readonly client: BrowserHarnessClient) {
    super();
  }

  async ensureAttached(): Promise<void> {
    const status = await this.client.meta('connection_status') as { session_id?: string; target_id?: string; page?: unknown };
    const page = isRecord(status.page) ? status.page : undefined;
    const pageTargetId = typeof page?.targetId === 'string' ? page.targetId : undefined;
    const pageUrl = typeof page?.url === 'string' ? page.url : undefined;
    const sessionId = typeof status.session_id === 'string' ? status.session_id : undefined;

    if (sessionId && pageTargetId) {
      this._sessionId = sessionId;
      this._targetId = pageTargetId;
      this._pendingAttachTargetId = undefined;
      if (pageUrl) this._lastUrl = pageUrl;
      await this.cdp('Page.enable').catch(() => undefined);
      await this.cdp('DOM.enable').catch(() => undefined);
      await this.cdp('Runtime.enable').catch(() => undefined);
      return;
    }

    this._sessionId = undefined;
    this._targetId = undefined;
    this._pendingAttachTargetId = undefined;
    this._pageEnabled = false;
    if (pageUrl) this._lastUrl = pageUrl;

    const targetId = pageTargetId ?? await this.ensurePageTarget();
    if (!targetId) throw new Error('No Browser Harness page target is available');
    await this.attachToTarget(targetId, false);
  }

  async goto(url: string, options?: { waitUntil?: 'load' | 'none'; settleMs?: number }): Promise<void> {
    await this.enablePage();
    await this.cdp('Page.navigate', { url });
    this._lastUrl = url;
    if (options?.waitUntil !== 'none') {
      const maxMs = options?.settleMs ?? 1000;
      await this.waitForReadyState(30_000).catch(() => undefined);
      await this.evaluate(`${generateStealthJs()};\n${waitForDomStableJs(maxMs, Math.min(500, maxMs))}`).catch(() => undefined);
    }
  }

  async evaluate(js: string): Promise<unknown> {
    const expression = wrapForEval(js);
    const result = await this.cdp('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    }) as { result?: { value?: unknown }; exceptionDetails?: { exception?: { description?: string }; text?: string } };
    if (result.exceptionDetails) {
      throw new Error('Evaluate error: ' + (result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Unknown exception'));
    }
    return result.result?.value;
  }

  async getCookies(opts: { domain?: string; url?: string } = {}): Promise<BrowserCookie[]> {
    const result = await this.cdp('Network.getCookies', opts.url ? { urls: [opts.url] } : {});
    const cookies = isRecord(result) && Array.isArray(result.cookies) ? result.cookies : [];
    const domain = opts.domain;
    const filtered = domain ? cookies.filter((cookie) => isCookie(cookie) && matchesCookieDomain(cookie.domain, domain)) : cookies.filter(isCookie);
    return filtered;
  }

  async screenshot(options: ScreenshotOptions = {}): Promise<string> {
    await this.enablePage();
    const result = await this.cdp('Page.captureScreenshot', {
      format: options.format ?? 'png',
      quality: options.format === 'jpeg' ? (options.quality ?? 80) : undefined,
      captureBeyondViewport: options.fullPage ?? false,
    });
    const base64 = isRecord(result) && typeof result.data === 'string' ? result.data : '';
    if (options.path) await saveBase64ToFile(base64, options.path);
    return base64;
  }

  async tabs(): Promise<unknown[]> {
    const result = await this.client.send('Target.getTargets') as { targetInfos?: HarnessTarget[] };
    return (result.targetInfos ?? [])
      .filter((target) => target.type === 'page')
      .map((target, index) => ({
        index,
        page: target.targetId,
        targetId: target.targetId,
        title: target.title ?? '',
        url: target.url ?? '',
        active: target.targetId === this._targetId,
      }));
  }

  async newTab(url: string = 'about:blank'): Promise<string | undefined> {
    const result = await this.client.send('Target.createTarget', { url: 'about:blank' }) as { targetId?: string };
    const targetId = result.targetId;
    if (targetId) {
      await this.selectTab(targetId);
      if (url !== 'about:blank') await this.goto(url);
    }
    return targetId;
  }

  async closeTab(target?: number | string): Promise<void> {
    const targetId = await this.resolveTargetId(target);
    if (!targetId) return;
    await this.client.send('Target.closeTarget', { targetId });
    if (targetId === this._targetId) {
      this._targetId = undefined;
      this._sessionId = undefined;
      await this.ensureAttached();
    }
  }

  async selectTab(target: number | string): Promise<void> {
    const targetId = await this.resolveTargetId(target);
    if (!targetId) throw new Error(`No browser-harness tab matches ${String(target)}`);
    await this.attachToTarget(targetId, true);
  }

  getActivePage(): string | undefined {
    return this._targetId;
  }

  setActivePage(page?: string): void {
    this._targetId = page;
    this._sessionId = undefined;
    this._pendingAttachTargetId = page;
    this._pageEnabled = false;
  }

  async cdp(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    if (!method.startsWith('Target.')) {
      await this.ensureTargetSession();
    }
    let response = await this.client.request(this.cdpPayload(method, params));
    if (response.error && !method.startsWith('Target.') && isMissingSessionError(response.error)) {
      await this.recoverTargetSession();
      response = await this.client.request(this.cdpPayload(method, params));
    }
    if (response.error) throw new Error(response.error);
    return response.result;
  }

  private cdpPayload(method: string, params: Record<string, unknown>): Record<string, unknown> {
    return {
      method,
      params,
      ...(method.startsWith('Target.') ? {} : (this._sessionId ? { session_id: this._sessionId } : {})),
    };
  }

  private async ensureTargetSession(): Promise<void> {
    if (!this._pendingAttachTargetId) return;
    await this.attachToTarget(this._pendingAttachTargetId, false);
  }

  private async recoverTargetSession(): Promise<void> {
    this._sessionId = undefined;
    this._targetId = undefined;
    this._pendingAttachTargetId = undefined;
    this._pageEnabled = false;
    const targetId = await this.ensurePageTarget();
    if (!targetId) throw new Error('No Browser Harness page target is available after session recovery');
    await this.attachToTarget(targetId, false);
  }

  private async attachToTarget(targetId: string, activate: boolean): Promise<void> {
    if (activate) await this.client.send('Target.activateTarget', { targetId });
    const attached = await this.client.send('Target.attachToTarget', { targetId, flatten: true }) as { sessionId?: string };
    if (!attached.sessionId) throw new Error(`Failed to attach to Browser Harness target ${targetId}`);
    this._targetId = targetId;
    this._sessionId = attached.sessionId;
    this._pendingAttachTargetId = undefined;
    await this.client.meta('set_session', { session_id: attached.sessionId, target_id: targetId });
    this._lastUrl = null;
    this._pageEnabled = false;
    await this.cdp('Page.enable').catch(() => undefined);
    await this.cdp('DOM.enable').catch(() => undefined);
    await this.cdp('Runtime.enable').catch(() => undefined);
  }

  async startNetworkCapture(pattern: string = ''): Promise<boolean> {
    this._networkCapturePattern = pattern;
    if (!this._networkCapturing) {
      await this.cdp('Network.enable');
      this._networkCapturing = true;
    }
    await this.client.meta('drain_events').catch(() => undefined);
    return true;
  }

  async readNetworkCapture(): Promise<unknown[]> {
    const response = await this.client.meta('drain_events') as { events?: Array<{ method?: string; params?: unknown }> };
    const events = response.events ?? [];
    const requests = new Map<string, { requestId: string; url?: string; method?: string; responseStatus?: number; responseContentType?: string }>();

    for (const event of events) {
      const params = isRecord(event.params) ? event.params : {};
      const requestId = typeof params.requestId === 'string' ? params.requestId : undefined;
      if (!requestId) continue;
      const current = requests.get(requestId) ?? { requestId };
      if (event.method === 'Network.requestWillBeSent') {
        const request = isRecord(params.request) ? params.request : {};
        if (typeof request.url === 'string') current.url = request.url;
        if (typeof request.method === 'string') current.method = request.method;
      }
      if (event.method === 'Network.responseReceived') {
        const responseInfo = isRecord(params.response) ? params.response : {};
        if (typeof responseInfo.url === 'string') current.url = responseInfo.url;
        if (typeof responseInfo.status === 'number') current.responseStatus = responseInfo.status;
        const headers = isRecord(responseInfo.headers) ? responseInfo.headers : {};
        const mimeType = responseInfo.mimeType ?? headers['content-type'] ?? headers['Content-Type'];
        if (typeof mimeType === 'string') current.responseContentType = mimeType;
      }
      requests.set(requestId, current);
    }

    const out: Array<Record<string, unknown>> = [];
    for (const request of requests.values()) {
      const haystack = JSON.stringify(request);
      if (this._networkCapturePattern && !haystack.includes(this._networkCapturePattern)) continue;
      const entry: Record<string, unknown> = {
        requestId: request.requestId,
        url: request.url ?? '',
        method: request.method ?? 'GET',
        responseStatus: request.responseStatus,
        responseContentType: request.responseContentType,
      };
      if (request.responseStatus !== undefined) {
        try {
          const bodyResult = await this.cdp('Network.getResponseBody', { requestId: request.requestId }) as { body?: string; base64Encoded?: boolean };
          const body = bodyResult.base64Encoded && bodyResult.body
            ? Buffer.from(bodyResult.body, 'base64').toString('utf8')
            : (bodyResult.body ?? '');
          entry.responsePreview = body.length > 1_048_576 ? body.slice(0, 1_048_576) : body;
          entry.responseBodyFullSize = body.length;
          entry.responseBodyTruncated = body.length > 1_048_576;
        } catch {
          // Bodies may be unavailable for cached, preflight, opaque, or failed requests.
        }
      }
      out.push(entry);
    }
    return out;
  }

  async consoleMessages(level: string = 'all'): Promise<unknown[]> {
    await this.cdp('Runtime.enable').catch(() => undefined);
    const response = await this.client.meta('drain_events') as { events?: Array<{ method?: string; params?: Record<string, unknown> }> };
    const messages = (response.events ?? [])
      .filter((event) => event.method === 'Runtime.consoleAPICalled' || event.method === 'Runtime.exceptionThrown')
      .map((event) => ({ type: event.method, ...event.params }));
    if (level === 'all') return messages;
    return messages.filter((msg) => JSON.stringify(msg).toLowerCase().includes(level.toLowerCase()));
  }

  async nativeClick(x: number, y: number): Promise<void> {
    await this.cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await this.cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }

  async nativeType(text: string): Promise<void> {
    await this.cdp('Input.insertText', { text });
  }

  async insertText(text: string): Promise<void> {
    await this.nativeType(text);
  }

  async nativeKeyPress(key: string, modifiers: string[] = []): Promise<void> {
    const modifierBits = modifiers.reduce((bits, modifier) => {
      const normalized = modifier.toLowerCase();
      if (normalized === 'alt' || normalized === 'option') return bits | 1;
      if (normalized === 'ctrl' || normalized === 'control') return bits | 2;
      if (normalized === 'meta' || normalized === 'cmd' || normalized === 'command') return bits | 4;
      if (normalized === 'shift') return bits | 8;
      return bits;
    }, 0);
    const keyCode = key.length === 1 ? key.toUpperCase().charCodeAt(0) : keyCodeFor(key);
    const base = { key, code: codeForKey(key), windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode, modifiers: modifierBits };
    await this.cdp('Input.dispatchKeyEvent', { type: 'keyDown', ...base, ...(key.length === 1 ? { text: key } : {}) });
    await this.cdp('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  }

  protected async tryNativeClick(x: number, y: number): Promise<boolean> {
    try {
      await this.nativeClick(x, y);
      return true;
    } catch {
      return false;
    }
  }

  private async enablePage(): Promise<void> {
    if (this._pageEnabled) return;
    await this.cdp('Page.enable');
    this._pageEnabled = true;
  }

  private async waitForReadyState(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await this.evaluate('document.readyState') === 'complete') return;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  private async ensurePageTarget(): Promise<string | undefined> {
    const existing = await this.firstAvailableTargetId();
    if (existing) return existing;
    const created = await this.client.send('Target.createTarget', { url: 'about:blank' }) as { targetId?: string };
    return created.targetId;
  }

  private async firstAvailableTargetId(): Promise<string | undefined> {
    const result = await this.client.send('Target.getTargets') as { targetInfos?: HarnessTarget[] };
    return (result.targetInfos ?? [])
      .filter((target) => target.type === 'page')
      .find((target) => !isInternalUrl(String(target.url ?? '')))?.targetId;
  }

  private async resolveTargetId(target?: number | string): Promise<string | undefined> {
    if (typeof target === 'string') return target;
    const tabs = await this.tabs() as Array<{ index: number; targetId?: string }>;
    if (typeof target === 'number') return tabs.find((tab) => tab.index === target)?.targetId;
    return this._targetId ?? tabs.find((tab) => !isInternalUrl(String((tab as { url?: string }).url ?? '')))?.targetId;
  }
}

export class BrowserHarnessClient {
  constructor(private readonly name = harnessName(), private readonly timeoutMs = DEFAULT_TIMEOUT_MS) {}

  async send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const response = await this.request({ method, params });
    if (response.error) throw new Error(response.error);
    return response.result;
  }

  async meta(meta: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const response = await this.request({ meta, ...params });
    if (response.error) throw new Error(response.error);
    return response;
  }

  request(payload: Record<string, unknown>): Promise<HarnessResponse> {
    return new Promise((resolve, reject) => {
      const socket = netConnect(harnessNetConnectOptions(this.name));
      let buffer = '';
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error(`Browser Harness request timed out after ${this.timeoutMs / 1000}s`));
      }, this.timeoutMs);

      const cleanup = () => clearTimeout(timer);
      socket.setEncoding('utf8');
      socket.on('connect', () => socket.write(`${JSON.stringify(payload)}\n`));
      socket.on('data', (chunk: string) => {
        buffer += chunk;
        const newline = buffer.indexOf('\n');
        if (newline === -1) return;
        const line = buffer.slice(0, newline);
        cleanup();
        socket.end();
        try {
          resolve(JSON.parse(line) as HarnessResponse);
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
      socket.on('error', (error: Error) => {
        cleanup();
        reject(error);
      });
      socket.on('end', () => {
        if (buffer.trim()) return;
        cleanup();
        reject(new Error('Browser Harness socket closed without a response'));
      });
    });
  }
}

export function harnessName(): string {
  return process.env.OPENCLI_BROWSER_HARNESS_NAME || process.env.BU_NAME || DEFAULT_HARNESS_NAME;
}

export function harnessSocketPath(name = harnessName()): string {
  if (process.env.OPENCLI_BROWSER_HARNESS_SOCKET) return process.env.OPENCLI_BROWSER_HARNESS_SOCKET;
  const tmpDir = process.env.BH_TMP_DIR || (process.platform === 'win32' ? os.tmpdir() : '/tmp');
  return process.env.BH_TMP_DIR
    ? path.join(tmpDir, 'bu.sock')
    : path.join(tmpDir, `bu-${name}.sock`);
}

export function harnessPortPath(name = harnessName()): string {
  const tmpDir = process.env.BH_TMP_DIR || os.tmpdir();
  return process.env.BH_TMP_DIR
    ? path.join(tmpDir, 'bu.port')
    : path.join(tmpDir, `bu-${name}.port`);
}

export function harnessEndpoint(name = harnessName()): HarnessEndpoint {
  if (process.env.OPENCLI_BROWSER_HARNESS_PORT) {
    return { kind: 'tcp', host: process.env.OPENCLI_BROWSER_HARNESS_HOST || '127.0.0.1', port: parseInt(process.env.OPENCLI_BROWSER_HARNESS_PORT, 10) };
  }
  if (process.platform === 'win32') {
    const raw = fs.existsSync(harnessPortPath(name)) ? fs.readFileSync(harnessPortPath(name), 'utf8').trim() : '';
    return { kind: 'tcp', host: '127.0.0.1', port: raw ? parseInt(raw, 10) : 0 };
  }
  return { kind: 'unix', path: harnessSocketPath(name) };
}

export async function ensureHarnessDaemon(name = harnessName(), timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
  if (!isHarnessAutoStartEnabled()) {
    throw new Error(`Browser Harness daemon is not running at ${harnessEndpointLabel(harnessEndpoint(name))}. ${harnessTroubleshootingHint(name)}`);
  }

  const candidates = harnessLaunchCandidates();
  const errors: string[] = [];
  for (const candidate of candidates) {
    const result = spawnSync(candidate.command, candidate.args, {
      env: { ...process.env, BU_NAME: name },
      encoding: 'utf8',
      timeout: timeoutMs,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (!result.error && result.status === 0 && harnessEndpointExists(harnessEndpoint(name))) return;
    const detail = result.error ? result.error.message : (result.stderr || result.stdout || `exit ${result.status}`);
    errors.push(`${candidate.command} ${candidate.args.join(' ')}: ${detail.trim()}`);
    if (result.error && (result.error as NodeJS.ErrnoException).code === 'ENOENT') continue;
  }

  throw new Error(
    `Browser Harness daemon did not start for BU_NAME=${name}. ${harnessTroubleshootingHint(name)} ` +
    `Attempts: ${errors.join(' | ')}`,
  );
}

function harnessLaunchCandidates(): Array<{ command: string; args: string[] }> {
  const configured = process.env.OPENCLI_BROWSER_HARNESS_COMMAND?.trim();
  if (configured) {
    const [command, ...args] = splitCommand(configured);
    return [{ command, args: [...args, '-c', 'pass'] }];
  }
  return [
    { command: 'browser-harness', args: ['-c', 'pass'] },
    { command: 'python3', args: ['-m', 'browser_harness.run', '-c', 'pass'] },
    { command: 'python', args: ['-m', 'browser_harness.run', '-c', 'pass'] },
  ];
}

function isHarnessAutoStartEnabled(): boolean {
  const raw = process.env.OPENCLI_BROWSER_HARNESS_AUTO_START?.trim().toLowerCase();
  return !(raw === '0' || raw === 'false' || raw === 'no' || raw === 'off');
}

function harnessEndpointExists(endpoint: HarnessEndpoint): boolean {
  if (endpoint.kind === 'unix') return fs.existsSync(endpoint.path);
  return Number.isInteger(endpoint.port) && endpoint.port > 0;
}

function harnessEndpointLabel(endpoint: HarnessEndpoint): string {
  return endpoint.kind === 'unix' ? endpoint.path : `${endpoint.host}:${endpoint.port || '(missing port)'}`;
}

function harnessNetConnectOptions(name: string): NetConnectOpts {
  const endpoint = harnessEndpoint(name);
  return endpoint.kind === 'unix' ? { path: endpoint.path } : { host: endpoint.host, port: endpoint.port };
}

function harnessTroubleshootingHint(name: string): string {
  return `Install/start Browser Harness (https://github.com/browser-use/browser-harness), run browser-harness --setup once if Chrome remote debugging is not enabled, or set OPENCLI_BROWSER_HARNESS_NAME/BU_NAME=${name}, OPENCLI_BROWSER_HARNESS_SOCKET, BU_CDP_WS/BU_CDP_URL as needed.`;
}

function splitCommand(command: string): string[] {
  const parts = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
  return parts.map((part) => part.replace(/^(["'])(.*)\1$/, '$2'));
}

function isCookie(value: unknown): value is BrowserCookie {
  return isRecord(value)
    && typeof value.name === 'string'
    && typeof value.value === 'string'
    && typeof value.domain === 'string';
}

function matchesCookieDomain(cookieDomain: string, targetDomain: string): boolean {
  const normalizedCookieDomain = cookieDomain.replace(/^\./, '').toLowerCase();
  const normalizedTargetDomain = targetDomain.replace(/^\./, '').toLowerCase();
  return normalizedTargetDomain === normalizedCookieDomain
    || normalizedTargetDomain.endsWith(`.${normalizedCookieDomain}`);
}

function isInternalUrl(url: string): boolean {
  return INTERNAL_URL_PREFIXES.some((prefix) => url.startsWith(prefix));
}

function isMissingSessionError(error: string): boolean {
  return /session .*not found|session with given id not found|cannot find session|no session/i.test(error);
}

function keyCodeFor(key: string): number {
  const table: Record<string, number> = {
    Enter: 13,
    Tab: 9,
    Backspace: 8,
    Escape: 27,
    Delete: 46,
    ArrowLeft: 37,
    ArrowUp: 38,
    ArrowRight: 39,
    ArrowDown: 40,
    Home: 36,
    End: 35,
    PageUp: 33,
    PageDown: 34,
  };
  return table[key] ?? 0;
}

function codeForKey(key: string): string {
  if (key.length === 1 && /[a-z]/i.test(key)) return `Key${key.toUpperCase()}`;
  if (key.length === 1 && /[0-9]/.test(key)) return `Digit${key}`;
  return key;
}

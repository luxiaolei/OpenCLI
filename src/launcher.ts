/**
 * Electron app launcher — auto-detect, confirm, launch, and connect.
 *
 * Flow:
 * 1. Probe CDP port → already running with debug? connect directly
 * 2. Detect process → running without CDP? prompt to restart
 * 3. Discover app path → not installed? error
 * 4. Launch with --remote-debugging-port
 * 5. Poll /json until ready
 */

import { execFileSync, spawn } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ElectronAppEntry } from './electron-apps.js';
import { getElectronApp } from './electron-apps.js';
import { confirmPrompt } from './tui.js';
import { CommandExecutionError } from './errors.js';
import { log } from './logger.js';

const POLL_INTERVAL_MS = 500;
const POLL_TIMEOUT_MS = 15_000;
const PROBE_TIMEOUT_MS = 2_000;
const KILL_GRACE_MS = 3_000;
const DEFAULT_CHROME_CDP_PORT = 9222;
const DEFAULT_CHROME_PROFILE_DIRECTORY = 'Default';
const CHROME_CDP_GUIDANCE_SUPPRESS_VALUES = new Set(['0', 'false', 'no', 'off']);
let chromeCDPGuidanceWarned = false;

/**
 * Probe whether a CDP endpoint is listening on the given port.
 * Returns true if http://127.0.0.1:{port}/json responds successfully.
 */
export function probeCDP(port: number, timeoutMs: number = PROBE_TIMEOUT_MS): Promise<boolean> {
  return new Promise((resolve) => {
    const req = httpRequest(
      { hostname: '127.0.0.1', port, path: '/json', method: 'GET', timeout: timeoutMs },
      (res) => {
        res.resume();
        resolve(res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300);
      },
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

export type ResolveChromeEndpointOptions = {
  /** Chrome remote-debugging port. Defaults to OPENCLI_CHROME_CDP_PORT or 9222. */
  port?: number;
  /** Chrome profile directory inside the default Chrome user data dir. Defaults to Default. */
  profileDirectory?: string;
  /** First URL to open when launching Chrome. Defaults to about:blank. */
  url?: string;
  /** If false, only probe the port and never launch Chrome. */
  launch?: boolean;
};

export type ResolveChromeEndpointDeps = {
  probeChromeCDP?: (port: number) => Promise<boolean>;
  probeAnyCDP?: (port: number) => Promise<boolean>;
  createChromeTarget?: (port: number, url?: string) => Promise<string | undefined>;
  discoverChromeExecutable?: () => string | null;
  launchChrome?: (executable: string, args: string[]) => Promise<void> | void;
  pollForReady?: (port: number) => Promise<void> | void;
};

function parseChromeCDPPort(): number {
  const raw = process.env.OPENCLI_CHROME_CDP_PORT;
  if (!raw) return DEFAULT_CHROME_CDP_PORT;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CHROME_CDP_PORT;
}

function isAutoChromeCDPDisabled(): boolean {
  const raw = process.env.OPENCLI_AUTO_CHROME_CDP;
  return raw !== undefined && ['0', 'false', 'no', 'off'].includes(raw.trim().toLowerCase());
}

function isChromeCDPGuidanceSuppressed(): boolean {
  const raw = process.env.OPENCLI_CHROME_CDP_GUIDANCE;
  return raw !== undefined && CHROME_CDP_GUIDANCE_SUPPRESS_VALUES.has(raw.trim().toLowerCase());
}

function quoteArg(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function chromeExecutableHint(executable?: string | null): string {
  if (executable) return quoteArg(executable);
  if (process.platform === 'darwin') return quoteArg('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  if (process.platform === 'win32') return 'chrome.exe';
  return 'google-chrome';
}

function warnChromeCDPUnavailable(reason: string, port: number, executable?: string | null): void {
  if (chromeCDPGuidanceWarned || isChromeCDPGuidanceSuppressed()) return;
  chromeCDPGuidanceWarned = true;
  const endpoint = `http://127.0.0.1:${port}`;
  const profileDir = path.join(os.homedir(), '.opencli', 'chrome-cdp-profile');
  log.warn(
    `Chrome CDP auto-connect is unavailable (${reason}); falling back to Browser Bridge.\n` +
    '  If Browser Bridge is not installed/connected, start Chrome with a dedicated local CDP profile:\n' +
    `    ${chromeExecutableHint(executable)} --user-data-dir=${quoteArg(profileDir)} --remote-debugging-port=${port} --no-first-run --no-default-browser-check\n` +
    `  Then run: OPENCLI_CDP_ENDPOINT=${endpoint} opencli ...\n` +
    '  Keep the debug port local-only (127.0.0.1/localhost); do not expose it publicly.\n' +
    '  Suppress this guidance with OPENCLI_CHROME_CDP_GUIDANCE=0.',
  );
}

export function buildChromeLaunchArgs(opts: ResolveChromeEndpointOptions = {}): string[] {
  const port = opts.port ?? parseChromeCDPPort();
  const profileDirectory = opts.profileDirectory?.trim() || process.env.OPENCLI_CHROME_PROFILE || DEFAULT_CHROME_PROFILE_DIRECTORY;
  return [
    `--remote-debugging-port=${port}`,
    `--profile-directory=${profileDirectory}`,
    '--no-first-run',
    '--no-default-browser-check',
    opts.url?.trim() || 'about:blank',
  ];
}

export function discoverChromeExecutable(): string | null {
  const explicit = process.env.OPENCLI_CHROME_PATH?.trim() || process.env.CHROME_PATH?.trim();
  if (explicit) return explicit;

  if (process.platform === 'darwin') {
    const candidates = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      path.join(os.homedir(), 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'),
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      path.join(os.homedir(), 'Applications', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
    ];
    return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
  }

  if (process.platform === 'linux') {
    const candidates = [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
    ];
    return candidates.find((candidate) => fs.existsSync(candidate)) ?? 'google-chrome';
  }

  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA;
    const programFiles = process.env.PROGRAMFILES;
    const programFilesX86 = process.env['PROGRAMFILES(X86)'];
    const candidates = [
      localAppData && path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      programFiles && path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      programFilesX86 && path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ].filter((candidate): candidate is string => Boolean(candidate));
    return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
  }

  return null;
}

export async function launchChromeWithDebugPort(executable: string, args: string[]): Promise<void> {
  await launchDetachedApp(executable, args, 'Google Chrome');
}

export function isChromeCDPVersionPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const record = payload as Record<string, unknown>;
  const browser = typeof record.Browser === 'string' ? record.Browser : '';
  const userAgent = typeof record['User-Agent'] === 'string' ? record['User-Agent'] : '';
  const combined = `${browser} ${userAgent}`;
  if (/electron/i.test(combined)) return false;
  return /(chrome|chromium)\//i.test(combined);
}

export async function probeChromeCDP(port: number): Promise<boolean> {
  try {
    const payload = await fetchCDPVersion(port);
    return isChromeCDPVersionPayload(payload);
  } catch {
    return false;
  }
}

type ChromeCDPTargetPayload = {
  webSocketDebuggerUrl?: string;
};

export async function createChromeTarget(port: number, url: string = 'about:blank'): Promise<string | undefined> {
  try {
    const target = await requestChromeJson(port, `/json/new?${encodeURIComponent(url)}`, 'PUT') as ChromeCDPTargetPayload;
    return typeof target?.webSocketDebuggerUrl === 'string' ? target.webSocketDebuggerUrl : undefined;
  } catch (err) {
    log.debug(`[launcher] Failed to create Chrome CDP target on ${port}: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
  }
}

function fetchCDPVersion(port: number, timeoutMs: number = PROBE_TIMEOUT_MS): Promise<unknown> {
  return requestChromeJson(port, '/json/version', 'GET', timeoutMs);
}

function requestChromeJson(port: number, requestPath: string, method: 'GET' | 'PUT', timeoutMs: number = PROBE_TIMEOUT_MS): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { hostname: '127.0.0.1', port, path: requestPath, method, timeout: timeoutMs },
      (res) => {
        const statusCode = res.statusCode ?? 0;
        if (statusCode < 200 || statusCode >= 300) {
          res.resume();
          reject(new Error(`HTTP ${statusCode}`));
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on('end', () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error(`Timed out requesting Chrome CDP ${requestPath}`)));
    req.end();
  });
}

async function pollForChromeReady(port: number): Promise<void> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await probeChromeCDP(port)) return;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new CommandExecutionError(
    `Chrome launched but CDP not available on port ${port} after ${POLL_TIMEOUT_MS / 1000}s`,
    'Chrome may already be running without the debug port. Quit Chrome and rerun, or set OPENCLI_CDP_ENDPOINT to an existing debug endpoint.',
  );
}

/**
 * Resolve the default Chrome CDP endpoint for web commands.
 *
 * Priority:
 * 1. reuse an already-listening Chrome CDP port
 * 2. launch Google Chrome/Chromium with remote debugging enabled
 *
 * The launch intentionally does not pass --user-data-dir. Chrome therefore uses
 * the user's normal logged-in Chrome profile instead of an isolated temp profile.
 */
export async function resolveChromeEndpoint(
  opts: ResolveChromeEndpointOptions = {},
  deps: ResolveChromeEndpointDeps = {},
): Promise<string | undefined> {
  if (isAutoChromeCDPDisabled()) return undefined;

  const port = opts.port ?? parseChromeCDPPort();
  const probe = deps.probeChromeCDP ?? probeChromeCDP;
  const probeAny = deps.probeAnyCDP ?? probeCDP;
  const createTarget = deps.createChromeTarget ?? createChromeTarget;
  if (await probe(port)) return createTarget(port, opts.url);

  // If some non-Chrome CDP endpoint already occupies the port (for example an
  // Electron app), do not launch Chrome on top of it. Fall back to BrowserBridge.
  if (await probeAny(port)) {
    warnChromeCDPUnavailable(`port ${port} is occupied by a non-Chrome CDP endpoint`, port);
    return undefined;
  }

  if (opts.launch === false) return undefined;

  const discover = deps.discoverChromeExecutable ?? discoverChromeExecutable;
  const executable = discover();
  if (!executable) {
    warnChromeCDPUnavailable('Chrome executable was not found', port);
    return undefined;
  }

  const args = buildChromeLaunchArgs({ ...opts, port });
  try {
    await (deps.launchChrome ?? launchChromeWithDebugPort)(executable, args);
    await (deps.pollForReady ?? pollForChromeReady)(port);
    return createTarget(port, opts.url);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.debug(`[launcher] Chrome CDP auto-launch unavailable on ${port}: ${message}`);
    warnChromeCDPUnavailable(message, port, executable);
    return undefined;
  }
}

/**
 * Check if a process with the given name is running.
 * Uses pgrep on macOS/Linux.
 */
export function detectProcess(processName: string): boolean {
  if (process.platform === 'win32') return false; // pgrep not available on Windows
  try {
    execFileSync('pgrep', ['-x', processName], { encoding: 'utf-8', stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Kill a process by name. Sends SIGTERM first, then SIGKILL after grace period.
 */
export function killProcess(processName: string): void {
  if (process.platform === 'win32') return; // pkill not available on Windows
  try {
    execFileSync('pkill', ['-x', processName], { stdio: 'pipe' });
  } catch {
    // Process may have already exited
  }

  const deadline = Date.now() + KILL_GRACE_MS;
  while (Date.now() < deadline) {
    if (!detectProcess(processName)) return;
    execFileSync('sleep', ['0.2'], { stdio: 'pipe' });
  }

  try {
    execFileSync('pkill', ['-9', '-x', processName], { stdio: 'pipe' });
  } catch {
    // Ignore
  }
}

/**
 * Discover the app installation path on macOS.
 * Uses osascript to resolve the app name to a POSIX path.
 * Returns null if the app is not installed.
 */
export function discoverAppPath(displayName: string): string | null {
  if (process.platform !== 'darwin') {
    return null;
  }

  try {
    const result = execFileSync('osascript', [
      '-e', `POSIX path of (path to application "${displayName}")`,
    ], { encoding: 'utf-8', stdio: 'pipe', timeout: 5_000 });
    return result.trim().replace(/\/$/, '');
  } catch {
    const candidates = [
      `/Applications/${displayName}.app`,
      path.join(process.env.HOME ?? '', 'Applications', `${displayName}.app`),
    ].filter(Boolean);
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate.replace(/\/$/, '');
      }
    }
    return null;
  }
}

function resolveExecutable(appPath: string, processName: string): string {
  return `${appPath}/Contents/MacOS/${processName}`;
}

function isMissingExecutableError(err: unknown, label: string): boolean {
  return err instanceof CommandExecutionError
    && err.message.startsWith(`Could not launch ${label}: executable not found at `);
}

export function resolveExecutableCandidates(appPath: string, app: ElectronAppEntry): string[] {
  const executableNames = app.executableNames?.length ? app.executableNames : [app.processName];
  return [...new Set(executableNames)].map((name) => resolveExecutable(appPath, name));
}

export async function launchDetachedApp(executable: string, args: string[], label: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, {
      detached: true,
      stdio: 'ignore',
    });

    const onError = (err: NodeJS.ErrnoException): void => {
      if (err.code === 'ENOENT') {
        reject(new CommandExecutionError(
          `Could not launch ${label}: executable not found at ${executable}`,
          `Install ${label}, reinstall it, or register a custom app path in ~/.opencli/apps.yaml`,
        ));
        return;
      }

      reject(new CommandExecutionError(
        `Failed to launch ${label}`,
        err.message,
      ));
    };

    child.once('error', onError);
    child.once('spawn', () => {
      child.off('error', onError);
      child.unref();
      resolve();
    });
  });
}

export async function launchElectronApp(appPath: string, app: ElectronAppEntry, args: string[], label: string): Promise<void> {
  const executables = resolveExecutableCandidates(appPath, app);
  let lastMissingExecutableError: CommandExecutionError | undefined;

  for (const executable of executables) {
    log.debug(`[launcher] Launching: ${executable} ${args.join(' ')}`);
    try {
      await launchDetachedApp(executable, args, label);
      return;
    } catch (err) {
      if (isMissingExecutableError(err, label)) {
        lastMissingExecutableError = err as CommandExecutionError;
        continue;
      }
      throw err;
    }
  }

  if (executables.length > 1) {
    throw new CommandExecutionError(
      `Could not launch ${label}: no compatible executable found in ${path.join(appPath, 'Contents', 'MacOS')}`,
      `Tried: ${executables.map((executable) => path.basename(executable)).join(', ')}. Install ${label}, reinstall it, or register a custom app path in ~/.opencli/apps.yaml`,
    );
  }

  throw lastMissingExecutableError ?? new CommandExecutionError(
    `Could not launch ${label}`,
    `Install ${label}, reinstall it, or register a custom app path in ~/.opencli/apps.yaml`,
  );
}

async function pollForReady(port: number): Promise<void> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await probeCDP(port, 1_000)) return;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new CommandExecutionError(
    `App launched but CDP not available on port ${port} after ${POLL_TIMEOUT_MS / 1000}s`,
    'The app may be slow to start. Try running the command again.',
  );
}

/**
 * Main entry point: resolve an Electron app to a CDP endpoint URL.
 *
 * Returns the endpoint URL: http://127.0.0.1:{port}
 */
export async function resolveElectronEndpoint(site: string): Promise<string> {
  const app = getElectronApp(site);
  if (!app) {
    throw new CommandExecutionError(
      `No Electron app registered for site "${site}"`,
      'Register the app in ~/.opencli/apps.yaml or check the site name.',
    );
  }

  const { port, processName, displayName } = app;
  const label = displayName ?? processName;
  const endpoint = `http://127.0.0.1:${port}`;

  // Step 1: Already running with CDP?
  log.debug(`[launcher] Probing CDP on port ${port}...`);
  if (await probeCDP(port)) {
    log.debug(`[launcher] CDP already available on port ${port}`);
    return endpoint;
  }

  // Step 2: Running without CDP? (process detection requires Unix tools)
  if (process.platform !== 'darwin' && process.platform !== 'linux') {
    throw new CommandExecutionError(
      `${label} is not reachable on CDP port ${port}.`,
      `Auto-launch is not yet supported on ${process.platform}.\n` +
      `Start ${label} manually with --remote-debugging-port=${port}, then either:\n` +
      `  • Set OPENCLI_CDP_ENDPOINT=http://127.0.0.1:${port}\n` +
      `  • Or just re-run the command once ${label} is listening on port ${port}.`,
    );
  }

  const isRunning = detectProcess(processName);
  if (isRunning) {
    log.debug(`[launcher] ${label} is running but CDP not available`);
    const confirmed = await confirmPrompt(
      `${label} is running but CDP is not enabled. Restart with debug port?`,
      true,
    );
    if (!confirmed) {
      throw new CommandExecutionError(
        `${label} needs to be restarted with CDP enabled.`,
        `Manually restart: kill the app and relaunch with --remote-debugging-port=${port}`,
      );
    }
    process.stderr.write(`  Restarting ${label}...\n`);
    killProcess(processName);
  }

  // Step 3: Discover path
  const appPath = discoverAppPath(label);
  if (!appPath) {
    throw new CommandExecutionError(
      `Could not find ${label} on this machine.`,
      `Install ${label} or register a custom path in ~/.opencli/apps.yaml`,
    );
  }

  // Step 4: Launch
  const args = [`--remote-debugging-port=${port}`, ...(app.extraArgs ?? [])];
  await launchElectronApp(appPath, app, args, label);

  // Step 5: Poll for readiness
  process.stderr.write(`  Waiting for ${label} on port ${port}...\n`);
  await pollForReady(port);
  process.stderr.write(`  Connected to ${label} on port ${port}.\n`);

  return endpoint;
}

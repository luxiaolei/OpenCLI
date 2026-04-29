import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:net';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { BrowserHarnessBridge, harnessEndpoint, harnessName, harnessSocketPath } from './harness.js';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

type RequestRecord = Record<string, unknown>;

async function withFakeHarness<T>(
  handler: (req: RequestRecord) => Record<string, unknown>,
  fn: (ctx: { endpoint: string; requests: RequestRecord[] }) => Promise<T>,
): Promise<T> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencli-harness-test-'));
  const requests: RequestRecord[] = [];
  const server: Server = createServer((socket) => {
    let buffer = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      const newline = buffer.indexOf('\n');
      if (newline === -1) return;
      const line = buffer.slice(0, newline);
      const req = JSON.parse(line) as RequestRecord;
      requests.push(req);
      socket.write(`${JSON.stringify(handler(req))}\n`);
      socket.end();
    });
  });
  if (process.platform === 'win32') {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP address for fake Browser Harness');
    process.env.OPENCLI_BROWSER_HARNESS_HOST = '127.0.0.1';
    process.env.OPENCLI_BROWSER_HARNESS_PORT = String(address.port);
    try {
      return await fn({ endpoint: `127.0.0.1:${address.port}`, requests });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  const socketPath = path.join(dir, 'bu-test.sock');
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, resolve);
  });
  try {
    process.env.OPENCLI_BROWSER_HARNESS_SOCKET = socketPath;
    return await fn({ endpoint: socketPath, requests });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('Browser Harness bridge', () => {
  it('resolves socket path from BU_NAME and BH_TMP_DIR like browser-harness', () => {
    process.env.BU_NAME = 'agent_1';
    expect(harnessName()).toBe('agent_1');
    const defaultSocketPath = process.platform === 'win32'
      ? path.join(os.tmpdir(), 'bu-agent_1.sock')
      : '/tmp/bu-agent_1.sock';
    expect(harnessSocketPath()).toBe(defaultSocketPath);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencli-harness-dir-'));
    process.env.BH_TMP_DIR = dir;
    expect(harnessSocketPath('ignored')).toBe(path.join(dir, 'bu.sock'));
    if (process.platform === 'win32') {
      expect(harnessEndpoint('ignored')).toMatchObject({ kind: 'tcp', host: '127.0.0.1', port: 0 });
    } else {
      expect(harnessEndpoint('ignored')).toMatchObject({ kind: 'unix', path: path.join(dir, 'bu.sock') });
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('fails with setup guidance when auto-start is disabled and no daemon endpoint exists', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencli-harness-missing-'));
    process.env.OPENCLI_BROWSER_HARNESS_SOCKET = path.join(dir, 'missing.sock');
    process.env.OPENCLI_BROWSER_HARNESS_AUTO_START = '0';

    const bridge = new BrowserHarnessBridge();
    await expect(bridge.connect({ timeout: 1 })).rejects.toThrow(/Browser Harness daemon is not running/);
    await expect(bridge.connect({ timeout: 1 })).rejects.toThrow(/browser-harness --setup/);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('connects, lists tabs, selects tabs, evaluates, and exposes browser tab ids as page ids', async () => {
    await withFakeHarness((req) => {
      if (req.meta === 'connection_status') {
        return { target_id: 'target-1', session_id: 'session-1', page: { targetId: 'target-1', url: 'https://one.example', title: 'One' } };
      }
      if (req.method === 'Target.getTargets') {
        return { result: { targetInfos: [
          { type: 'page', targetId: 'target-1', url: 'https://one.example', title: 'One' },
          { type: 'page', targetId: 'target-2', url: 'https://two.example', title: 'Two' },
        ] } };
      }
      if (req.method === 'Target.activateTarget') return { result: {} };
      if (req.method === 'Target.attachToTarget') return { result: { sessionId: 'session-2' } };
      if (req.meta === 'set_session') return { session_id: req.session_id };
      if (req.method === 'Runtime.evaluate') return { result: { result: { value: 2 } } };
      return { result: {} };
    }, async ({ requests }) => {
      const bridge = new BrowserHarnessBridge();
      const page = await bridge.connect({ timeout: 1 });

      expect(await page.tabs()).toEqual([
        expect.objectContaining({ index: 0, page: 'target-1', targetId: 'target-1', active: true }),
        expect.objectContaining({ index: 1, page: 'target-2', targetId: 'target-2', active: false }),
      ]);
      await page.selectTab('target-2');
      expect(page.getActivePage?.()).toBe('target-2');
      expect(await page.evaluate('1 + 1')).toBe(2);
      expect(requests).toEqual(expect.arrayContaining([
        expect.objectContaining({ method: 'Target.attachToTarget', params: expect.objectContaining({ targetId: 'target-2' }) }),
        expect.objectContaining({ meta: 'set_session', session_id: 'session-2', target_id: 'target-2' }),
        expect.objectContaining({ method: 'Runtime.evaluate', session_id: 'session-2' }),
      ]));
    });
  });

  it('lazily attaches when setActivePage is used by generic browser targeting', async () => {
    await withFakeHarness((req) => {
      if (req.meta === 'connection_status') {
        return { target_id: 'target-1', session_id: 'session-1', page: { targetId: 'target-1', url: 'https://one.example', title: 'One' } };
      }
      if (req.method === 'Target.getTargets') {
        return { result: { targetInfos: [
          { type: 'page', targetId: 'target-1', url: 'https://one.example', title: 'One' },
          { type: 'page', targetId: 'target-2', url: 'https://two.example', title: 'Two' },
        ] } };
      }
      if (req.method === 'Target.attachToTarget') return { result: { sessionId: 'session-2' } };
      if (req.meta === 'set_session') return { session_id: req.session_id };
      if (req.method === 'Runtime.evaluate') return { result: { result: { value: req.session_id } } };
      return { result: {} };
    }, async ({ requests }) => {
      const bridge = new BrowserHarnessBridge();
      const page = await bridge.connect({ timeout: 1 });

      page.setActivePage?.('target-2');
      expect(page.getActivePage?.()).toBe('target-2');
      expect(await page.evaluate('document.title')).toBe('session-2');
      expect(requests).toEqual(expect.arrayContaining([
        expect.objectContaining({ method: 'Target.attachToTarget', params: expect.objectContaining({ targetId: 'target-2' }) }),
        expect.objectContaining({ meta: 'set_session', session_id: 'session-2', target_id: 'target-2' }),
        expect.objectContaining({ method: 'Runtime.evaluate', session_id: 'session-2' }),
      ]));
    });
  });

  it('reattaches to an available page when the active target closes but connection_status is stale', async () => {
    let statusCalls = 0;
    await withFakeHarness((req) => {
      if (req.meta === 'connection_status') {
        statusCalls += 1;
        if (statusCalls === 1) {
          return { target_id: 'target-1', session_id: 'session-1', page: { targetId: 'target-1', url: 'https://one.example', title: 'One' } };
        }
        return { target_id: 'target-1', session_id: 'session-1', page: null };
      }
      if (req.method === 'Target.closeTarget') return { result: {} };
      if (req.method === 'Target.getTargets') {
        return { result: { targetInfos: [
          { type: 'page', targetId: 'target-2', url: 'https://two.example', title: 'Two' },
        ] } };
      }
      if (req.method === 'Target.attachToTarget') return { result: { sessionId: 'session-2' } };
      if (req.meta === 'set_session') return { session_id: req.session_id };
      if (req.method === 'Runtime.evaluate') return { result: { result: { value: req.session_id } } };
      return { result: {} };
    }, async ({ requests }) => {
      const bridge = new BrowserHarnessBridge();
      const page = await bridge.connect({ timeout: 1 });

      await page.closeTab?.('target-1');
      expect(page.getActivePage?.()).toBe('target-2');
      expect(await page.evaluate('document.title')).toBe('session-2');
      expect(requests).toEqual(expect.arrayContaining([
        expect.objectContaining({ method: 'Target.closeTarget', params: expect.objectContaining({ targetId: 'target-1' }) }),
        expect.objectContaining({ method: 'Target.attachToTarget', params: expect.objectContaining({ targetId: 'target-2' }) }),
        expect.objectContaining({ meta: 'set_session', session_id: 'session-2', target_id: 'target-2' }),
        expect.objectContaining({ method: 'Runtime.evaluate', session_id: 'session-2' }),
      ]));
    });
  });

  it('normalizes Network.* events into OpenCLI network capture entries', async () => {
    await withFakeHarness((req) => {
      if (req.meta === 'connection_status') return { target_id: 'target-1', session_id: 'session-1', page: { targetId: 'target-1', url: 'https://one.example' } };
      if (req.method === 'Target.getTargets') return { result: { targetInfos: [{ type: 'page', targetId: 'target-1', url: 'https://one.example' }] } };
      if (req.meta === 'drain_events') {
        return { events: [
          { method: 'Network.requestWillBeSent', params: { requestId: 'r1', request: { url: 'https://api.example/data', method: 'POST' } } },
          { method: 'Network.responseReceived', params: { requestId: 'r1', response: { url: 'https://api.example/data', status: 200, mimeType: 'application/json' } } },
        ] };
      }
      if (req.method === 'Network.getResponseBody') return { result: { body: '{"ok":true}', base64Encoded: false } };
      return { result: {} };
    }, async () => {
      const bridge = new BrowserHarnessBridge();
      const page = await bridge.connect({ timeout: 1 });
      await page.startNetworkCapture?.('api.example');
      expect(await page.readNetworkCapture?.()).toEqual([
        expect.objectContaining({
          url: 'https://api.example/data',
          method: 'POST',
          responseStatus: 200,
          responseContentType: 'application/json',
          responsePreview: '{"ok":true}',
          responseBodyFullSize: 11,
          responseBodyTruncated: false,
        }),
      ]);
    });
  });
});

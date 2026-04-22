import * as os from 'node:os';
import * as path from 'node:path';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { imageCreateCommand } from './image-create.js';
import { imageDownloadCommand } from './image-download.js';
import { pollChatGPTImageDownloads } from './image-auto-download.js';

const CHATGPT_DOMAIN = 'chatgpt.com';
const DEFAULT_TIMEOUT = '30';
const DEFAULT_LINK = `https://${CHATGPT_DOMAIN}/images/`;

function normalizeBooleanFlag(value) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}

function resolveChatGPTLink(value) {
  const raw = String(value ?? '').trim();
  return raw || DEFAULT_LINK;
}

function buildLegacyImageRow(status, link) {
  return [{ status, file: '📁 -', link: `🔗 ${resolveChatGPTLink(link)}` }];
}

function mapCreateStatusToLegacyStatus(status) {
  const normalized = String(status ?? '').trim().toLowerCase();
  if (normalized === 'result_visible') return '🎨 generated';
  if (normalized === 'submitted') return '⏳ submitted';
  if (normalized === 'blocked') return '⚠️ blocked';
  return '⚠️ failed';
}

export const imageCommand = cli({
  site: 'chatgpt',
  name: 'image',
  description: 'Generate images with the ChatGPT /images workbench and optionally save all visible results locally',
  domain: CHATGPT_DOMAIN,
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  defaultFormat: 'plain',
  timeoutSeconds: 240,
  args: [
    { name: 'prompt', positional: true, required: true, help: 'Image prompt to send to ChatGPT' },
    { name: 'op', default: path.join(os.homedir(), 'Pictures', 'chatgpt'), help: 'Output directory' },
    { name: 'timeout', default: DEFAULT_TIMEOUT, help: 'Max seconds to keep polling the generated thread for downloadable images before falling back to the ChatGPT link' },
    { name: 'sd', type: 'boolean', default: false, help: 'Skip download shorthand; only show ChatGPT link' },
  ],
  columns: ['status', 'file', 'link'],
  func: async (page, kwargs) => {
    const prompt = String(kwargs.prompt ?? '').trim();
    const outputDir = kwargs.op || path.join(os.homedir(), 'Pictures', 'chatgpt');
    const timeout = String(kwargs.timeout ?? DEFAULT_TIMEOUT).trim() || DEFAULT_TIMEOUT;
    const skipDownloadRaw = kwargs.sd;
    const skipDownload = skipDownloadRaw === '' || skipDownloadRaw === true || normalizeBooleanFlag(skipDownloadRaw);

    const createRows = await imageCreateCommand.func(page, { prompt, timeout });
    const createRow = Array.isArray(createRows) ? (createRows[0] || {}) : {};
    const createStatus = String(createRow?.status ?? '').trim().toLowerCase();
    const pageUrl = resolveChatGPTLink(createRow?.page_url);

    if (createStatus === 'blocked' || createStatus === 'failed') {
      return buildLegacyImageRow(mapCreateStatusToLegacyStatus(createStatus), pageUrl);
    }

    if (skipDownload) {
      return buildLegacyImageRow(mapCreateStatusToLegacyStatus(createStatus), pageUrl);
    }

    const downloadRows = await pollChatGPTImageDownloads(page, {
      url: pageUrl,
      op: outputDir,
      timeout,
      downloader: imageDownloadCommand.func,
      all: true,
    });
    const firstDownloadRow = Array.isArray(downloadRows) ? downloadRows[0] : null;
    if (firstDownloadRow?.status === '⚠️ no-images') {
      return buildLegacyImageRow(mapCreateStatusToLegacyStatus(createStatus), pageUrl);
    }
    return downloadRows;
  },
});

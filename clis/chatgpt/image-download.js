import * as os from 'node:os';
import * as path from 'node:path';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { saveBase64ToFile } from '@jackwener/opencli/utils';
import {
  CHATGPT_WEB_DOMAIN,
  getChatGPTImageAssets,
  getChatGPTVisibleImageUrls,
  openChatGPTConversation,
  parseChatGPTPositiveInt,
  waitForChatGPTImages,
} from './utils.js';

function extFromMime(mime) {
  if (mime.includes('png')) return '.png';
  if (mime.includes('webp')) return '.webp';
  if (mime.includes('gif')) return '.gif';
  return '.jpg';
}

function displayPath(filePath) {
  const home = os.homedir();
  return filePath.startsWith(home) ? `~${filePath.slice(home.length)}` : filePath;
}

function expandHomePath(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (raw === '~') return os.homedir();
  if (raw.startsWith('~/')) return path.join(os.homedir(), raw.slice(2));
  return raw;
}

function normalizeBooleanFlag(value) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}

function normalizeStringList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? '').trim()).filter(Boolean);
  }
  const raw = String(value ?? '').trim();
  if (!raw) return [];
  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map((item) => String(item ?? '').trim()).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return raw.split(',').map((item) => item.trim()).filter(Boolean);
}

async function currentChatGPTLink(page) {
  const url = await page.evaluate('window.location.href').catch(() => '');
  return typeof url === 'string' && url ? url : 'https://chatgpt.com';
}

export const imageDownloadCommand = cli({
  site: 'chatgpt',
  name: 'image-download',
  description: 'Download one or all visible ChatGPT images from the current page or a specific conversation URL',
  domain: CHATGPT_WEB_DOMAIN,
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  defaultFormat: 'plain',
  timeoutSeconds: 180,
  args: [
    { name: 'url', required: false, help: 'Optional ChatGPT conversation URL containing the image to download' },
    { name: 'image', required: false, help: '1-based visible image index to download (default: 1)', default: '1' },
    { name: 'all', type: 'boolean', required: false, help: 'Download all visible images instead of only the selected index', default: false },
    { name: 'op', required: false, help: 'Output directory', default: '~/Pictures/chatgpt' },
    { name: 'timeout', required: false, help: 'Seconds to wait for a visible image before failing (default: 30)', default: '30' },
  ],
  columns: ['status', 'file', 'link'],
  func: async (page, kwargs) => {
    const targetUrl = String(kwargs.url || '').trim();
    const imageIndex = parseChatGPTPositiveInt(kwargs.image, 1);
    const downloadAllRaw = kwargs.all;
    const downloadAll = downloadAllRaw === '' || downloadAllRaw === true || normalizeBooleanFlag(downloadAllRaw);
    const outputDir = expandHomePath(String(kwargs.op || '~/Pictures/chatgpt')).trim();
    const timeout = parseChatGPTPositiveInt(kwargs.timeout, 30);
    const beforeUrls = normalizeStringList(kwargs.before_urls);
    const beforeUrlSet = new Set(beforeUrls);

    if (targetUrl) {
      await openChatGPTConversation(page, targetUrl);
    }

    let urls = (await getChatGPTVisibleImageUrls(page)).filter((url) => !beforeUrlSet.has(url));
    if (!urls.length) {
      urls = await waitForChatGPTImages(page, beforeUrls, timeout);
    }

    const link = await currentChatGPTLink(page);
    if (!urls.length) {
      return [{ status: '⚠️ no-images', file: '📁 -', link: `🔗 ${link}` }];
    }

    const selectedUrls = downloadAll ? urls : [urls[imageIndex - 1]].filter(Boolean);
    if (!selectedUrls.length) {
      return [{ status: `⚠️ image-${imageIndex}-unavailable`, file: '📁 -', link: `🔗 ${link}` }];
    }

    const assets = await getChatGPTImageAssets(page, selectedUrls);
    if (!assets.length) {
      return [{ status: '⚠️ export-failed', file: '📁 -', link: `🔗 ${link}` }];
    }

    const stamp = Date.now();
    const results = [];
    for (let index = 0; index < assets.length; index += 1) {
      const asset = assets[index];
      const base64 = asset.dataUrl.replace(/^data:[^;]+;base64,/, '');
      const ext = extFromMime(asset.mimeType);
      const suffix = assets.length > 1 ? `_${index + 1}` : '';
      const filePath = path.join(outputDir, `chatgpt_${stamp}${suffix}${ext}`);
      await saveBase64ToFile(base64, filePath);
      results.push({ status: '✅ saved', file: `📁 ${displayPath(filePath)}`, link: `🔗 ${link}` });
    }
    return results;
  },
});

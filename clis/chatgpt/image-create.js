import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { cli, Strategy } from '@jackwener/opencli/registry';
import {
  buildChatGPTImageCreateRow,
  CHATGPT_WEB_DOMAIN,
  enterChatGPTImageComposer,
  getChatGPTConversationList,
  getChatGPTVisibleImageUrls,
  hasChatGPTImageContext,
  openChatGPTConversation,
  parseChatGPTConversationUrl,
  parseChatGPTPositiveInt,
  parseChatGPTTitleMatchMode,
  readChatGPTImageCapabilities,
  readChatGPTImageCreateState,
  renameChatGPTConversation,
  resolveChatGPTConversationForQuery,
  selectChatGPTImageAspect,
  selectChatGPTImageMode,
  sendChatGPTImagePrompt,
  uploadChatGPTImageReference,
  waitForChatGPTImageCreateState,
} from './utils.js';

const CHATGPT_IMAGE_UPLOAD_MIME_BY_EXT = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.avif', 'image/avif'],
]);

function expandHomePath(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (raw === '~') return os.homedir();
  if (raw.startsWith('~/')) return path.join(os.homedir(), raw.slice(2));
  return raw;
}

function inferImageMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return CHATGPT_IMAGE_UPLOAD_MIME_BY_EXT.get(ext) || 'application/octet-stream';
}

async function readChatGPTImageReferenceFile(filePath) {
  const resolvedPath = path.resolve(expandHomePath(filePath));
  const stat = await fs.stat(resolvedPath);
  if (!stat.isFile()) {
    throw new Error(`Reference image path is not a file: ${resolvedPath}`);
  }
  const mimeType = inferImageMimeType(resolvedPath);
  if (!mimeType.startsWith('image/')) {
    throw new Error(`Reference file must be an image with extension png, jpg, jpeg, webp, gif, or avif: ${resolvedPath}`);
  }
  const buffer = await fs.readFile(resolvedPath);
  return {
    path: resolvedPath,
    name: path.basename(resolvedPath),
    mimeType,
    size: buffer.byteLength,
    base64: buffer.toString('base64'),
  };
}

function describeAspectFailure(aspect, result) {
  const available = Array.isArray(result?.availableLabels) && result.availableLabels.length > 0
    ? ` Available: ${result.availableLabels.join(', ')}`
    : '';
  return result?.reason === 'aspect-option-not-found'
    ? `No image aspect / size option matched: ${aspect}.${available}`
    : `ChatGPT image aspect / size selector was not ready for: ${aspect}.${available}`;
}

export const imageCreateCommand = cli({
  site: 'chatgpt',
  name: 'image-create',
  description: 'Create an image from the ChatGPT /images workbench and return a conservative submission/result state',
  domain: CHATGPT_WEB_DOMAIN,
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  defaultFormat: 'plain',
  timeoutSeconds: 180,
  args: [
    { name: 'prompt', required: true, positional: true, help: 'Prompt to send into the ChatGPT /images workbench' },
    { name: 'history', required: false, help: 'Optional ChatGPT conversation URL or title query to continue an existing image thread' },
    { name: 'match', required: false, help: 'Title match mode for --history: contains or exact', default: 'contains' },
    { name: 'title', required: false, help: 'Optional title to apply to the resulting ChatGPT conversation after submission' },
    { name: 'thinking', required: false, help: 'Optional visible label from the ChatGPT model / thinking selector to choose before sending the prompt' },
    { name: 'file', required: false, help: 'Optional local reference image path to upload before sending the prompt (image-to-image)' },
    { name: 'aspect', required: false, help: 'Optional ChatGPT image aspect ratio / size label, for example 1:1, 16:9, 9:16, square, portrait, or landscape' },
    { name: 'size', required: false, help: 'Alias for --aspect' },
    { name: 'timeout', required: false, help: 'Max seconds to wait for a visible result signal before falling back to submitted (default: 30)', default: '30' },
  ],
  columns: ['action', 'status', 'page_url', 'conversation_id', 'mode_label'],
  func: async (page, kwargs) => {
    const prompt = String(kwargs.prompt ?? '').trim();
    const history = String(kwargs.history ?? '').trim();
    const title = String(kwargs.title ?? '').trim();
    const thinking = String(kwargs.thinking ?? '').trim();
    const file = String(kwargs.file ?? '').trim();
    const aspect = String(kwargs.aspect ?? kwargs.size ?? '').trim();
    const timeout = parseChatGPTPositiveInt(kwargs.timeout, 30);
    const match = parseChatGPTTitleMatchMode(kwargs.match, 'contains');
    if (!match) {
      return [buildChatGPTImageCreateRow({}, {
        status: 'failed',
        reason: 'invalid-match-mode',
        detail: 'Invalid match mode. Use contains or exact.',
      })];
    }

    let baselineSnapshot;
    let beforeVisibleImageUrls = [];

    if (history) {
      let targetHistoryUrl = '';
      const directUrl = parseChatGPTConversationUrl(history);
      if (directUrl) {
        targetHistoryUrl = directUrl;
        await openChatGPTConversation(page, directUrl);
      } else {
        const conversations = await getChatGPTConversationList(page);
        const picked = resolveChatGPTConversationForQuery(conversations, history, match);
        if (!picked?.Url) {
          return [buildChatGPTImageCreateRow({}, {
            status: 'blocked',
            reason: 'history-not-found',
            detail: `No image history matched: ${history}`,
          })];
        }
        targetHistoryUrl = picked.Url;
        await openChatGPTConversation(page, picked.Url);
      }
      const historyState = await readChatGPTImageCreateState(page);
      if (!historyState.isConversationPage || historyState.resultActions.length === 0) {
        return [buildChatGPTImageCreateRow({
          ...historyState,
          pageUrl: historyState.pageUrl || targetHistoryUrl,
        }, {
          status: 'blocked',
          reason: 'history-not-image-thread',
          detail: 'The selected history target is not an image conversation.',
        })];
      }
      baselineSnapshot = historyState;
      beforeVisibleImageUrls = await getChatGPTVisibleImageUrls(page).catch(() => []);
    }

    const entry = await enterChatGPTImageComposer(page);
    if (!entry?.ok) {
      const available = Array.isArray(entry?.availableLabels) && entry.availableLabels.length > 0
        ? ` Available: ${entry.availableLabels.join(', ')}`
        : '';
      return [buildChatGPTImageCreateRow({
        pageUrl: entry?.pageUrl || '',
        pageTitle: entry?.pagePath || '',
      }, {
        status: 'blocked',
        reason: 'image-entry-unavailable',
        detail: `${entry?.reason || 'ChatGPT image entry was not available.'}.${available}`,
      })];
    }

    const preflight = await readChatGPTImageCapabilities(page);

    if (!hasChatGPTImageContext(preflight)) {
      return [buildChatGPTImageCreateRow(preflight, {
        status: 'blocked',
        reason: preflight.isSignedIn === false ? 'not-signed-in' : 'no-image-context',
        detail: preflight.detail,
      })];
    }

    if (aspect) {
      const aspectResult = await selectChatGPTImageAspect(page, aspect);
      if (!aspectResult?.ok) {
        return [buildChatGPTImageCreateRow(preflight, {
          status: 'blocked',
          reason: 'aspect-unavailable',
          detail: describeAspectFailure(aspect, aspectResult),
        })];
      }
    }

    if (file) {
      let referenceImage;
      try {
        referenceImage = await readChatGPTImageReferenceFile(file);
      } catch (error) {
        return [buildChatGPTImageCreateRow(preflight, {
          status: 'blocked',
          reason: 'file-unavailable',
          detail: error instanceof Error ? error.message : String(error),
        })];
      }
      const uploadResult = await uploadChatGPTImageReference(page, referenceImage);
      if (!uploadResult?.ok) {
        return [buildChatGPTImageCreateRow(preflight, {
          status: 'blocked',
          reason: 'upload-unavailable',
          detail: uploadResult?.reason || 'ChatGPT image upload input was not ready.',
        })];
      }
    }

    let modeResult = { ok: true, skipped: true, selectedLabel: '', currentLabel: '', availableLabels: [] };
    if (thinking) {
      modeResult = await selectChatGPTImageMode(page, thinking);
      if (!modeResult?.ok) {
        const available = Array.isArray(modeResult.availableLabels) && modeResult.availableLabels.length > 0
          ? ` Available: ${modeResult.availableLabels.join(', ')}`
          : '';
        const detail = modeResult.reason === 'mode-option-not-found'
          ? `No model / thinking option matched: ${thinking}.${available}`
          : `ChatGPT model / thinking selector was not ready for: ${thinking}.${available}`;
        return [buildChatGPTImageCreateRow({
          ...preflight,
          modeLabel: modeResult.currentLabel || preflight.modelSelectorLabel || '',
        }, {
          status: 'blocked',
          reason: 'thinking-unavailable',
          detail,
          modeLabel: modeResult.currentLabel || preflight.modelSelectorLabel || '',
        })];
      }
    }

    if (!baselineSnapshot) {
      const currentSnapshot = await readChatGPTImageCreateState(page).catch(() => null);
      if (currentSnapshot?.isConversationPage && Array.isArray(currentSnapshot.resultActions) && currentSnapshot.resultActions.length > 0) {
        baselineSnapshot = currentSnapshot;
        beforeVisibleImageUrls = await getChatGPTVisibleImageUrls(page).catch(() => []);
      }
    }

    const sendResult = await sendChatGPTImagePrompt(page, prompt);
    if (!sendResult?.ok) {
      return [buildChatGPTImageCreateRow(preflight, {
        status: 'failed',
        reason: 'send-unavailable',
        detail: sendResult?.reason || 'send-failed',
      })];
    }

    const finalSnapshot = await waitForChatGPTImageCreateState(page, timeout, baselineSnapshot);
    const finalModeLabel = modeResult.selectedLabel || finalSnapshot?.modeLabel || modeResult.currentLabel || preflight.modelSelectorLabel || '';
    if (title && finalSnapshot?.pageUrl) {
      await renameChatGPTConversation(page, finalSnapshot.pageUrl, title);
    }
    return [buildChatGPTImageCreateRow({
      ...finalSnapshot,
      modeLabel: finalModeLabel,
    }, {
      modeLabel: finalModeLabel,
      beforeUrls: beforeVisibleImageUrls,
    })];
  },
});

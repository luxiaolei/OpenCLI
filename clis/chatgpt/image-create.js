import { cli, Strategy } from '@jackwener/opencli/registry';
import {
  buildChatGPTImageCreateRow,
  CHATGPT_WEB_DOMAIN,
  getChatGPTConversationList,
  hasChatGPTImageContext,
  openChatGPTConversation,
  openChatGPTImages,
  parseChatGPTConversationUrl,
  parseChatGPTPositiveInt,
  parseChatGPTTitleMatchMode,
  readChatGPTImageCapabilities,
  readChatGPTImageCreateState,
  renameChatGPTConversation,
  resolveChatGPTConversationForQuery,
  selectChatGPTImageMode,
  sendChatGPTImagePrompt,
  waitForChatGPTImageCreateState,
} from './utils.js';

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
    { name: 'timeout', required: false, help: 'Max seconds to wait for a visible result signal before falling back to submitted (default: 30)', default: '30' },
  ],
  columns: ['action', 'status', 'page_url', 'conversation_id', 'mode_label'],
  func: async (page, kwargs) => {
    const prompt = String(kwargs.prompt ?? '').trim();
    const history = String(kwargs.history ?? '').trim();
    const title = String(kwargs.title ?? '').trim();
    const thinking = String(kwargs.thinking ?? '').trim();
    const timeout = parseChatGPTPositiveInt(kwargs.timeout, 30);
    const match = parseChatGPTTitleMatchMode(kwargs.match, 'contains');
    if (!match) {
      return [buildChatGPTImageCreateRow({}, {
        status: 'failed',
        reason: 'invalid-match-mode',
        detail: 'Invalid match mode. Use contains or exact.',
      })];
    }

    await openChatGPTImages(page);
    const preflight = await readChatGPTImageCapabilities(page);

    if (!preflight.isImagesPage) {
      return [buildChatGPTImageCreateRow(preflight, {
        status: 'blocked',
        reason: 'not-images-page',
        detail: preflight.detail,
      })];
    }

    if (!hasChatGPTImageContext(preflight)) {
      return [buildChatGPTImageCreateRow(preflight, {
        status: 'blocked',
        reason: 'no-image-context',
      })];
    }

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
          return [buildChatGPTImageCreateRow(preflight, {
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

    const sendResult = await sendChatGPTImagePrompt(page, prompt);
    if (!sendResult?.ok) {
      return [buildChatGPTImageCreateRow(preflight, {
        status: 'failed',
        reason: 'send-unavailable',
        detail: sendResult?.reason || 'send-failed',
      })];
    }

    const finalSnapshot = await waitForChatGPTImageCreateState(page, timeout);
    const finalModeLabel = modeResult.selectedLabel || finalSnapshot?.modeLabel || modeResult.currentLabel || preflight.modelSelectorLabel || '';
    if (title && finalSnapshot?.pageUrl) {
      await renameChatGPTConversation(page, finalSnapshot.pageUrl, title);
    }
    return [buildChatGPTImageCreateRow({
      ...finalSnapshot,
      modeLabel: finalModeLabel,
    }, {
      modeLabel: finalModeLabel,
    })];
  },
});

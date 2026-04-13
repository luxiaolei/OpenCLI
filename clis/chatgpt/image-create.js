import { cli, Strategy } from '@jackwener/opencli/registry';
import {
  buildChatGPTImageCreateRow,
  CHATGPT_WEB_DOMAIN,
  hasChatGPTImageContext,
  openChatGPTImages,
  parseChatGPTPositiveInt,
  readChatGPTImageCapabilities,
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
    { name: 'timeout', required: false, help: 'Max seconds to wait for a visible result signal before falling back to submitted (default: 30)', default: '30' },
  ],
  columns: ['action', 'status', 'page_url', 'conversation_id'],
  func: async (page, kwargs) => {
    const prompt = String(kwargs.prompt ?? '').trim();
    const timeout = parseChatGPTPositiveInt(kwargs.timeout, 30);

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

    const sendResult = await sendChatGPTImagePrompt(page, prompt);
    if (!sendResult?.ok) {
      return [buildChatGPTImageCreateRow(preflight, {
        status: 'failed',
        reason: 'send-unavailable',
        detail: sendResult?.reason || 'send-failed',
      })];
    }

    const finalSnapshot = await waitForChatGPTImageCreateState(page, timeout);
    return [buildChatGPTImageCreateRow(finalSnapshot)];
  },
});

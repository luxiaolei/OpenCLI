import { cli, Strategy } from '@jackwener/opencli/registry';
import {
  buildChatGPTDeepResearchRow,
  CHATGPT_WEB_DOMAIN,
  openChatGPTDeepResearch,
  parseChatGPTPositiveInt,
  readChatGPTDeepResearchSnapshot,
  sendChatGPTDeepResearchPrompt,
  waitForChatGPTDeepResearchState,
} from './utils.js';

export const deepResearchCommand = cli({
  site: 'chatgpt',
  name: 'deep-research',
  description: 'Start a ChatGPT Deep Research thread and return a conservative submitted/pending/retry state',
  domain: CHATGPT_WEB_DOMAIN,
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  defaultFormat: 'plain',
  timeoutSeconds: 180,
  args: [
    { name: 'prompt', required: true, positional: true, help: 'Prompt to send into ChatGPT Deep Research' },
    { name: 'timeout', required: false, help: 'Max seconds to wait for retry-required before falling back to submitted/pending (default: 30)', default: '30' },
  ],
  columns: ['ui_state', 'conversation_url', 'conversation_id', 'thread_title', 'mode_label'],
  func: async (page, kwargs) => {
    const prompt = String(kwargs.prompt ?? '').trim();
    const timeout = parseChatGPTPositiveInt(kwargs.timeout, 30);
    await openChatGPTDeepResearch(page);
    const initialSnapshot = await readChatGPTDeepResearchSnapshot(page);
    if (initialSnapshot.isSignedIn === false) {
      return [buildChatGPTDeepResearchRow(initialSnapshot)];
    }
    const sendResult = await sendChatGPTDeepResearchPrompt(page, prompt);
    if (!sendResult?.ok) {
      const snapshotAfterFailure = await readChatGPTDeepResearchSnapshot(page);
      return [buildChatGPTDeepResearchRow(snapshotAfterFailure, { detail: sendResult?.reason || 'send-failed' })];
    }
    const finalSnapshot = await waitForChatGPTDeepResearchState(page, timeout);
    const mergedSnapshot = {
      ...finalSnapshot,
      modeLabel: finalSnapshot.modeLabel || initialSnapshot.modeLabel,
    };
    return [buildChatGPTDeepResearchRow(mergedSnapshot)];
  },
});

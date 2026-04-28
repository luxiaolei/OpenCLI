import { cli, Strategy } from '@jackwener/opencli/registry';
import {
  buildChatGPTAgentRow,
  CHATGPT_WEB_DOMAIN,
  openChatGPTAgent,
  parseChatGPTPositiveInt,
  readChatGPTAgentSnapshot,
  sendChatGPTAgentPrompt,
  waitForChatGPTAgentState,
} from './utils.js';

export const agentCommand = cli({
  site: 'chatgpt',
  name: 'agent',
  description: 'Start a ChatGPT Agent Mode task and return a conservative submitted/running/waiting state',
  domain: CHATGPT_WEB_DOMAIN,
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  defaultFormat: 'plain',
  timeoutSeconds: 180,
  args: [
    { name: 'prompt', required: true, positional: true, help: 'Task prompt to send into ChatGPT Agent Mode' },
    { name: 'timeout', required: false, help: 'Max seconds to wait for an agent state before falling back to submitted (default: 30)', default: '30' },
  ],
  columns: ['ui_state', 'conversation_url', 'conversation_id', 'thread_title', 'mode_label'],
  func: async (page, kwargs) => {
    const prompt = String(kwargs.prompt ?? '').trim();
    const timeout = parseChatGPTPositiveInt(kwargs.timeout, 30);
    await openChatGPTAgent(page);
    const initialSnapshot = await readChatGPTAgentSnapshot(page);
    if (initialSnapshot.isSignedIn === false) {
      return [buildChatGPTAgentRow(initialSnapshot)];
    }

    const sendResult = await sendChatGPTAgentPrompt(page, prompt);
    if (!sendResult?.ok) {
      const snapshotAfterFailure = await readChatGPTAgentSnapshot(page);
      return [buildChatGPTAgentRow(snapshotAfterFailure, { detail: sendResult?.reason || 'send-failed' })];
    }

    const finalSnapshot = await waitForChatGPTAgentState(page, timeout);
    const mergedSnapshot = {
      ...finalSnapshot,
      modeLabel: finalSnapshot.modeLabel || initialSnapshot.modeLabel || 'Agent mode',
    };
    return [buildChatGPTAgentRow(mergedSnapshot)];
  },
});

import { cli, Strategy } from '@jackwener/opencli/registry';
import {
  buildChatGPTDeepResearchRow,
  CHATGPT_WEB_DOMAIN,
  getChatGPTConversationList,
  openChatGPTConversation,
  openChatGPTDeepResearch,
  parseChatGPTConversationUrl,
  parseChatGPTTitleMatchMode,
  readChatGPTDeepResearchSnapshot,
  resolveChatGPTConversationForQuery,
} from './utils.js';

export const deepResearchStatusCommand = cli({
  site: 'chatgpt',
  name: 'deep-research-status',
  description: 'Classify the visible UI state of a ChatGPT Deep Research thread',
  domain: CHATGPT_WEB_DOMAIN,
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  defaultFormat: 'plain',
  timeoutSeconds: 180,
  args: [
    { name: 'query', required: false, positional: true, help: 'Conversation URL, title query, or empty for latest/current' },
    { name: 'match', required: false, help: 'Title match mode: contains or exact', default: 'contains' },
  ],
  columns: ['ui_state', 'conversation_url', 'conversation_id', 'thread_title', 'mode_label'],
  func: async (page, kwargs) => {
    const query = String(kwargs.query ?? '').trim();
    const match = parseChatGPTTitleMatchMode(kwargs.match, 'contains');
    if (!match) {
      return [buildChatGPTDeepResearchRow({}, { detail: 'Invalid match mode. Use contains or exact.' })];
    }

    const directUrl = parseChatGPTConversationUrl(query);
    if (directUrl) {
      await openChatGPTConversation(page, directUrl);
      const snapshot = await readChatGPTDeepResearchSnapshot(page);
      return [buildChatGPTDeepResearchRow(snapshot)];
    }

    await openChatGPTDeepResearch(page);
    const landingSnapshot = await readChatGPTDeepResearchSnapshot(page);
    if (landingSnapshot.isSignedIn === false) {
      return [buildChatGPTDeepResearchRow(landingSnapshot)];
    }
    if (!query) {
      return [buildChatGPTDeepResearchRow(landingSnapshot)];
    }

    const conversations = await getChatGPTConversationList(page);
    const picked = resolveChatGPTConversationForQuery(conversations, query, match);
    if (picked?.Url) {
      await openChatGPTConversation(page, picked.Url);
      const snapshot = await readChatGPTDeepResearchSnapshot(page);
      return [buildChatGPTDeepResearchRow(snapshot)];
    }

    return [buildChatGPTDeepResearchRow(landingSnapshot, { detail: `No conversation matched: ${query}` })];
  },
});

import { cli, Strategy } from '@jackwener/opencli/registry';
import {
  buildChatGPTHistoryRow,
  CHATGPT_WEB_DOMAIN,
  getChatGPTConversationList,
  openChatGPTConversation,
  openChatGPTImages,
  parseChatGPTConversationUrl,
  parseChatGPTTitleMatchMode,
  readChatGPTConversationSnapshot,
  resolveChatGPTConversationForQuery,
} from './utils.js';

export const historyOpenCommand = cli({
  site: 'chatgpt',
  name: 'history-open',
  description: 'Open a ChatGPT conversation by URL or title query',
  domain: CHATGPT_WEB_DOMAIN,
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  defaultFormat: 'plain',
  timeoutSeconds: 180,
  args: [
    { name: 'query', required: false, positional: true, help: 'Conversation URL, title query, or empty for latest visible history item' },
    { name: 'match', required: false, help: 'Title match mode: contains or exact', default: 'contains' },
  ],
  columns: ['action', 'status', 'title', 'url', 'conversation_id'],
  func: async (page, kwargs) => {
    const query = String(kwargs.query ?? '').trim();
    const match = parseChatGPTTitleMatchMode(kwargs.match, 'contains');
    if (!match) {
      return [buildChatGPTHistoryRow({}, {
        action: 'open',
        status: 'failed',
        detail: 'Invalid match mode. Use contains or exact.',
      })];
    }

    const openAndReadConversation = async (targetUrl, fallbackTitle = '') => {
      await openChatGPTConversation(page, targetUrl);
      const snapshot = await readChatGPTConversationSnapshot(page);
      const onConversationPage = String(snapshot?.pathname ?? '').startsWith('/c/') && String(snapshot?.conversationId ?? '').trim();
      if (!onConversationPage) {
        return [buildChatGPTHistoryRow({}, {
          action: 'open',
          status: 'failed',
          title: fallbackTitle,
          url: targetUrl,
          detail: `Did not land on the requested ChatGPT conversation: ${String(snapshot?.url ?? '').trim() || targetUrl}`,
        })];
      }
      return [buildChatGPTHistoryRow(snapshot, {
        action: 'open',
        status: 'opened',
        title: fallbackTitle || snapshot.threadTitle,
        url: targetUrl,
      })];
    };

    const directUrl = parseChatGPTConversationUrl(query);
    if (directUrl) {
      return openAndReadConversation(directUrl);
    }

    await openChatGPTImages(page);
    const conversations = await getChatGPTConversationList(page);
    const picked = query
      ? resolveChatGPTConversationForQuery(conversations, query, match)
      : (conversations[0] || null);
    if (!picked?.Url) {
      return [buildChatGPTHistoryRow({}, {
        action: 'open',
        status: 'not_found',
        detail: query ? `No conversation matched: ${query}` : 'No visible ChatGPT history items were found.',
      })];
    }

    return openAndReadConversation(picked.Url, String(picked.Title ?? '').trim());
  },
});

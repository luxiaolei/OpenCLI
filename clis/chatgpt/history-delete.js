import { cli, Strategy } from '@jackwener/opencli/registry';
import {
  buildChatGPTHistoryRow,
  CHATGPT_WEB_DOMAIN,
  deleteChatGPTConversation,
  getChatGPTConversationList,
  openChatGPTImages,
  parseChatGPTConversationUrl,
  parseChatGPTTitleMatchMode,
  resolveChatGPTConversationForQuery,
} from './utils.js';

export const historyDeleteCommand = cli({
  site: 'chatgpt',
  name: 'history-delete',
  description: 'Delete a ChatGPT conversation chosen by URL or title query',
  domain: CHATGPT_WEB_DOMAIN,
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  defaultFormat: 'plain',
  timeoutSeconds: 180,
  args: [
    { name: 'query', required: true, positional: true, help: 'Conversation URL or title query to delete' },
    { name: 'match', required: false, help: 'Title match mode: contains or exact', default: 'contains' },
  ],
  columns: ['action', 'status', 'title', 'url', 'conversation_id'],
  func: async (page, kwargs) => {
    const query = String(kwargs.query ?? '').trim();
    const match = parseChatGPTTitleMatchMode(kwargs.match, 'contains');
    if (!match) {
      return [buildChatGPTHistoryRow({}, {
        action: 'delete',
        status: 'failed',
        detail: 'Invalid match mode. Use contains or exact.',
      })];
    }

    let targetUrl = parseChatGPTConversationUrl(query);
    let pickedTitle = '';
    if (!targetUrl) {
      await openChatGPTImages(page);
      const conversations = await getChatGPTConversationList(page);
      const picked = resolveChatGPTConversationForQuery(conversations, query, match);
      if (!picked?.Url) {
        return [buildChatGPTHistoryRow({}, {
          action: 'delete',
          status: 'not_found',
          detail: `No conversation matched: ${query}`,
        })];
      }
      targetUrl = picked.Url;
      pickedTitle = String(picked.Title ?? '').trim();
    }

    const result = await deleteChatGPTConversation(page, targetUrl);
    return [buildChatGPTHistoryRow(result, {
      action: 'delete',
      status: result?.ok ? 'deleted' : 'failed',
      title: pickedTitle || result?.threadTitle || '',
      url: targetUrl,
      detail: result?.ok ? '' : (result?.reason || 'delete-failed'),
    })];
  },
});

import { cli, Strategy } from '@jackwener/opencli/registry';
import {
  buildChatGPTHistoryRow,
  CHATGPT_WEB_DOMAIN,
  getChatGPTConversationList,
  openChatGPTImages,
  parseChatGPTConversationUrl,
  parseChatGPTTitleMatchMode,
  renameChatGPTConversation,
  resolveChatGPTConversationForQuery,
} from './utils.js';

export const historyRenameCommand = cli({
  site: 'chatgpt',
  name: 'history-rename',
  description: 'Rename a ChatGPT conversation chosen by URL or title query',
  domain: CHATGPT_WEB_DOMAIN,
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  defaultFormat: 'plain',
  timeoutSeconds: 180,
  args: [
    { name: 'query', required: true, positional: true, help: 'Conversation URL or title query to rename' },
    { name: 'title', required: true, positional: true, help: 'New title to apply to the selected conversation' },
    { name: 'match', required: false, help: 'Title match mode: contains or exact', default: 'contains' },
  ],
  columns: ['action', 'status', 'title', 'url', 'conversation_id'],
  func: async (page, kwargs) => {
    const query = String(kwargs.query ?? '').trim();
    const title = String(kwargs.title ?? '').trim();
    const match = parseChatGPTTitleMatchMode(kwargs.match, 'contains');
    if (!match) {
      return [buildChatGPTHistoryRow({}, {
        action: 'rename',
        status: 'failed',
        detail: 'Invalid match mode. Use contains or exact.',
      })];
    }

    let targetUrl = parseChatGPTConversationUrl(query);
    if (!targetUrl) {
      await openChatGPTImages(page);
      const conversations = await getChatGPTConversationList(page);
      const picked = resolveChatGPTConversationForQuery(conversations, query, match);
      if (!picked?.Url) {
        return [buildChatGPTHistoryRow({}, {
          action: 'rename',
          status: 'not_found',
          detail: `No conversation matched: ${query}`,
        })];
      }
      targetUrl = picked.Url;
    }

    const result = await renameChatGPTConversation(page, targetUrl, title);
    return [buildChatGPTHistoryRow(result, {
      action: 'rename',
      status: result?.ok ? 'renamed' : 'failed',
      title,
      url: targetUrl,
      detail: result?.ok ? '' : (result?.reason || 'rename-failed'),
    })];
  },
});

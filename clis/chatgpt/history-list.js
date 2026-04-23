import { cli, Strategy } from '@jackwener/opencli/registry';
import {
  CHATGPT_WEB_DOMAIN,
  getChatGPTConversationList,
  openChatGPTImages,
} from './utils.js';

export const historyListCommand = cli({
  site: 'chatgpt',
  name: 'history-list',
  description: 'List visible ChatGPT conversation history items from the sidebar',
  domain: CHATGPT_WEB_DOMAIN,
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  defaultFormat: 'plain',
  timeoutSeconds: 180,
  args: [],
  columns: ['title', 'url', 'current'],
  func: async (page) => {
    await openChatGPTImages(page);
    const conversations = await getChatGPTConversationList(page);
    return conversations.map((item) => ({
      title: String(item?.Title ?? '').trim(),
      url: String(item?.Url ?? '').trim(),
      current: item?.Current ? 'yes' : '',
    }));
  },
});

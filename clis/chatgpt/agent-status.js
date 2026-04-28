import { cli, Strategy } from '@jackwener/opencli/registry';
import {
  buildChatGPTAgentRow,
  CHATGPT_WEB_DOMAIN,
  getChatGPTConversationList,
  openChatGPTAgent,
  openChatGPTConversation,
  parseChatGPTConversationUrl,
  parseChatGPTPositiveInt,
  parseChatGPTTitleMatchMode,
  readChatGPTAgentSnapshot,
  resolveChatGPTConversationForQuery,
} from './utils.js';

export const agentStatusCommand = cli({
  site: 'chatgpt',
  name: 'agent-status',
  description: 'Classify the visible UI state of a ChatGPT Agent Mode task thread',
  domain: CHATGPT_WEB_DOMAIN,
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  defaultFormat: 'plain',
  timeoutSeconds: 180,
  args: [
    { name: 'query', required: false, positional: true, help: 'Conversation URL, title query, or empty for current Agent landing/current state' },
    { name: 'match', required: false, help: 'Title match mode: contains or exact', default: 'contains' },
    { name: 'watch', type: 'boolean', required: false, help: 'Poll until timeout and return only distinct visible state transitions', default: false },
    { name: 'interval', required: false, help: 'Seconds between watch polls (default: 10)', default: '10' },
    { name: 'timeout', required: false, help: 'Max seconds to watch status transitions (default: 120)', default: '120' },
  ],
  columns: ['ui_state', 'conversation_url', 'conversation_id', 'thread_title', 'mode_label'],
  func: async (page, kwargs) => {
    const query = String(kwargs.query ?? '').trim();
    const match = parseChatGPTTitleMatchMode(kwargs.match, 'contains');
    const watch = kwargs.watch === true || kwargs.watch === '' || String(kwargs.watch ?? '').toLowerCase() === 'true';
    const watchInterval = parseChatGPTPositiveInt(kwargs.interval, 10);
    const watchTimeout = parseChatGPTPositiveInt(kwargs.timeout, 120);
    if (!match) {
      return [buildChatGPTAgentRow({}, { detail: 'Invalid match mode. Use contains or exact.' })];
    }

    const readStatusRows = async () => {
      const snapshot = await readChatGPTAgentSnapshot(page);
      return [buildChatGPTAgentRow(snapshot)];
    };

    const watchStatusRows = async (initialRows) => {
      const rows = Array.isArray(initialRows) && initialRows.length > 0 ? [...initialRows] : await readStatusRows();
      const rowKey = (row) => [row.ui_state, row.conversation_url, row.conversation_id, row.thread_title, row.mode_label, row.detail || ''].join('\u001f');
      let lastKey = rowKey(rows[rows.length - 1]);
      const polls = Math.max(0, Math.ceil(watchTimeout / watchInterval) - 1);
      for (let attempt = 0; attempt < polls; attempt += 1) {
        await page.wait({ time: watchInterval });
        const [nextRow] = await readStatusRows();
        const nextKey = rowKey(nextRow);
        if (nextKey !== lastKey) {
          rows.push(nextRow);
          lastKey = nextKey;
        }
      }
      return rows;
    };

    const directUrl = parseChatGPTConversationUrl(query);
    if (directUrl) {
      await openChatGPTConversation(page, directUrl);
      const rows = await readStatusRows();
      return watch ? watchStatusRows(rows) : rows;
    }

    await openChatGPTAgent(page);
    const landingSnapshot = await readChatGPTAgentSnapshot(page);
    const landingRows = [buildChatGPTAgentRow(landingSnapshot)];
    if (landingSnapshot.isSignedIn === false) {
      return landingRows;
    }
    if (!query) {
      return watch ? watchStatusRows(landingRows) : landingRows;
    }

    const conversations = await getChatGPTConversationList(page);
    const picked = resolveChatGPTConversationForQuery(conversations, query, match);
    if (picked?.Url) {
      await openChatGPTConversation(page, picked.Url);
      const rows = await readStatusRows();
      return watch ? watchStatusRows(rows) : rows;
    }

    const missingRows = [buildChatGPTAgentRow(landingSnapshot, { detail: `No conversation matched: ${query}` })];
    return watch ? watchStatusRows(missingRows) : missingRows;
  },
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jackwener/opencli/registry', () => ({
  cli: (definition) => definition,
  Strategy: { COOKIE: 'cookie' },
}));

const {
  mockBuildRow,
  mockGetConversationList,
  mockOpenConversation,
  mockOpenImages,
  mockParseConversationUrl,
  mockParseTitleMatchMode,
  mockReadSnapshot,
  mockResolveConversation,
} = vi.hoisted(() => ({
  mockBuildRow: vi.fn((snapshot, extra = {}) => ({
    action: 'open',
    status: extra.status || 'opened',
    title: extra.title || snapshot.threadTitle || snapshot.title || '',
    url: extra.url || snapshot.url || '',
    conversation_id: snapshot.conversationId || '',
    ...(extra.detail ? { detail: extra.detail } : {}),
  })),
  mockGetConversationList: vi.fn(),
  mockOpenConversation: vi.fn(),
  mockOpenImages: vi.fn(),
  mockParseConversationUrl: vi.fn(),
  mockParseTitleMatchMode: vi.fn((value, fallback) => value || fallback),
  mockReadSnapshot: vi.fn(),
  mockResolveConversation: vi.fn(),
}));

vi.mock('./utils.js', () => ({
  CHATGPT_WEB_DOMAIN: 'chatgpt.com',
  buildChatGPTHistoryRow: mockBuildRow,
  getChatGPTConversationList: mockGetConversationList,
  openChatGPTConversation: mockOpenConversation,
  openChatGPTImages: mockOpenImages,
  parseChatGPTConversationUrl: mockParseConversationUrl,
  parseChatGPTTitleMatchMode: mockParseTitleMatchMode,
  readChatGPTConversationSnapshot: mockReadSnapshot,
  resolveChatGPTConversationForQuery: mockResolveConversation,
}));

import { historyOpenCommand } from './history-open.js';

describe('chatgpt/history-open', () => {
  const page = {};

  beforeEach(() => {
    vi.clearAllMocks();
    mockReadSnapshot.mockResolvedValue({
      url: 'https://chatgpt.com/c/dish123',
      pathname: '/c/dish123',
      conversationId: 'dish123',
      threadTitle: '菜品生成',
    });
    mockGetConversationList.mockResolvedValue([
      { Title: '菜品生成', Url: 'https://chatgpt.com/c/dish123' },
    ]);
    mockResolveConversation.mockReturnValue({ Title: '菜品生成', Url: 'https://chatgpt.com/c/dish123' });
  });

  it('opens a direct conversation url when the query is already a URL', async () => {
    mockParseConversationUrl.mockReturnValue('https://chatgpt.com/c/dish123');

    const rows = await historyOpenCommand.func(page, { query: 'https://chatgpt.com/c/dish123' });

    expect(mockOpenImages).not.toHaveBeenCalled();
    expect(mockOpenConversation).toHaveBeenCalledWith(page, 'https://chatgpt.com/c/dish123');
    expect(mockReadSnapshot).toHaveBeenCalledWith(page);
    expect(rows).toEqual([
      { action: 'open', status: 'opened', title: '菜品生成', url: 'https://chatgpt.com/c/dish123', conversation_id: 'dish123' },
    ]);
  });

  it('returns failed when opening a direct url does not land on a conversation thread', async () => {
    mockParseConversationUrl.mockReturnValue('https://chatgpt.com/c/missing123');
    mockReadSnapshot.mockResolvedValue({
      url: 'https://chatgpt.com/',
      pathname: '/',
      conversationId: '',
      threadTitle: '',
    });

    const rows = await historyOpenCommand.func(page, { query: 'https://chatgpt.com/c/missing123' });

    expect(rows).toEqual([
      {
        action: 'open',
        status: 'failed',
        title: '',
        url: 'https://chatgpt.com/c/missing123',
        conversation_id: '',
        detail: 'Did not land on the requested ChatGPT conversation: https://chatgpt.com/',
      },
    ]);
  });

  it('resolves a title query from the visible history list', async () => {
    mockParseConversationUrl.mockReturnValue(null);

    const rows = await historyOpenCommand.func(page, { query: '菜品', match: 'contains' });

    expect(mockOpenImages).toHaveBeenCalledTimes(1);
    expect(mockGetConversationList).toHaveBeenCalledWith(page);
    expect(mockResolveConversation).toHaveBeenCalledWith([{ Title: '菜品生成', Url: 'https://chatgpt.com/c/dish123' }], '菜品', 'contains');
    expect(mockOpenConversation).toHaveBeenCalledWith(page, 'https://chatgpt.com/c/dish123');
    expect(rows[0].status).toBe('opened');
  });

  it('returns not_found when no conversation matches the query', async () => {
    mockParseConversationUrl.mockReturnValue(null);
    mockResolveConversation.mockReturnValue(null);

    const rows = await historyOpenCommand.func(page, { query: '不存在', match: 'exact' });

    expect(mockOpenConversation).not.toHaveBeenCalled();
    expect(rows).toEqual([
      { action: 'open', status: 'not_found', title: '', url: '', conversation_id: '', detail: 'No conversation matched: 不存在' },
    ]);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jackwener/opencli/registry', () => ({
  cli: (definition) => definition,
  Strategy: { COOKIE: 'cookie' },
}));

const {
  mockBuildRow,
  mockDeleteConversation,
  mockGetConversationList,
  mockOpenImages,
  mockParseConversationUrl,
  mockParseTitleMatchMode,
  mockResolveConversation,
} = vi.hoisted(() => ({
  mockBuildRow: vi.fn((snapshot, extra = {}) => ({
    action: 'delete',
    status: extra.status || 'deleted',
    title: extra.title || snapshot.threadTitle || '',
    url: snapshot.url || '',
    conversation_id: snapshot.conversationId || '',
    ...(extra.detail ? { detail: extra.detail } : {}),
  })),
  mockDeleteConversation: vi.fn(),
  mockGetConversationList: vi.fn(),
  mockOpenImages: vi.fn(),
  mockParseConversationUrl: vi.fn(),
  mockParseTitleMatchMode: vi.fn((value, fallback) => value || fallback),
  mockResolveConversation: vi.fn(),
}));

vi.mock('./utils.js', () => ({
  CHATGPT_WEB_DOMAIN: 'chatgpt.com',
  buildChatGPTHistoryRow: mockBuildRow,
  deleteChatGPTConversation: mockDeleteConversation,
  getChatGPTConversationList: mockGetConversationList,
  openChatGPTImages: mockOpenImages,
  parseChatGPTConversationUrl: mockParseConversationUrl,
  parseChatGPTTitleMatchMode: mockParseTitleMatchMode,
  resolveChatGPTConversationForQuery: mockResolveConversation,
}));

import { historyDeleteCommand } from './history-delete.js';

describe('chatgpt/history-delete', () => {
  const page = {};

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConversationList.mockResolvedValue([
      { Title: '菜品生成', Url: 'https://chatgpt.com/c/dish123' },
    ]);
    mockResolveConversation.mockReturnValue({ Title: '菜品生成', Url: 'https://chatgpt.com/c/dish123' });
    mockDeleteConversation.mockResolvedValue({
      ok: true,
      url: 'https://chatgpt.com/c/dish123',
      conversationId: 'dish123',
      threadTitle: '菜品生成',
    });
  });

  it('deletes a title-matched conversation from the sidebar history', async () => {
    mockParseConversationUrl.mockReturnValue(null);

    const rows = await historyDeleteCommand.func(page, {
      query: '菜品生成',
      match: 'contains',
    });

    expect(mockOpenImages).toHaveBeenCalledTimes(1);
    expect(mockResolveConversation).toHaveBeenCalledWith([{ Title: '菜品生成', Url: 'https://chatgpt.com/c/dish123' }], '菜品生成', 'contains');
    expect(mockDeleteConversation).toHaveBeenCalledWith(page, 'https://chatgpt.com/c/dish123');
    expect(rows).toEqual([
      { action: 'delete', status: 'deleted', title: '菜品生成', url: 'https://chatgpt.com/c/dish123', conversation_id: 'dish123' },
    ]);
  });

  it('returns not_found when no conversation matches the delete query', async () => {
    mockParseConversationUrl.mockReturnValue(null);
    mockResolveConversation.mockReturnValue(null);

    const rows = await historyDeleteCommand.func(page, {
      query: '不存在',
      match: 'exact',
    });

    expect(mockDeleteConversation).not.toHaveBeenCalled();
    expect(rows).toEqual([
      { action: 'delete', status: 'not_found', title: '', url: '', conversation_id: '', detail: 'No conversation matched: 不存在' },
    ]);
  });
});

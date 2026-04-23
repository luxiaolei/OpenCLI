import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jackwener/opencli/registry', () => ({
  cli: (definition) => definition,
  Strategy: { COOKIE: 'cookie' },
}));

const {
  mockBuildRow,
  mockGetConversationList,
  mockOpenImages,
  mockParseConversationUrl,
  mockParseTitleMatchMode,
  mockRenameConversation,
  mockResolveConversation,
} = vi.hoisted(() => ({
  mockBuildRow: vi.fn((snapshot, extra = {}) => ({
    action: 'rename',
    status: extra.status || 'renamed',
    title: extra.title || snapshot.threadTitle || '',
    url: snapshot.url || '',
    conversation_id: snapshot.conversationId || '',
    ...(extra.detail ? { detail: extra.detail } : {}),
  })),
  mockGetConversationList: vi.fn(),
  mockOpenImages: vi.fn(),
  mockParseConversationUrl: vi.fn(),
  mockParseTitleMatchMode: vi.fn((value, fallback) => value || fallback),
  mockRenameConversation: vi.fn(),
  mockResolveConversation: vi.fn(),
}));

vi.mock('./utils.js', () => ({
  CHATGPT_WEB_DOMAIN: 'chatgpt.com',
  buildChatGPTHistoryRow: mockBuildRow,
  getChatGPTConversationList: mockGetConversationList,
  openChatGPTImages: mockOpenImages,
  parseChatGPTConversationUrl: mockParseConversationUrl,
  parseChatGPTTitleMatchMode: mockParseTitleMatchMode,
  renameChatGPTConversation: mockRenameConversation,
  resolveChatGPTConversationForQuery: mockResolveConversation,
}));

import { historyRenameCommand } from './history-rename.js';

describe('chatgpt/history-rename', () => {
  const page = {};

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConversationList.mockResolvedValue([
      { Title: '菜品生成', Url: 'https://chatgpt.com/c/dish123' },
    ]);
    mockResolveConversation.mockReturnValue({ Title: '菜品生成', Url: 'https://chatgpt.com/c/dish123' });
    mockRenameConversation.mockResolvedValue({
      ok: true,
      url: 'https://chatgpt.com/c/dish123',
      conversationId: 'dish123',
      threadTitle: '菜品生成 v2',
    });
  });

  it('renames a title-matched conversation from the sidebar history', async () => {
    mockParseConversationUrl.mockReturnValue(null);

    const rows = await historyRenameCommand.func(page, {
      query: '菜品生成',
      title: '菜品生成 v2',
      match: 'contains',
    });

    expect(mockOpenImages).toHaveBeenCalledTimes(1);
    expect(mockResolveConversation).toHaveBeenCalledWith([{ Title: '菜品生成', Url: 'https://chatgpt.com/c/dish123' }], '菜品生成', 'contains');
    expect(mockRenameConversation).toHaveBeenCalledWith(page, 'https://chatgpt.com/c/dish123', '菜品生成 v2');
    expect(rows).toEqual([
      { action: 'rename', status: 'renamed', title: '菜品生成 v2', url: 'https://chatgpt.com/c/dish123', conversation_id: 'dish123' },
    ]);
  });

  it('renames a direct conversation url without resolving the sidebar list', async () => {
    mockParseConversationUrl.mockReturnValue('https://chatgpt.com/c/dish123');

    await historyRenameCommand.func(page, {
      query: 'https://chatgpt.com/c/dish123',
      title: '菜品生成 v2',
      match: 'contains',
    });

    expect(mockOpenImages).not.toHaveBeenCalled();
    expect(mockRenameConversation).toHaveBeenCalledWith(page, 'https://chatgpt.com/c/dish123', '菜品生成 v2');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jackwener/opencli/registry', () => ({
  cli: (definition) => definition,
  Strategy: { COOKIE: 'cookie' },
}));

const {
  mockBuildRow,
  mockGetConversationList,
  mockOpenConversation,
  mockOpenDeepResearch,
  mockParseConversationUrl,
  mockParseTitleMatchMode,
  mockReadSnapshot,
  mockResolveConversation,
} = vi.hoisted(() => ({
  mockBuildRow: vi.fn((snapshot, extra = {}) => ({
    ui_state: snapshot.uiState || 'unknown',
    conversation_url: snapshot.url || '',
    conversation_id: snapshot.conversationId || '',
    thread_title: snapshot.threadTitle || '',
    mode_label: snapshot.modeLabel || '',
    ...((extra.detail || snapshot.isSignedIn === false) ? { detail: extra.detail || 'Not signed in to ChatGPT.' } : {}),
  })),
  mockGetConversationList: vi.fn(),
  mockOpenConversation: vi.fn(),
  mockOpenDeepResearch: vi.fn(),
  mockParseConversationUrl: vi.fn((value) => {
    const raw = String(value ?? '').trim();
    return raw.startsWith('https://chatgpt.com/c/') ? raw : null;
  }),
  mockParseTitleMatchMode: vi.fn((value) => {
    const raw = String(value ?? 'contains').trim().toLowerCase();
    return raw === 'contains' || raw === 'exact' ? raw : null;
  }),
  mockReadSnapshot: vi.fn(),
  mockResolveConversation: vi.fn(),
}));

vi.mock('./utils.js', () => ({
  CHATGPT_WEB_DOMAIN: 'chatgpt.com',
  buildChatGPTDeepResearchRow: mockBuildRow,
  getChatGPTConversationList: mockGetConversationList,
  openChatGPTConversation: mockOpenConversation,
  openChatGPTDeepResearch: mockOpenDeepResearch,
  parseChatGPTConversationUrl: mockParseConversationUrl,
  parseChatGPTTitleMatchMode: mockParseTitleMatchMode,
  readChatGPTDeepResearchSnapshot: mockReadSnapshot,
  resolveChatGPTConversationForQuery: mockResolveConversation,
}));

import { deepResearchStatusCommand } from './deep-research-status.js';

describe('chatgpt/deep-research-status', () => {
  const page = {};

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConversationList.mockResolvedValue([
      { Title: 'ChatGPT Deep Research 概述', Url: 'https://chatgpt.com/c/abc123' },
    ]);
    mockResolveConversation.mockReturnValue({ Title: 'ChatGPT Deep Research 概述', Url: 'https://chatgpt.com/c/abc123' });
    mockReadSnapshot.mockResolvedValue({
      url: 'https://chatgpt.com/c/abc123',
      conversationId: 'abc123',
      threadTitle: 'ChatGPT Deep Research 概述',
      modeLabel: '深度研究',
      uiState: 'pending',
    });
  });

  it('opens a direct conversation url when provided', async () => {
    const result = await deepResearchStatusCommand.func(page, { query: 'https://chatgpt.com/c/abc123', match: 'contains' });
    expect(mockOpenConversation).toHaveBeenCalledWith(page, 'https://chatgpt.com/c/abc123');
    expect(result[0].ui_state).toBe('pending');
  });

  it('opens deep research and resolves a title query', async () => {
    const result = await deepResearchStatusCommand.func(page, { query: '概述', match: 'contains' });
    expect(mockOpenDeepResearch).toHaveBeenCalledTimes(1);
    expect(mockResolveConversation).toHaveBeenCalledWith([
      { Title: 'ChatGPT Deep Research 概述', Url: 'https://chatgpt.com/c/abc123' },
    ], '概述', 'contains');
    expect(mockOpenConversation).toHaveBeenCalledWith(page, 'https://chatgpt.com/c/abc123');
    expect(result[0].ui_state).toBe('pending');
  });

  it('falls back to current snapshot when query is empty and no conversations are available', async () => {
    mockGetConversationList.mockResolvedValue([]);
    mockResolveConversation.mockReturnValue(null);
    mockReadSnapshot.mockResolvedValue({
      url: 'https://chatgpt.com/deep-research',
      conversationId: '',
      threadTitle: '',
      modeLabel: '深度研究',
      uiState: 'landing',
    });
    const result = await deepResearchStatusCommand.func(page, { query: '', match: 'contains' });
    expect(mockOpenConversation).not.toHaveBeenCalled();
    expect(result[0].ui_state).toBe('landing');
  });

  it('returns an unknown row when match mode is invalid', async () => {
    const result = await deepResearchStatusCommand.func(page, { query: '概述', match: 'prefix' });
    expect(result).toEqual([{
      ui_state: 'unknown',
      conversation_url: '',
      conversation_id: '',
      thread_title: '',
      mode_label: '',
      detail: 'Invalid match mode. Use contains or exact.',
    }]);
  });

  it('returns current state with detail when query does not match any conversation', async () => {
    mockResolveConversation.mockReturnValue(null);
    mockReadSnapshot.mockResolvedValue({
      url: 'https://chatgpt.com/deep-research',
      conversationId: '',
      threadTitle: '',
      modeLabel: '深度研究',
      uiState: 'landing',
    });
    const result = await deepResearchStatusCommand.func(page, { query: 'missing', match: 'contains' });
    expect(result).toEqual([{
      ui_state: 'landing',
      conversation_url: 'https://chatgpt.com/deep-research',
      conversation_id: '',
      thread_title: '',
      mode_label: '深度研究',
      detail: 'No conversation matched: missing',
    }]);
  });

  it('returns a signed-out row from the landing page before resolving conversations', async () => {
    mockReadSnapshot.mockResolvedValueOnce({
      url: 'https://auth.openai.com/log-in-or-create-account',
      conversationId: '',
      threadTitle: '',
      modeLabel: '',
      uiState: 'unknown',
      isSignedIn: false,
    });

    const result = await deepResearchStatusCommand.func(page, { query: '', match: 'contains' });

    expect(mockGetConversationList).not.toHaveBeenCalled();
    expect(result).toEqual([{
      ui_state: 'unknown',
      conversation_url: 'https://auth.openai.com/log-in-or-create-account',
      conversation_id: '',
      thread_title: '',
      mode_label: '',
      detail: 'Not signed in to ChatGPT.',
    }]);
  });

  it('treats an empty query as the current Deep Research landing state instead of the first sidebar conversation', async () => {
    mockReadSnapshot.mockResolvedValueOnce({
      url: 'https://chatgpt.com/deep-research',
      conversationId: '',
      threadTitle: '',
      modeLabel: '深度研究 应用站点',
      uiState: 'landing',
    });

    const result = await deepResearchStatusCommand.func(page, { query: '', match: 'contains' });

    expect(mockGetConversationList).not.toHaveBeenCalled();
    expect(mockOpenConversation).not.toHaveBeenCalled();
    expect(result).toEqual([{
      ui_state: 'landing',
      conversation_url: 'https://chatgpt.com/deep-research',
      conversation_id: '',
      thread_title: '',
      mode_label: '深度研究 应用站点',
    }]);
  });
});

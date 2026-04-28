import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jackwener/opencli/registry', () => ({
  cli: (definition) => definition,
  Strategy: { COOKIE: 'cookie' },
}));

const {
  mockBuildRow,
  mockGetConversationList,
  mockOpenAgent,
  mockOpenConversation,
  mockParseConversationUrl,
  mockParsePositiveInt,
  mockParseTitleMatchMode,
  mockReadSnapshot,
  mockResolveConversationForQuery,
} = vi.hoisted(() => ({
  mockBuildRow: vi.fn((snapshot, extra = {}) => ({
    ui_state: snapshot.uiState || 'unknown',
    conversation_url: snapshot.url || '',
    conversation_id: snapshot.conversationId || '',
    thread_title: snapshot.threadTitle || '',
    mode_label: snapshot.modeLabel || '',
    ...(extra.detail ? { detail: extra.detail } : {}),
  })),
  mockGetConversationList: vi.fn(),
  mockOpenAgent: vi.fn(),
  mockOpenConversation: vi.fn(),
  mockParseConversationUrl: vi.fn((value) => String(value || '').startsWith('https://chatgpt.com/c/') ? value : null),
  mockParsePositiveInt: vi.fn((value, fallback) => {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }),
  mockParseTitleMatchMode: vi.fn((value, fallback) => {
    const raw = String(value ?? fallback).trim().toLowerCase();
    return raw === 'contains' || raw === 'exact' ? raw : null;
  }),
  mockReadSnapshot: vi.fn(),
  mockResolveConversationForQuery: vi.fn(),
}));

vi.mock('./utils.js', () => ({
  CHATGPT_WEB_DOMAIN: 'chatgpt.com',
  buildChatGPTAgentRow: mockBuildRow,
  getChatGPTConversationList: mockGetConversationList,
  openChatGPTAgent: mockOpenAgent,
  openChatGPTConversation: mockOpenConversation,
  parseChatGPTConversationUrl: mockParseConversationUrl,
  parseChatGPTPositiveInt: mockParsePositiveInt,
  parseChatGPTTitleMatchMode: mockParseTitleMatchMode,
  readChatGPTAgentSnapshot: mockReadSnapshot,
  resolveChatGPTConversationForQuery: mockResolveConversationForQuery,
}));

import { agentStatusCommand } from './agent-status.js';

describe('chatgpt/agent-status', () => {
  const page = { wait: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    page.wait = vi.fn(async () => undefined);
    mockReadSnapshot.mockResolvedValue({
      url: 'https://chatgpt.com/c/agent-123',
      conversationId: 'agent-123',
      threadTitle: 'Agent task',
      modeLabel: 'Agent mode',
      uiState: 'running',
    });
  });

  it('opens a direct conversation URL and returns its agent state', async () => {
    const result = await agentStatusCommand.func(page, { query: 'https://chatgpt.com/c/agent-123', match: 'contains' });

    expect(mockOpenConversation).toHaveBeenCalledWith(page, 'https://chatgpt.com/c/agent-123');
    expect(mockOpenAgent).not.toHaveBeenCalled();
    expect(result).toEqual([{
      ui_state: 'running',
      conversation_url: 'https://chatgpt.com/c/agent-123',
      conversation_id: 'agent-123',
      thread_title: 'Agent task',
      mode_label: 'Agent mode',
    }]);
  });

  it('with empty query reads current ChatGPT Agent landing/current state instead of following sidebar history', async () => {
    mockReadSnapshot.mockResolvedValueOnce({
      url: 'https://chatgpt.com/',
      conversationId: '',
      threadTitle: '',
      modeLabel: 'Agent mode',
      uiState: 'landing',
    });

    const result = await agentStatusCommand.func(page, { query: '', match: 'contains' });

    expect(mockOpenAgent).toHaveBeenCalledTimes(1);
    expect(mockGetConversationList).not.toHaveBeenCalled();
    expect(result).toEqual([{
      ui_state: 'landing',
      conversation_url: 'https://chatgpt.com/',
      conversation_id: '',
      thread_title: '',
      mode_label: 'Agent mode',
    }]);
  });

  it('resolves a title query via the visible conversation list', async () => {
    const conversations = [{ Title: 'Agent task', Url: 'https://chatgpt.com/c/agent-123', Current: false }];
    mockGetConversationList.mockResolvedValue(conversations);
    mockResolveConversationForQuery.mockReturnValue(conversations[0]);

    await agentStatusCommand.func(page, { query: 'Agent task', match: 'contains' });

    expect(mockResolveConversationForQuery).toHaveBeenCalledWith(conversations, 'Agent task', 'contains');
    expect(mockOpenConversation).toHaveBeenCalledWith(page, 'https://chatgpt.com/c/agent-123');
  });

  it('watch mode returns only distinct visible state transitions', async () => {
    mockReadSnapshot
      .mockResolvedValueOnce({ url: 'https://chatgpt.com/c/agent-123', conversationId: 'agent-123', threadTitle: 'Agent task', modeLabel: 'Agent mode', uiState: 'running' })
      .mockResolvedValueOnce({ url: 'https://chatgpt.com/c/agent-123', conversationId: 'agent-123', threadTitle: 'Agent task', modeLabel: 'Agent mode', uiState: 'running' })
      .mockResolvedValueOnce({ url: 'https://chatgpt.com/c/agent-123', conversationId: 'agent-123', threadTitle: 'Agent task', modeLabel: 'Agent mode', uiState: 'waiting_for_confirmation' });

    const result = await agentStatusCommand.func(page, {
      query: 'https://chatgpt.com/c/agent-123',
      match: 'contains',
      watch: true,
      interval: '1',
      timeout: '3',
    });

    expect(result.map((row) => row.ui_state)).toEqual(['running', 'waiting_for_confirmation']);
  });
});

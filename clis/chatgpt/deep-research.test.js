import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jackwener/opencli/registry', () => ({
  cli: (definition) => definition,
  Strategy: { COOKIE: 'cookie' },
}));

const {
  mockBuildRow,
  mockOpenDeepResearch,
  mockParsePositiveInt,
  mockReadSnapshot,
  mockSendPrompt,
  mockWaitForState,
} = vi.hoisted(() => ({
  mockBuildRow: vi.fn((snapshot, extra = {}) => ({
    ui_state: snapshot.uiState || 'unknown',
    conversation_url: snapshot.url || '',
    conversation_id: snapshot.conversationId || '',
    thread_title: snapshot.threadTitle || '',
    mode_label: snapshot.modeLabel || '',
    ...(extra.detail ? { detail: extra.detail } : {}),
  })),
  mockOpenDeepResearch: vi.fn(),
  mockParsePositiveInt: vi.fn((value, fallback) => {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }),
  mockReadSnapshot: vi.fn(),
  mockSendPrompt: vi.fn(),
  mockWaitForState: vi.fn(),
}));

vi.mock('./utils.js', () => ({
  CHATGPT_WEB_DOMAIN: 'chatgpt.com',
  buildChatGPTDeepResearchRow: mockBuildRow,
  openChatGPTDeepResearch: mockOpenDeepResearch,
  parseChatGPTPositiveInt: mockParsePositiveInt,
  readChatGPTDeepResearchSnapshot: mockReadSnapshot,
  sendChatGPTDeepResearchPrompt: mockSendPrompt,
  waitForChatGPTDeepResearchState: mockWaitForState,
}));

import { deepResearchCommand } from './deep-research.js';

describe('chatgpt/deep-research', () => {
  const page = {};

  beforeEach(() => {
    vi.clearAllMocks();
    mockReadSnapshot.mockResolvedValue({
      url: 'https://chatgpt.com/deep-research',
      conversationId: '',
      threadTitle: '',
      modeLabel: '深度研究',
      uiState: 'landing',
    });
    mockSendPrompt.mockResolvedValue({ ok: true, submitLabel: '发送提示' });
    mockWaitForState.mockResolvedValue({
      url: 'https://chatgpt.com/c/abc123',
      conversationId: 'abc123',
      threadTitle: 'ChatGPT Deep Research 概述',
      modeLabel: '深度研究',
      uiState: 'thread_created',
    });
  });

  it('opens deep research, sends the prompt, and returns the conservative thread state', async () => {
    const result = await deepResearchCommand.func(page, { prompt: 'research this topic', timeout: '45' });
    expect(mockOpenDeepResearch).toHaveBeenCalledTimes(1);
    expect(mockSendPrompt).toHaveBeenCalledWith(page, 'research this topic');
    expect(mockWaitForState).toHaveBeenCalledWith(page, 45);
    expect(result).toEqual([{
      ui_state: 'thread_created',
      conversation_url: 'https://chatgpt.com/c/abc123',
      conversation_id: 'abc123',
      thread_title: 'ChatGPT Deep Research 概述',
      mode_label: '深度研究',
    }]);
  });

  it('returns the current visible state with detail when prompt insertion fails', async () => {
    mockSendPrompt.mockResolvedValue({ ok: false, reason: 'ChatGPT Deep Research composer was not found.' });
    mockReadSnapshot.mockResolvedValueOnce({
      url: 'https://chatgpt.com/deep-research',
      conversationId: '',
      threadTitle: '',
      modeLabel: '深度研究',
      uiState: 'landing',
    }).mockResolvedValueOnce({
      url: 'https://chatgpt.com/deep-research',
      conversationId: '',
      threadTitle: '',
      modeLabel: '深度研究',
      uiState: 'landing',
    });
    const result = await deepResearchCommand.func(page, { prompt: 'research this topic' });
    expect(mockWaitForState).not.toHaveBeenCalled();
    expect(result).toEqual([{
      ui_state: 'landing',
      conversation_url: 'https://chatgpt.com/deep-research',
      conversation_id: '',
      thread_title: '',
      mode_label: '深度研究',
      detail: 'ChatGPT Deep Research composer was not found.',
    }]);
  });
});

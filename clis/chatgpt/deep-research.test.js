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
  mockSelectResearchMode,
  mockSendPrompt,
  mockWaitForState,
} = vi.hoisted(() => ({
  mockBuildRow: vi.fn((snapshot, extra = {}) => ({
    ui_state: snapshot.uiState || 'unknown',
    conversation_url: snapshot.url || '',
    conversation_id: snapshot.conversationId || '',
    thread_title: snapshot.threadTitle || '',
    mode_label: snapshot.modeLabel || '',
    ...((extra.detail || snapshot.isSignedIn === false) ? { detail: extra.detail || 'Not signed in to ChatGPT.' } : {}),
  })),
  mockOpenDeepResearch: vi.fn(),
  mockParsePositiveInt: vi.fn((value, fallback) => {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }),
  mockReadSnapshot: vi.fn(),
  mockSelectResearchMode: vi.fn(),
  mockSendPrompt: vi.fn(),
  mockWaitForState: vi.fn(),
}));

vi.mock('./utils.js', () => ({
  CHATGPT_WEB_DOMAIN: 'chatgpt.com',
  buildChatGPTDeepResearchRow: mockBuildRow,
  openChatGPTDeepResearch: mockOpenDeepResearch,
  parseChatGPTPositiveInt: mockParsePositiveInt,
  readChatGPTDeepResearchSnapshot: mockReadSnapshot,
  selectChatGPTResearchMode: mockSelectResearchMode,
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
    mockSelectResearchMode.mockResolvedValue({ ok: true, skipped: true });
    mockWaitForState.mockResolvedValue({
      url: 'https://chatgpt.com/c/abc123',
      conversationId: 'abc123',
      threadTitle: 'ChatGPT Deep Research 概述',
      modeLabel: '深度研究',
      uiState: 'pending',
    });
  });

  it('opens deep research, sends the prompt, and returns the conservative pending state', async () => {
    const result = await deepResearchCommand.func(page, { prompt: 'research this topic', timeout: '45' });
    expect(mockOpenDeepResearch).toHaveBeenCalledTimes(1);
    expect(mockSendPrompt).toHaveBeenCalledWith(page, 'research this topic');
    expect(mockWaitForState).toHaveBeenCalledWith(page, 45);
    expect(result).toEqual([{
      ui_state: 'pending',
      conversation_url: 'https://chatgpt.com/c/abc123',
      conversation_id: 'abc123',
      thread_title: 'ChatGPT Deep Research 概述',
      mode_label: '深度研究',
    }]);
  });

  it('returns submitted when no pending thread becomes visible before timeout', async () => {
    mockWaitForState.mockResolvedValue({
      url: 'https://chatgpt.com/deep-research',
      conversationId: '',
      threadTitle: '',
      modeLabel: '深度研究',
      uiState: 'submitted',
    });
    const result = await deepResearchCommand.func(page, { prompt: 'research this topic', timeout: '5' });
    expect(result).toEqual([{
      ui_state: 'submitted',
      conversation_url: 'https://chatgpt.com/deep-research',
      conversation_id: '',
      thread_title: '',
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

  it('returns a signed-out row before attempting prompt submission', async () => {
    mockReadSnapshot.mockResolvedValueOnce({
      url: 'https://auth.openai.com/log-in-or-create-account',
      conversationId: '',
      threadTitle: '',
      modeLabel: '',
      uiState: 'unknown',
      isSignedIn: false,
    });

    const result = await deepResearchCommand.func(page, { prompt: 'research this topic' });

    expect(mockSendPrompt).not.toHaveBeenCalled();
    expect(mockWaitForState).not.toHaveBeenCalled();
    expect(result).toEqual([{
      ui_state: 'unknown',
      conversation_url: 'https://auth.openai.com/log-in-or-create-account',
      conversation_id: '',
      thread_title: '',
      mode_label: '',
      detail: 'Not signed in to ChatGPT.',
    }]);
  });

  it('selects the requested Pro or Extended research mode before submitting the prompt', async () => {
    const result = await deepResearchCommand.func(page, { prompt: 'research this topic', mode: 'Pro research', timeout: '45' });
    expect(mockSelectResearchMode).toHaveBeenCalledWith(page, 'Pro research');
    expect(mockSendPrompt).toHaveBeenCalledWith(page, 'research this topic');
    expect(result[0].ui_state).toBe('pending');
  });

  it('returns explicit current-UI detail when research mode selector is absent', async () => {
    mockSelectResearchMode.mockResolvedValue({ ok: false, reason: 'model-selector-not-found', availableLabels: [] });
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

    const result = await deepResearchCommand.func(page, { prompt: 'research this topic', mode: 'Pro research' });

    expect(mockSendPrompt).not.toHaveBeenCalled();
    expect(result).toEqual([{
      ui_state: 'landing',
      conversation_url: 'https://chatgpt.com/deep-research',
      conversation_id: '',
      thread_title: '',
      mode_label: '深度研究',
      detail: 'Research mode selection failed: model-selector-not-found; current UI exposes: 深度研究',
    }]);
  });

  it('returns the current state with detail when research mode selection fails', async () => {
    mockSelectResearchMode.mockResolvedValue({ ok: false, reason: 'mode-option-not-found', availableLabels: ['Extended', 'Deep Research'] });
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

    const result = await deepResearchCommand.func(page, { prompt: 'research this topic', mode: 'Pro research' });

    expect(mockSendPrompt).not.toHaveBeenCalled();
    expect(result).toEqual([{
      ui_state: 'landing',
      conversation_url: 'https://chatgpt.com/deep-research',
      conversation_id: '',
      thread_title: '',
      mode_label: '深度研究',
      detail: 'Research mode selection failed: mode-option-not-found; available: Extended, Deep Research',
    }]);
  });
});

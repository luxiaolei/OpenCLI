import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jackwener/opencli/registry', () => ({
  cli: (definition) => definition,
  Strategy: { COOKIE: 'cookie' },
}));

const {
  mockBuildRow,
  mockOpenAgent,
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
    ...((extra.detail || snapshot.isSignedIn === false) ? { detail: extra.detail || 'Not signed in to ChatGPT.' } : {}),
  })),
  mockOpenAgent: vi.fn(),
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
  buildChatGPTAgentRow: mockBuildRow,
  openChatGPTAgent: mockOpenAgent,
  parseChatGPTPositiveInt: mockParsePositiveInt,
  readChatGPTAgentSnapshot: mockReadSnapshot,
  sendChatGPTAgentPrompt: mockSendPrompt,
  waitForChatGPTAgentState: mockWaitForState,
}));

import { agentCommand } from './agent.js';

describe('chatgpt/agent', () => {
  const page = {};

  beforeEach(() => {
    vi.clearAllMocks();
    mockReadSnapshot.mockResolvedValue({
      url: 'https://chatgpt.com/',
      conversationId: '',
      threadTitle: '',
      modeLabel: 'Agent mode',
      uiState: 'landing',
    });
    mockSendPrompt.mockResolvedValue({ ok: true, method: 'slash-agent' });
    mockWaitForState.mockResolvedValue({
      url: 'https://chatgpt.com/c/agent-123',
      conversationId: 'agent-123',
      threadTitle: 'Agent travel plan',
      modeLabel: 'Agent mode',
      uiState: 'running',
    });
  });

  it('opens ChatGPT Agent Mode, sends the task, and returns a conservative running state', async () => {
    const result = await agentCommand.func(page, { prompt: 'plan a trip', timeout: '45' });

    expect(mockOpenAgent).toHaveBeenCalledTimes(1);
    expect(mockSendPrompt).toHaveBeenCalledWith(page, 'plan a trip');
    expect(mockWaitForState).toHaveBeenCalledWith(page, 45);
    expect(result).toEqual([{
      ui_state: 'running',
      conversation_url: 'https://chatgpt.com/c/agent-123',
      conversation_id: 'agent-123',
      thread_title: 'Agent travel plan',
      mode_label: 'Agent mode',
    }]);
  });

  it('returns a signed-out row before attempting agent submission', async () => {
    mockReadSnapshot.mockResolvedValueOnce({
      url: 'https://auth.openai.com/log-in-or-create-account',
      conversationId: '',
      threadTitle: '',
      modeLabel: '',
      uiState: 'unknown',
      isSignedIn: false,
    });

    const result = await agentCommand.func(page, { prompt: 'plan a trip' });

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

  it('returns visible state with detail when slash agent prompt submission fails', async () => {
    mockSendPrompt.mockResolvedValue({ ok: false, reason: 'ChatGPT Agent composer was not found.' });
    mockReadSnapshot.mockResolvedValueOnce({
      url: 'https://chatgpt.com/',
      conversationId: '',
      threadTitle: '',
      modeLabel: 'Agent mode',
      uiState: 'landing',
    }).mockResolvedValueOnce({
      url: 'https://chatgpt.com/',
      conversationId: '',
      threadTitle: '',
      modeLabel: 'Agent mode',
      uiState: 'landing',
    });

    const result = await agentCommand.func(page, { prompt: 'plan a trip' });

    expect(mockWaitForState).not.toHaveBeenCalled();
    expect(result).toEqual([{
      ui_state: 'landing',
      conversation_url: 'https://chatgpt.com/',
      conversation_id: '',
      thread_title: '',
      mode_label: 'Agent mode',
      detail: 'ChatGPT Agent composer was not found.',
    }]);
  });
});

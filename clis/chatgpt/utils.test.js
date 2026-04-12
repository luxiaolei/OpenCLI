import { describe, expect, it } from 'vitest';
import {
  buildChatGPTDeepResearchRow,
  classifyChatGPTDeepResearchSnapshot,
  extractChatGPTConversationId,
  parseChatGPTConversationUrl,
  parseChatGPTTitleMatchMode,
  resolveChatGPTConversationForQuery,
} from './utils.js';

describe('chatgpt/utils', () => {
  it('parses a direct conversation url', () => {
    const url = 'https://chatgpt.com/c/abc123';
    expect(parseChatGPTConversationUrl(url)).toBe(url);
    expect(extractChatGPTConversationId(url)).toBe('abc123');
  });

  it('rejects non-conversation urls', () => {
    expect(parseChatGPTConversationUrl('https://chatgpt.com/deep-research')).toBeNull();
    expect(parseChatGPTConversationUrl('https://example.com/c/abc123')).toBeNull();
  });

  it('parses title match mode safely', () => {
    expect(parseChatGPTTitleMatchMode('contains')).toBe('contains');
    expect(parseChatGPTTitleMatchMode('exact')).toBe('exact');
    expect(parseChatGPTTitleMatchMode('prefix')).toBeNull();
  });

  it('resolves latest, exact, and contains matches', () => {
    const conversations = [
      { Title: 'OpenAI ChatGPT 深度研究', Url: 'https://chatgpt.com/c/1' },
      { Title: 'ChatGPT Deep Research 概述', Url: 'https://chatgpt.com/c/2' },
    ];
    expect(resolveChatGPTConversationForQuery(conversations, '', 'contains')).toEqual(conversations[0]);
    expect(resolveChatGPTConversationForQuery(conversations, 'ChatGPT Deep Research 概述', 'exact')).toEqual(conversations[1]);
    expect(resolveChatGPTConversationForQuery(conversations, '深度研究', 'contains')).toEqual(conversations[0]);
  });

  it('classifies snapshot states conservatively', () => {
    expect(classifyChatGPTDeepResearchSnapshot({ isDeepResearchPage: true })).toBe('landing');
    expect(classifyChatGPTDeepResearchSnapshot({ isDeepResearchPage: true, composerHasText: true, sendEnabled: true })).toBe('input_ready');
    expect(classifyChatGPTDeepResearchSnapshot({ conversationId: 'abc123' })).toBe('thread_created');
    expect(classifyChatGPTDeepResearchSnapshot({ conversationId: 'abc123', retryLabel: '深度研究，点击以重试' })).toBe('retry_required');
  });

  it('builds a stable command row', () => {
    expect(buildChatGPTDeepResearchRow({
      url: 'https://chatgpt.com/c/abc123',
      conversationId: 'abc123',
      threadTitle: 'ChatGPT Deep Research 概述',
      modeLabel: '深度研究',
      retryLabel: '',
    })).toEqual({
      ui_state: 'thread_created',
      conversation_url: 'https://chatgpt.com/c/abc123',
      conversation_id: 'abc123',
      thread_title: 'ChatGPT Deep Research 概述',
      mode_label: '深度研究',
    });
  });
});

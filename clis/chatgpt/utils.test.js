import { describe, expect, it, vi } from 'vitest';
import {
  buildChatGPTDeepResearchRow,
  buildChatGPTImageCapabilityRows,
  buildChatGPTImageCreateRow,
  classifyChatGPTDeepResearchSnapshot,
  extractChatGPTConversationId,
  hasChatGPTImageContext,
  normalizeChatGPTImageCapabilitySnapshot,
  parseChatGPTConversationUrl,
  parseChatGPTTitleMatchMode,
  resolveChatGPTConversationForQuery,
  waitForChatGPTDeepResearchState,
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
    expect(classifyChatGPTDeepResearchSnapshot({ conversationId: 'abc123' })).toBe('unknown');
    expect(classifyChatGPTDeepResearchSnapshot({ conversationId: 'abc123', retryLabel: '深度研究，点击以重试' })).toBe('retry_required');
  });

  it('does not let generic retry copy override a pending thread', () => {
    expect(classifyChatGPTDeepResearchSnapshot({ conversationId: 'abc123', retryLabel: 'Retry generation' })).toBe('unknown');
    expect(classifyChatGPTDeepResearchSnapshot({ conversationId: 'abc123', retryLabel: 'Deep Research' })).toBe('unknown');
  });

  it('builds a stable command row', () => {
    expect(buildChatGPTDeepResearchRow({
      url: 'https://chatgpt.com/c/abc123',
      conversationId: 'abc123',
      threadTitle: 'ChatGPT Deep Research 概述',
      modeLabel: '深度研究',
      retryLabel: '',
    })).toEqual({
      ui_state: 'pending',
      conversation_url: 'https://chatgpt.com/c/abc123',
      conversation_id: 'abc123',
      thread_title: 'ChatGPT Deep Research 概述',
      mode_label: '深度研究',
    });
  });

  it('waits through pending to allow retry_required to win', async () => {
    const snapshots = [
      { url: 'https://chatgpt.com/c/abc123', conversationId: 'abc123', modeLabel: '深度研究' },
      { url: 'https://chatgpt.com/c/abc123', conversationId: 'abc123', modeLabel: '深度研究' },
      { url: 'https://chatgpt.com/c/abc123', conversationId: 'abc123', modeLabel: '深度研究', retryLabel: '深度研究，点击以重试' },
    ];
    const page = {
      evaluate: vi.fn().mockImplementation(() => Promise.resolve(snapshots.shift() ?? snapshots.at(-1))),
      wait: vi.fn().mockResolvedValue(undefined),
    };

    const result = await waitForChatGPTDeepResearchState(page, 3);

    expect(result.uiState).toBe('retry_required');
    expect(page.wait).toHaveBeenCalledTimes(2);
  });

  it('returns submitted after timeout when no pending thread is visible yet', async () => {
    const page = {
      evaluate: vi.fn().mockResolvedValue({
        url: 'https://chatgpt.com/deep-research',
        isDeepResearchPage: true,
        modeLabel: '深度研究',
      }),
      wait: vi.fn().mockResolvedValue(undefined),
    };

    const result = await waitForChatGPTDeepResearchState(page, 2);

    expect(result.uiState).toBe('submitted');
    expect(page.wait).toHaveBeenCalledTimes(2);
  });

  it('normalizes image capability snapshots and builds capability rows', () => {
    const snapshot = normalizeChatGPTImageCapabilitySnapshot({
      url: 'https://chatgpt.com/images/',
      title: 'ChatGPT 图片 | AI 图片生成器',
      accountTier: 'Pro',
      promptPlaceholder: '描述新图片',
      addButtonLabel: '添加文件等',
      uploadInputs: ['upload-files (jpg,png)', 'upload-camera (image/*)', 'upload-files (jpg,png)'],
      styleCards: ['漫画风潮', '鎏金塑像'],
      taskCards: ['创作专业产品照片'],
      resultActions: ['编辑图片', '分享此图片'],
      isImagesPage: true,
    });
    expect(snapshot.uploadInputs).toEqual(['upload-files (jpg,png)', 'upload-camera (image/*)']);
    const rows = buildChatGPTImageCapabilityRows(snapshot);
    expect(rows).toContainEqual({ Category: 'account', Name: 'tier', Value: 'Pro' });
    expect(rows).toContainEqual({ Category: 'composer', Name: 'prompt_placeholder', Value: '描述新图片' });
    expect(rows).toContainEqual({ Category: 'style_preset', Name: 'card', Value: '漫画风潮' });
    expect(rows).toContainEqual({ Category: 'task_template', Name: 'card', Value: '创作专业产品照片' });
    expect(rows).toContainEqual({ Category: 'result_action', Name: 'action', Value: '编辑图片' });
  });

  it('returns absent for non-images pages without reporting image capability rows', () => {
    const snapshot = normalizeChatGPTImageCapabilitySnapshot({
      url: 'https://chatgpt.com/',
      title: 'ChatGPT',
      promptPlaceholder: 'Ask anything',
      addButtonLabel: '添加文件等',
      uploadInputs: ['generic-input'],
      isImagesPage: false,
    });
    const rows = buildChatGPTImageCapabilityRows(snapshot);
    expect(rows).toEqual([
      { Category: 'page', Name: 'url', Value: 'https://chatgpt.com/' },
      { Category: 'page', Name: 'title', Value: 'ChatGPT' },
      { Category: 'state', Name: 'status', Value: 'absent' },
      { Category: 'state', Name: 'reason', Value: 'not-images-page' },
    ]);
  });

  it('returns absent when /images is open but no image-specific context is visible', () => {
    const snapshot = normalizeChatGPTImageCapabilitySnapshot({
      url: 'https://chatgpt.com/images/',
      title: 'ChatGPT Images',
      promptPlaceholder: '描述新图片',
      addButtonLabel: '添加文件等',
      isImagesPage: true,
    });
    const rows = buildChatGPTImageCapabilityRows(snapshot);
    expect(rows).toEqual([
      { Category: 'page', Name: 'url', Value: 'https://chatgpt.com/images/' },
      { Category: 'page', Name: 'title', Value: 'ChatGPT Images' },
      { Category: 'state', Name: 'status', Value: 'absent' },
      { Category: 'state', Name: 'reason', Value: 'no-image-context' },
    ]);
  });

  it('detects image-specific context conservatively', () => {
    expect(hasChatGPTImageContext({ isImagesPage: true, styleCards: ['漫画风潮'] })).toBe(true);
    expect(hasChatGPTImageContext({ isImagesPage: true, taskCards: ['创作专业产品照片'] })).toBe(true);
    expect(hasChatGPTImageContext({ isImagesPage: true, uploadInputs: ['file-input (image/png,.png)'] })).toBe(true);
    expect(hasChatGPTImageContext({ isImagesPage: false, styleCards: ['漫画风潮'] })).toBe(false);
    expect(hasChatGPTImageContext({ isImagesPage: true })).toBe(false);
  });

  it('builds a stable row for image create responses', () => {
    expect(buildChatGPTImageCreateRow({
      status: 'result_visible',
      url: 'https://chatgpt.com/c/abc123',
      title: 'OpenAI ChatGPT',
      accountTier: 'Pro',
      resultActionLabels: ['打开图片：蓝色陶瓷杯', '编辑图片：蓝色陶瓷杯', '分享此图片：蓝色陶瓷杯'],
    })).toEqual({
      action: 'create',
      status: 'result_visible',
      page_url: 'https://chatgpt.com/c/abc123',
      page_title: 'OpenAI ChatGPT',
      account_tier: 'Pro',
      conversation_id: 'abc123',
    });
  });
});

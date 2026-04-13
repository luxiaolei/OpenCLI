import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jackwener/opencli/registry', () => ({
  cli: (definition) => definition,
  Strategy: { COOKIE: 'cookie' },
}));

const {
  mockBuildRow,
  mockHasContext,
  mockOpenImages,
  mockParsePositiveInt,
  mockReadCapabilities,
  mockSendPrompt,
  mockWaitForState,
} = vi.hoisted(() => ({
  mockBuildRow: vi.fn((snapshot, extra = {}) => ({
    action: 'create',
    status: extra.status || snapshot.status || 'submitted',
    page_url: snapshot.pageUrl || snapshot.url || '',
    page_title: snapshot.pageTitle || snapshot.title || '',
    account_tier: snapshot.accountTier || '',
    conversation_id: snapshot.conversationId || '',
    ...(extra.reason ? { reason: extra.reason } : {}),
    ...(extra.detail ? { detail: extra.detail } : {}),
  })),
  mockHasContext: vi.fn(),
  mockOpenImages: vi.fn(),
  mockParsePositiveInt: vi.fn((value, fallback) => Number.parseInt(String(value ?? fallback), 10) || fallback),
  mockReadCapabilities: vi.fn(),
  mockSendPrompt: vi.fn(),
  mockWaitForState: vi.fn(),
}));

vi.mock('./utils.js', () => ({
  CHATGPT_WEB_DOMAIN: 'chatgpt.com',
  buildChatGPTImageCreateRow: mockBuildRow,
  hasChatGPTImageContext: mockHasContext,
  openChatGPTImages: mockOpenImages,
  parseChatGPTPositiveInt: mockParsePositiveInt,
  readChatGPTImageCapabilities: mockReadCapabilities,
  sendChatGPTImagePrompt: mockSendPrompt,
  waitForChatGPTImageCreateState: mockWaitForState,
}));

import { imageCreateCommand } from './image-create.js';

describe('chatgpt/image-create', () => {
  const page = {};

  beforeEach(() => {
    vi.clearAllMocks();
    mockReadCapabilities.mockResolvedValue({
      url: 'https://chatgpt.com/images/',
      title: 'ChatGPT 图片 | AI 图片生成器',
      accountTier: 'Pro',
      isImagesPage: true,
      styleCards: ['漫画风潮'],
      taskCards: ['创作专业产品照片'],
      uploadInputs: ['file-input (image/png,.png)'],
      dragDropText: '拖放图片以上传',
      resultActions: [],
    });
    mockHasContext.mockReturnValue(true);
    mockSendPrompt.mockResolvedValue({ ok: true });
    mockWaitForState.mockResolvedValue({
      status: 'submitted',
      pageUrl: 'https://chatgpt.com/c/abc123',
      pageTitle: 'OpenAI ChatGPT',
      accountTier: 'Pro',
      conversationId: 'abc123',
      resultActions: [],
      resultActionLabels: [],
    });
  });

  it('returns blocked when /images is not open', async () => {
    mockReadCapabilities.mockResolvedValue({
      url: 'https://chatgpt.com/',
      title: 'ChatGPT',
      accountTier: 'Pro',
      isImagesPage: false,
      detail: 'redirected',
    });

    const result = await imageCreateCommand.func(page, { prompt: 'blue mug' });

    expect(mockSendPrompt).not.toHaveBeenCalled();
    expect(result).toEqual([{
      action: 'create',
      status: 'blocked',
      page_url: 'https://chatgpt.com/',
      page_title: 'ChatGPT',
      account_tier: 'Pro',
      conversation_id: '',
      reason: 'not-images-page',
      detail: 'redirected',
    }]);
  });

  it('returns blocked when image-specific context is absent', async () => {
    mockHasContext.mockReturnValue(false);

    const result = await imageCreateCommand.func(page, { prompt: 'blue mug' });

    expect(mockSendPrompt).not.toHaveBeenCalled();
    expect(result).toEqual([{
      action: 'create',
      status: 'blocked',
      page_url: 'https://chatgpt.com/images/',
      page_title: 'ChatGPT 图片 | AI 图片生成器',
      account_tier: 'Pro',
      conversation_id: '',
      reason: 'no-image-context',
    }]);
  });

  it('returns failed when prompt send is unavailable', async () => {
    mockSendPrompt.mockResolvedValue({ ok: false, reason: 'ChatGPT image composer was not found.' });

    const result = await imageCreateCommand.func(page, { prompt: 'blue mug' });

    expect(result).toEqual([{
      action: 'create',
      status: 'failed',
      page_url: 'https://chatgpt.com/images/',
      page_title: 'ChatGPT 图片 | AI 图片生成器',
      account_tier: 'Pro',
      conversation_id: '',
      reason: 'send-unavailable',
      detail: 'ChatGPT image composer was not found.',
    }]);
  });

  it('returns submitted when prompt is sent and no visible result appears yet', async () => {
    const result = await imageCreateCommand.func(page, { prompt: 'blue mug', timeout: '2' });

    expect(mockParsePositiveInt).toHaveBeenCalledWith('2', 30);
    expect(mockSendPrompt).toHaveBeenCalledWith(page, 'blue mug');
    expect(mockWaitForState).toHaveBeenCalledWith(page, 2);
    expect(result).toEqual([{
      action: 'create',
      status: 'submitted',
      page_url: 'https://chatgpt.com/c/abc123',
      page_title: 'OpenAI ChatGPT',
      account_tier: 'Pro',
      conversation_id: 'abc123',
    }]);
  });

  it('returns result_visible when a new thread shows visible result signals', async () => {
    mockWaitForState.mockResolvedValue({
      status: 'result_visible',
      pageUrl: 'https://chatgpt.com/c/abc123',
      pageTitle: 'OpenAI ChatGPT',
      accountTier: 'Pro',
      conversationId: 'abc123',
      resultActions: ['open', 'edit', 'share'],
      resultActionLabels: ['打开图片：蓝色陶瓷杯', '编辑图片：蓝色陶瓷杯', '分享此图片：蓝色陶瓷杯'],
    });

    const result = await imageCreateCommand.func(page, { prompt: 'blue mug', timeout: '2' });

    expect(result).toEqual([{
      action: 'create',
      status: 'result_visible',
      page_url: 'https://chatgpt.com/c/abc123',
      page_title: 'OpenAI ChatGPT',
      account_tier: 'Pro',
      conversation_id: 'abc123',
    }]);
  });
});

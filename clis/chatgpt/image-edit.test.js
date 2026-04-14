import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jackwener/opencli/registry', () => ({
  cli: (definition) => definition,
  Strategy: { COOKIE: 'cookie' },
}));

const {
  mockGetConversationList,
  mockGetCurrentUrl,
  mockHasContext,
  mockOpenConversation,
  mockOpenImages,
  mockParsePositiveInt,
  mockReadCapabilities,
} = vi.hoisted(() => ({
  mockGetConversationList: vi.fn().mockResolvedValue([]),
  mockGetCurrentUrl: vi.fn().mockResolvedValue('https://chatgpt.com/images'),
  mockHasContext: vi.fn(),
  mockOpenConversation: vi.fn(),
  mockOpenImages: vi.fn(),
  mockParsePositiveInt: vi.fn((value, fallback) => Number.parseInt(String(value ?? fallback), 10) || fallback),
  mockReadCapabilities: vi.fn(),
}));

vi.mock('./utils.js', () => ({
  CHATGPT_WEB_DOMAIN: 'chatgpt.com',
  extractChatGPTConversationId: (value) => {
    const raw = String(value ?? '').trim();
    const match = raw.match(/\/c\/([^/?#]+)/);
    return match ? match[1] : '';
  },
  getChatGPTConversationList: mockGetConversationList,
  getCurrentChatGPTUrl: mockGetCurrentUrl,
  hasChatGPTImageContext: mockHasContext,
  openChatGPTConversation: mockOpenConversation,
  openChatGPTImages: mockOpenImages,
  parseChatGPTPositiveInt: mockParsePositiveInt,
  readChatGPTImageCapabilities: mockReadCapabilities,
}));

import {
  buildChatGPTImageEditRow,
  imageEditCommand,
  imageEditInternals,
  readChatGPTImageEditState,
  waitForChatGPTImageEditState,
} from './image-edit.js';

describe('chatgpt/image-edit', () => {
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
  });

  it('returns blocked when /images is not open', async () => {
    mockReadCapabilities.mockResolvedValue({
      url: 'https://chatgpt.com/',
      title: 'ChatGPT',
      accountTier: 'Pro',
      isImagesPage: false,
      detail: 'redirected',
    });

    const result = await imageEditCommand.func(page, { prompt: 'make it beige' });

    expect(result).toEqual([{
      action: 'edit',
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
    const openSpy = vi.spyOn(imageEditInternals, 'openChatGPTImageForEdit');

    const result = await imageEditCommand.func(page, { prompt: 'make it beige' });

    expect(openSpy).not.toHaveBeenCalled();
    expect(result).toEqual([{
      action: 'edit',
      status: 'blocked',
      page_url: 'https://chatgpt.com/images/',
      page_title: 'ChatGPT 图片 | AI 图片生成器',
      account_tier: 'Pro',
      conversation_id: '',
      reason: 'no-image-context',
    }]);
  });

  it('returns blocked when no visible open-image entry is available', async () => {
    vi.spyOn(imageEditInternals, 'openChatGPTImageForEdit').mockResolvedValue({ ok: false, reason: 'No visible Open image entry was found on ChatGPT Images.' });

    const result = await imageEditCommand.func(page, { prompt: 'make it beige' });

    expect(result).toEqual([{
      action: 'edit',
      status: 'blocked',
      page_url: 'https://chatgpt.com/images/',
      page_title: 'ChatGPT 图片 | AI 图片生成器',
      account_tier: 'Pro',
      conversation_id: '',
      reason: 'open-image-unavailable',
      detail: 'No visible Open image entry was found on ChatGPT Images.',
    }]);
  });

  it('returns blocked when the edit modal never becomes ready', async () => {
    vi.spyOn(imageEditInternals, 'openChatGPTImageForEdit').mockResolvedValue({ ok: true, openLabel: '打开图片：蓝色陶瓷杯' });
    vi.spyOn(imageEditInternals, 'waitForChatGPTImageEditModal').mockResolvedValue({
      pageUrl: 'https://chatgpt.com/images/',
      pageTitle: 'ChatGPT 图片 | AI 图片生成器',
      accountTier: 'Pro',
      modalVisible: false,
      editComposerVisible: false,
      editPromptPlaceholder: '',
      modalThumbnailLabels: [],
    });

    const result = await imageEditCommand.func(page, { prompt: 'make it beige' });

    expect(result).toEqual([{
      action: 'edit',
      status: 'blocked',
      page_url: 'https://chatgpt.com/images/',
      page_title: 'ChatGPT 图片 | AI 图片生成器',
      account_tier: 'Pro',
      conversation_id: '',
      reason: 'edit-modal-unavailable',
      detail: 'ChatGPT image edit modal was not ready.',
    }]);
  });

  it('returns failed when the edit prompt cannot be submitted', async () => {
    vi.spyOn(imageEditInternals, 'openChatGPTImageForEdit').mockResolvedValue({ ok: true, openLabel: '打开图片：蓝色陶瓷杯' });
    vi.spyOn(imageEditInternals, 'waitForChatGPTImageEditModal').mockResolvedValue({
      pageUrl: 'https://chatgpt.com/images/',
      pageTitle: 'ChatGPT 图片 | AI 图片生成器',
      accountTier: 'Pro',
      modalVisible: true,
      editComposerVisible: true,
      editPromptPlaceholder: '描述编辑',
      modalThumbnailLabels: ['图片 1（共 8 张）：蓝色陶瓷杯'],
    });
    vi.spyOn(imageEditInternals, 'sendChatGPTImageEditPrompt').mockResolvedValue({ ok: false, reason: 'ChatGPT image edit composer was not found.' });

    const result = await imageEditCommand.func(page, { prompt: 'make it beige' });

    expect(result).toEqual([{
      action: 'edit',
      status: 'failed',
      page_url: 'https://chatgpt.com/images/',
      page_title: 'ChatGPT 图片 | AI 图片生成器',
      account_tier: 'Pro',
      conversation_id: '',
      reason: 'send-unavailable',
      detail: 'ChatGPT image edit composer was not found.',
    }]);
  });

  it('returns submitted when the edit prompt is accepted but the result is still loading', async () => {
    vi.spyOn(imageEditInternals, 'openChatGPTImageForEdit').mockResolvedValue({ ok: true, openLabel: '打开图片：蓝色陶瓷杯' });
    vi.spyOn(imageEditInternals, 'waitForChatGPTImageEditModal').mockResolvedValue({
      pageUrl: 'https://chatgpt.com/images/',
      pageTitle: 'ChatGPT 图片 | AI 图片生成器',
      accountTier: 'Pro',
      modalVisible: true,
      editComposerVisible: true,
      editPromptPlaceholder: '描述编辑',
      modalThumbnailLabels: ['图片 1（共 8 张）：蓝色陶瓷杯'],
    });
    vi.spyOn(imageEditInternals, 'sendChatGPTImageEditPrompt').mockResolvedValue({ ok: true, submitLabel: '发送提示' });
    vi.spyOn(imageEditInternals, 'waitForChatGPTImageEditState').mockResolvedValue({
      status: 'submitted',
      pageUrl: 'https://chatgpt.com/c/edit123',
      pageTitle: 'ChatGPT',
      accountTier: 'Pro',
      conversationId: 'edit123',
      loadingHeadlines: ['正在创建图片'],
      resultActions: [],
      resultActionLabels: [],
    });

    const result = await imageEditCommand.func(page, { prompt: 'make it beige', timeout: '5' });

    expect(mockParsePositiveInt).toHaveBeenCalledWith('5', 30);
    expect(result).toEqual([{
      action: 'edit',
      status: 'submitted',
      page_url: 'https://chatgpt.com/c/edit123',
      page_title: 'ChatGPT',
      account_tier: 'Pro',
      conversation_id: 'edit123',
    }]);
  });

  it('returns result_visible when a new edited result becomes visible', async () => {
    vi.spyOn(imageEditInternals, 'openChatGPTImageForEdit').mockResolvedValue({ ok: true, openLabel: '打开图片：蓝色陶瓷杯' });
    vi.spyOn(imageEditInternals, 'waitForChatGPTImageEditModal').mockResolvedValue({
      pageUrl: 'https://chatgpt.com/images/',
      pageTitle: 'ChatGPT 图片 | AI 图片生成器',
      accountTier: 'Pro',
      modalVisible: true,
      editComposerVisible: true,
      editPromptPlaceholder: '描述编辑',
      modalThumbnailLabels: ['图片 1（共 8 张）：蓝色陶瓷杯'],
    });
    vi.spyOn(imageEditInternals, 'sendChatGPTImageEditPrompt').mockResolvedValue({ ok: true, submitLabel: '发送提示' });
    vi.spyOn(imageEditInternals, 'waitForChatGPTImageEditState').mockResolvedValue({
      status: 'result_visible',
      pageUrl: 'https://chatgpt.com/c/edit456',
      pageTitle: 'ChatGPT',
      accountTier: 'Pro',
      conversationId: 'edit456',
      resultActions: ['edit', 'share'],
      resultActionLabels: ['编辑图片', '分享此图片'],
      loadingHeadlines: [],
    });

    const result = await imageEditCommand.func(page, { prompt: 'make it beige', timeout: '5' });

    expect(result).toEqual([{
      action: 'edit',
      status: 'result_visible',
      page_url: 'https://chatgpt.com/c/edit456',
      page_title: 'ChatGPT',
      account_tier: 'Pro',
      conversation_id: 'edit456',
    }]);
  });
});

describe('chatgpt/image-edit helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConversationList.mockResolvedValue([]);
    mockGetCurrentUrl.mockResolvedValue('https://chatgpt.com/images');
  });

  it('builds a stable row for image edit responses', () => {
    expect(buildChatGPTImageEditRow({
      url: 'https://chatgpt.com/c/edit789',
      title: 'ChatGPT',
      accountTier: 'Pro',
      resultActionLabels: ['编辑图片', '分享此图片'],
      loadingHeadlines: [],
    })).toEqual({
      action: 'edit',
      status: 'result_visible',
      page_url: 'https://chatgpt.com/c/edit789',
      page_title: 'ChatGPT',
      account_tier: 'Pro',
      conversation_id: 'edit789',
    });
  });

  it('recovers stale page identity by reopening /images and the latest conversation', async () => {
    mockGetConversationList.mockResolvedValue([{ Title: 'Recovered edit thread', Url: 'https://chatgpt.com/c/recovered123' }]);
    const page = {
      evaluate: vi.fn()
        .mockRejectedValueOnce(new Error('stale page identity: target replaced'))
        .mockResolvedValueOnce({
          url: 'https://chatgpt.com/c/recovered123',
          title: 'Recovered edit thread',
          conversationId: 'recovered123',
          resultActionLabels: ['编辑图片', '分享此图片'],
          loadingHeadlines: [],
        }),
      wait: vi.fn().mockResolvedValue(undefined),
    };

    const result = await readChatGPTImageEditState(page);

    expect(mockOpenImages).toHaveBeenCalledTimes(1);
    expect(mockGetConversationList).toHaveBeenCalledTimes(1);
    expect(mockOpenConversation).toHaveBeenCalledWith(page, 'https://chatgpt.com/c/recovered123');
    expect(result).toMatchObject({
      pageUrl: 'https://chatgpt.com/c/recovered123',
      conversationId: 'recovered123',
      resultActions: ['edit', 'share'],
      detail: 'stale page identity: target replaced',
    });
  });

  it('waits until a new conversation shows visible result actions', async () => {
    const snapshots = [
      {
        url: 'https://chatgpt.com/images/',
        isImagesPage: true,
        modalVisible: true,
        editComposerVisible: true,
        editPromptPlaceholder: '描述编辑',
        loadingHeadlines: [],
        resultActionLabels: [],
      },
      {
        url: 'https://chatgpt.com/c/edit999',
        conversationId: 'edit999',
        loadingHeadlines: ['正在创建图片'],
        resultActionLabels: [],
      },
      {
        url: 'https://chatgpt.com/c/edit999',
        conversationId: 'edit999',
        loadingHeadlines: [],
        resultActionLabels: ['编辑图片', '分享此图片'],
      },
    ];
    const page = {
      evaluate: vi.fn().mockImplementation(() => Promise.resolve(snapshots.shift() ?? snapshots.at(-1))),
      wait: vi.fn().mockResolvedValue(undefined),
    };

    const result = await waitForChatGPTImageEditState(page, 3, { url: 'https://chatgpt.com/images/' });

    expect(result.status).toBe('result_visible');
    expect(result.conversationId).toBe('edit999');
    expect(page.wait).toHaveBeenCalledTimes(2);
  });

  it('falls back to submitted when a new edit thread is still loading at timeout', async () => {
    const page = {
      evaluate: vi.fn().mockResolvedValue({
        url: 'https://chatgpt.com/c/edit123',
        conversationId: 'edit123',
        loadingHeadlines: ['先打个草稿'],
        resultActionLabels: [],
      }),
      wait: vi.fn().mockResolvedValue(undefined),
    };

    const result = await waitForChatGPTImageEditState(page, 2, { url: 'https://chatgpt.com/images/' });

    expect(result.status).toBe('submitted');
    expect(result.conversationId).toBe('edit123');
    expect(page.wait).toHaveBeenCalledTimes(2);
  });
});

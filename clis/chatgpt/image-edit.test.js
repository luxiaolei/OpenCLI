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
  mockParseConversationUrl,
  mockParsePositiveInt,
  mockReadCapabilities,
} = vi.hoisted(() => ({
  mockGetConversationList: vi.fn().mockResolvedValue([]),
  mockGetCurrentUrl: vi.fn().mockResolvedValue('https://chatgpt.com/images'),
  mockHasContext: vi.fn(),
  mockOpenConversation: vi.fn(),
  mockOpenImages: vi.fn(),
  mockParseConversationUrl: vi.fn((value) => {
    const raw = String(value ?? '').trim();
    return /^https:\/\/chatgpt\.com\/c\//.test(raw) ? raw : '';
  }),
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
  parseChatGPTConversationUrl: mockParseConversationUrl,
  parseChatGPTPositiveInt: mockParsePositiveInt,
  readChatGPTImageCapabilities: mockReadCapabilities,
}));

import {
  buildChatGPTImageEditRow,
  imageEditCommand,
  imageEditInternals,
  mergeChatGPTImageEditCandidates,
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
      resultActions: [],
    });
    mockHasContext.mockReturnValue(true);
  });

  it('returns blocked for an invalid conversation URL', async () => {
    mockParseConversationUrl.mockReturnValueOnce('');

    const result = await imageEditCommand.func(page, {
      prompt: 'make it beige',
      url: 'https://chatgpt.com/not-a-conversation',
    });

    expect(result).toEqual([{
      action: 'edit',
      status: 'blocked',
      page_url: 'https://chatgpt.com/images',
      page_title: '',
      account_tier: '',
      conversation_id: '',
      reason: 'invalid-conversation-url',
      detail: 'The provided ChatGPT conversation URL is invalid.',
    }]);
  });

  it('returns blocked for an invalid image index', async () => {
    const result = await imageEditCommand.func(page, {
      prompt: 'make it beige',
      image: '0',
    });

    expect(result).toEqual([{
      action: 'edit',
      status: 'blocked',
      page_url: 'https://chatgpt.com/images',
      page_title: '',
      account_tier: '',
      conversation_id: '',
      reason: 'invalid-image-index',
      detail: 'The image index must be a positive integer.',
    }]);
  });

  it('returns blocked when image-specific context is absent on /images', async () => {
    mockHasContext.mockReturnValue(false);
    const openSpy = vi.spyOn(imageEditInternals, 'waitForChatGPTImageOpenTarget');

    const result = await imageEditCommand.func(page, { prompt: 'make it beige' });

    expect(mockOpenImages).toHaveBeenCalledTimes(1);
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

  it('opens the requested visible image index on /images', async () => {
    vi.spyOn(imageEditInternals, 'waitForChatGPTImageOpenTarget').mockResolvedValue({ ok: true, requestedIndex: 3, source: 'images-my-images' });
    vi.spyOn(imageEditInternals, 'waitForChatGPTImageEditModal').mockResolvedValue({
      pageUrl: 'https://chatgpt.com/images/',
      pageTitle: 'ChatGPT 图片 | AI 图片生成器',
      accountTier: 'Pro',
      modalVisible: true,
      editComposerVisible: true,
      editPromptPlaceholder: '描述编辑',
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

    const result = await imageEditCommand.func(page, { prompt: 'make it beige', image: '3', timeout: '5' });

    expect(imageEditInternals.waitForChatGPTImageOpenTarget).toHaveBeenCalledWith(page, 3, 4);
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

  it('targets a specific conversation URL and lightbox image index', async () => {
    vi.spyOn(imageEditInternals, 'waitForChatGPTImageOpenTarget').mockResolvedValue({ ok: true, source: 'conversation-thread' });
    vi.spyOn(imageEditInternals, 'waitForChatGPTImageEditModal').mockResolvedValue({
      pageUrl: 'https://chatgpt.com/c/thread123',
      pageTitle: 'ChatGPT',
      accountTier: 'Pro',
      modalVisible: true,
      editComposerVisible: true,
      editPromptPlaceholder: '描述编辑',
      lightboxThumbnailLabels: ['图片 1：foo', '图片 2：bar'],
    });
    vi.spyOn(imageEditInternals, 'selectChatGPTImageInLightbox').mockResolvedValue({ ok: true, selectedIndex: 2, mode: 'thumbnail-strip' });
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

    const result = await imageEditCommand.func(page, {
      prompt: 'make it beige',
      url: 'https://chatgpt.com/c/thread123',
      image: '2',
    });

    expect(mockOpenConversation).toHaveBeenCalledWith(page, 'https://chatgpt.com/c/thread123');
    expect(mockOpenImages).not.toHaveBeenCalled();
    expect(imageEditInternals.waitForChatGPTImageOpenTarget).toHaveBeenCalledWith(page, 1, 8);
    expect(imageEditInternals.selectChatGPTImageInLightbox).toHaveBeenCalledWith(page, 2);
    expect(result).toEqual([{
      action: 'edit',
      status: 'result_visible',
      page_url: 'https://chatgpt.com/c/edit456',
      page_title: 'ChatGPT',
      account_tier: 'Pro',
      conversation_id: 'edit456',
    }]);
  });

  it('returns blocked when the requested thread image index is unavailable', async () => {
    vi.spyOn(imageEditInternals, 'waitForChatGPTImageOpenTarget').mockResolvedValue({ ok: true, source: 'conversation-thread' });
    vi.spyOn(imageEditInternals, 'waitForChatGPTImageEditModal').mockResolvedValue({
      pageUrl: 'https://chatgpt.com/c/thread123',
      pageTitle: 'ChatGPT',
      accountTier: 'Pro',
      modalVisible: true,
      editComposerVisible: true,
      editPromptPlaceholder: '描述编辑',
    });
    vi.spyOn(imageEditInternals, 'selectChatGPTImageInLightbox').mockResolvedValue({
      ok: false,
      reason: 'Requested image index is not available in this ChatGPT image lightbox.',
    });

    const result = await imageEditCommand.func(page, {
      prompt: 'make it beige',
      url: 'https://chatgpt.com/c/thread123',
      image: '3',
    });

    expect(result).toEqual([{
      action: 'edit',
      status: 'blocked',
      page_url: 'https://chatgpt.com/c/thread123',
      page_title: 'ChatGPT',
      account_tier: 'Pro',
      conversation_id: 'thread123',
      reason: 'image-index-unavailable',
      detail: 'Requested image index is not available in this ChatGPT image lightbox.',
    }]);
  });
});

describe('chatgpt/image-edit helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConversationList.mockResolvedValue([]);
    mockGetCurrentUrl.mockResolvedValue('https://chatgpt.com/images');
  });

  it('keeps My images entries first but still falls back to later visible /images entries', () => {
    const my1 = { id: 'my-1' };
    const my2 = { id: 'my-2' };
    const other3 = { id: 'other-3' };
    const other4 = { id: 'other-4' };

    expect(mergeChatGPTImageEditCandidates([my1, my2], [my1, my2, other3, other4])).toEqual([
      my1,
      my2,
      other3,
      other4,
    ]);
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

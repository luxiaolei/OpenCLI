import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jackwener/opencli/registry', () => ({
  cli: (definition) => definition,
  Strategy: { COOKIE: 'cookie' },
}));

const {
  mockBuildRow,
  mockEnterImageComposer,
  mockGetConversationList,
  mockHasContext,
  mockOpenImages,
  mockOpenConversation,
  mockParseConversationUrl,
  mockParsePositiveInt,
  mockParseTitleMatchMode,
  mockReadCapabilities,
  mockReadCreateState,
  mockRenameConversation,
  mockResolveConversation,
  mockSelectAspect,
  mockSelectMode,
  mockSendPrompt,
  mockUploadReferenceImage,
  mockWaitForState,
} = vi.hoisted(() => ({
  mockBuildRow: vi.fn((snapshot, extra = {}) => ({
    action: 'create',
    status: extra.status || snapshot.status || 'submitted',
    page_url: snapshot.pageUrl || snapshot.url || '',
    page_title: snapshot.pageTitle || snapshot.title || '',
    account_tier: snapshot.accountTier || '',
    ...(extra.modeLabel || snapshot.modeLabel ? { mode_label: extra.modeLabel || snapshot.modeLabel } : {}),
    conversation_id: snapshot.conversationId || '',
    ...(extra.reason ? { reason: extra.reason } : {}),
    ...(extra.detail ? { detail: extra.detail } : {}),
  })),
  mockEnterImageComposer: vi.fn(),
  mockGetConversationList: vi.fn(),
  mockHasContext: vi.fn(),
  mockOpenImages: vi.fn(),
  mockOpenConversation: vi.fn(),
  mockParseConversationUrl: vi.fn(),
  mockParsePositiveInt: vi.fn((value, fallback) => Number.parseInt(String(value ?? fallback), 10) || fallback),
  mockParseTitleMatchMode: vi.fn((value, fallback) => value || fallback),
  mockReadCapabilities: vi.fn(),
  mockReadCreateState: vi.fn(),
  mockRenameConversation: vi.fn(),
  mockResolveConversation: vi.fn(),
  mockSelectAspect: vi.fn(),
  mockSelectMode: vi.fn(),
  mockSendPrompt: vi.fn(),
  mockUploadReferenceImage: vi.fn(),
  mockWaitForState: vi.fn(),
}));

vi.mock('./utils.js', () => ({
  CHATGPT_WEB_DOMAIN: 'chatgpt.com',
  buildChatGPTImageCreateRow: mockBuildRow,
  enterChatGPTImageComposer: mockEnterImageComposer,
  getChatGPTConversationList: mockGetConversationList,
  hasChatGPTImageContext: mockHasContext,
  openChatGPTImages: mockOpenImages,
  openChatGPTConversation: mockOpenConversation,
  parseChatGPTConversationUrl: mockParseConversationUrl,
  parseChatGPTPositiveInt: mockParsePositiveInt,
  parseChatGPTTitleMatchMode: mockParseTitleMatchMode,
  readChatGPTImageCapabilities: mockReadCapabilities,
  readChatGPTImageCreateState: mockReadCreateState,
  renameChatGPTConversation: mockRenameConversation,
  resolveChatGPTConversationForQuery: mockResolveConversation,
  selectChatGPTImageAspect: mockSelectAspect,
  selectChatGPTImageMode: mockSelectMode,
  sendChatGPTImagePrompt: mockSendPrompt,
  uploadChatGPTImageReference: mockUploadReferenceImage,
  waitForChatGPTImageCreateState: mockWaitForState,
}));

import { imageCreateCommand } from './image-create.js';

describe('chatgpt/image-create', () => {
  const page = {};
  const referenceFile = path.join(os.tmpdir(), 'opencli-chatgpt-reference.png');

  beforeEach(() => {
    fs.writeFileSync(referenceFile, Buffer.from('89504e470d0a1a0a', 'hex'));
    vi.clearAllMocks();
    mockEnterImageComposer.mockResolvedValue({ ok: true, method: 'plus-menu', selectedLabel: '创建图片' });
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
    mockGetConversationList.mockResolvedValue([
      { Title: '菜品生成', Url: 'https://chatgpt.com/c/dish123' },
    ]);
    mockParseConversationUrl.mockReturnValue(null);
    mockResolveConversation.mockReturnValue({ Title: '菜品生成', Url: 'https://chatgpt.com/c/dish123' });
    mockSelectAspect.mockResolvedValue({ ok: true, skipped: true, selectedLabel: '', currentLabel: '', availableLabels: [] });
    mockSelectMode.mockResolvedValue({ ok: true, skipped: true, selectedLabel: '', currentLabel: '', availableLabels: [] });
    mockUploadReferenceImage.mockResolvedValue({ ok: true, fileName: 'opencli-chatgpt-reference.png', confirmed: true });
    mockReadCreateState.mockResolvedValue({
      pageUrl: 'https://chatgpt.com/c/dish123',
      pathname: '/c/dish123',
      pageTitle: '菜品生成',
      conversationId: 'dish123',
      resultActions: ['open'],
      resultActionLabels: ['打开图片：菜品生成'],
      isConversationPage: true,
    });
    mockSendPrompt.mockResolvedValue({ ok: true });
    mockRenameConversation.mockResolvedValue({
      ok: true,
      url: 'https://chatgpt.com/c/abc123',
      conversationId: 'abc123',
      threadTitle: '菜品生成 v2',
    });
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

  it('returns blocked when image entry cannot switch the current chat into image mode', async () => {
    mockEnterImageComposer.mockResolvedValue({
      ok: false,
      reason: 'create-image-option-not-found',
      pageUrl: 'https://chatgpt.com/',
      pagePath: '/',
      availableLabels: ['添加照片和文件', '网页搜索'],
    });

    const result = await imageCreateCommand.func(page, { prompt: 'blue mug' });

    expect(mockSendPrompt).not.toHaveBeenCalled();
    expect(result).toEqual([{
      action: 'create',
      status: 'blocked',
      page_url: 'https://chatgpt.com/',
      page_title: '/',
      account_tier: '',
      conversation_id: '',
      reason: 'image-entry-unavailable',
      detail: 'create-image-option-not-found. Available: 添加照片和文件, 网页搜索',
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

  it('blocks --history when the selected conversation is not an image thread', async () => {
    mockReadCreateState.mockResolvedValue({
      pageUrl: 'https://chatgpt.com/c/not-image',
      pathname: '/c/not-image',
      pageTitle: '普通聊天',
      conversationId: 'not-image',
      resultActions: [],
      resultActionLabels: [],
      isConversationPage: true,
    });

    const result = await imageCreateCommand.func(page, {
      prompt: '继续做一版宫保鸡丁菜品海报',
      history: '菜品生成',
      match: 'contains',
    });

    expect(mockSendPrompt).not.toHaveBeenCalled();
    expect(result).toEqual([{
      action: 'create',
      status: 'blocked',
      page_url: 'https://chatgpt.com/c/not-image',
      page_title: '普通聊天',
      account_tier: '',
      conversation_id: 'not-image',
      reason: 'history-not-image-thread',
      detail: 'The selected history target is not an image conversation.',
    }]);
  });

  it('continues an existing image history when --history matches a prior thread title', async () => {
    const result = await imageCreateCommand.func(page, {
      prompt: '继续做一版宫保鸡丁菜品海报',
      history: '菜品生成',
      match: 'contains',
      timeout: '5',
    });

    expect(mockGetConversationList).toHaveBeenCalledWith(page);
    expect(mockResolveConversation).toHaveBeenCalledWith([{ Title: '菜品生成', Url: 'https://chatgpt.com/c/dish123' }], '菜品生成', 'contains');
    expect(mockOpenConversation).toHaveBeenCalledWith(page, 'https://chatgpt.com/c/dish123');
    expect(mockReadCreateState).toHaveBeenCalledWith(page);
    expect(mockEnterImageComposer).toHaveBeenCalledTimes(1);
    expect(mockSendPrompt).toHaveBeenCalledWith(page, '继续做一版宫保鸡丁菜品海报');
    expect(result[0].status).toBe('submitted');
  });

  it('selects the requested thinking / model label before sending the prompt', async () => {
    mockSelectMode.mockResolvedValue({
      ok: true,
      skipped: false,
      selectedLabel: 'Extended',
      currentLabel: 'ChatGPT',
      availableLabels: ['ChatGPT', 'Extended'],
    });

    const result = await imageCreateCommand.func(page, {
      prompt: 'blue mug',
      thinking: 'Extended',
    });

    expect(mockSelectMode).toHaveBeenCalledWith(page, 'Extended');
    expect(mockSendPrompt).toHaveBeenCalledWith(page, 'blue mug');
    expect(result).toEqual([{
      action: 'create',
      status: 'submitted',
      page_url: 'https://chatgpt.com/c/abc123',
      page_title: 'OpenAI ChatGPT',
      account_tier: 'Pro',
      mode_label: 'Extended',
      conversation_id: 'abc123',
    }]);
  });

  it('returns blocked when the requested thinking / model label is unavailable', async () => {
    mockSelectMode.mockResolvedValue({
      ok: false,
      reason: 'mode-option-not-found',
      currentLabel: 'ChatGPT',
      availableLabels: ['ChatGPT', 'Extended'],
    });

    const result = await imageCreateCommand.func(page, {
      prompt: 'blue mug',
      thinking: 'Thinking',
    });

    expect(mockSendPrompt).not.toHaveBeenCalled();
    expect(result).toEqual([{
      action: 'create',
      status: 'blocked',
      page_url: 'https://chatgpt.com/images/',
      page_title: 'ChatGPT 图片 | AI 图片生成器',
      account_tier: 'Pro',
      mode_label: 'ChatGPT',
      conversation_id: '',
      reason: 'thinking-unavailable',
      detail: 'No model / thinking option matched: Thinking. Available: ChatGPT, Extended',
    }]);
  });

  it('uploads a local reference image before sending the prompt when --file is provided', async () => {
    const result = await imageCreateCommand.func(page, {
      prompt: '把这张图改成赛博朋克风格',
      file: referenceFile,
    });

    expect(mockUploadReferenceImage).toHaveBeenCalledWith(page, expect.objectContaining({
      path: referenceFile,
      name: 'opencli-chatgpt-reference.png',
      mimeType: 'image/png',
      base64: expect.any(String),
    }));
    expect(mockSendPrompt).toHaveBeenCalledWith(page, '把这张图改成赛博朋克风格');
    expect(mockUploadReferenceImage.mock.invocationCallOrder[0]).toBeLessThan(mockSendPrompt.mock.invocationCallOrder[0]);
    expect(result[0].status).toBe('submitted');
  });

  it('returns blocked when the requested reference image file is missing', async () => {
    const result = await imageCreateCommand.func(page, {
      prompt: 'use this as reference',
      file: path.join(os.tmpdir(), 'opencli-missing-reference-image.png'),
    });

    expect(mockUploadReferenceImage).not.toHaveBeenCalled();
    expect(mockSendPrompt).not.toHaveBeenCalled();
    expect(result).toEqual([expect.objectContaining({
      status: 'blocked',
      reason: 'file-unavailable',
    })]);
  });

  it('selects the requested aspect ratio before sending the prompt', async () => {
    await imageCreateCommand.func(page, {
      prompt: '做一张横版海报',
      aspect: '16:9',
    });

    expect(mockSelectAspect).toHaveBeenCalledWith(page, '16:9');
    expect(mockSendPrompt).toHaveBeenCalledWith(page, '做一张横版海报');
    expect(mockSelectAspect.mock.invocationCallOrder[0]).toBeLessThan(mockSendPrompt.mock.invocationCallOrder[0]);
  });

  it('uses --size as an alias for aspect ratio selection', async () => {
    await imageCreateCommand.func(page, {
      prompt: '做一张竖版海报',
      size: '9:16',
    });

    expect(mockSelectAspect).toHaveBeenCalledWith(page, '9:16');
    expect(mockSendPrompt).toHaveBeenCalledWith(page, '做一张竖版海报');
  });

  it('returns blocked when the requested aspect ratio cannot be selected', async () => {
    mockSelectAspect.mockResolvedValue({
      ok: false,
      reason: 'aspect-option-not-found',
      currentLabel: '1:1',
      availableLabels: ['1:1', '9:16'],
    });

    const result = await imageCreateCommand.func(page, {
      prompt: '做一张横版海报',
      aspect: '16:9',
    });

    expect(mockSendPrompt).not.toHaveBeenCalled();
    expect(result).toEqual([expect.objectContaining({
      status: 'blocked',
      reason: 'aspect-unavailable',
      detail: 'No image aspect / size option matched: 16:9. Available: 1:1, 9:16',
    })]);
  });

  it('renames the resulting thread when --title is provided', async () => {
    await imageCreateCommand.func(page, {
      prompt: 'blue mug',
      title: '菜品生成 v2',
    });

    expect(mockRenameConversation).toHaveBeenCalledWith(page, 'https://chatgpt.com/c/abc123', '菜品生成 v2');
  });
});

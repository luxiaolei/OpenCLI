import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jackwener/opencli/registry', () => ({
  cli: (definition) => definition,
  Strategy: { COOKIE: 'cookie' },
}));

const {
  mockGetAssets,
  mockGetUrls,
  mockOpenConversation,
  mockParsePositiveInt,
  mockSaveBase64ToFile,
  mockWaitForImages,
} = vi.hoisted(() => ({
  mockGetAssets: vi.fn(),
  mockGetUrls: vi.fn(),
  mockOpenConversation: vi.fn(),
  mockParsePositiveInt: vi.fn((value, fallback) => Number.parseInt(String(value ?? fallback), 10) || fallback),
  mockSaveBase64ToFile: vi.fn(),
  mockWaitForImages: vi.fn(),
}));

vi.mock('@jackwener/opencli/utils', () => ({
  saveBase64ToFile: mockSaveBase64ToFile,
}));

vi.mock('./utils.js', () => ({
  CHATGPT_WEB_DOMAIN: 'chatgpt.com',
  getChatGPTImageAssets: mockGetAssets,
  getChatGPTVisibleImageUrls: mockGetUrls,
  openChatGPTConversation: mockOpenConversation,
  parseChatGPTPositiveInt: mockParsePositiveInt,
  waitForChatGPTImages: mockWaitForImages,
}));

import { imageDownloadCommand } from './image-download.js';

describe('chatgpt/image-download', () => {
  const page = {
    evaluate: vi.fn().mockResolvedValue('https://chatgpt.com/c/abc123'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    page.evaluate.mockResolvedValue('https://chatgpt.com/c/abc123');
    mockGetUrls.mockResolvedValue(['https://cdn.example.com/img-1.png']);
    mockWaitForImages.mockResolvedValue(['https://cdn.example.com/img-1.png']);
    mockGetAssets.mockResolvedValue([
      {
        url: 'https://cdn.example.com/img-1.png',
        dataUrl: 'data:image/png;base64,Zm9v',
        mimeType: 'image/png',
      },
    ]);
  });

  it('downloads the selected visible image from a conversation url', async () => {
    const before = Date.now();
    const rows = await imageDownloadCommand.func(page, {
      url: 'https://chatgpt.com/c/abc123',
      image: '1',
      op: '/tmp/chatgpt-downloads',
      timeout: '12',
    });
    const after = Date.now();

    expect(mockOpenConversation).toHaveBeenCalledWith(page, 'https://chatgpt.com/c/abc123');
    expect(mockParsePositiveInt).toHaveBeenCalledWith('1', 1);
    expect(mockParsePositiveInt).toHaveBeenCalledWith('12', 30);
    expect(mockGetAssets).toHaveBeenCalledWith(page, ['https://cdn.example.com/img-1.png']);
    expect(mockSaveBase64ToFile).toHaveBeenCalledTimes(1);
    const [savedBase64, savedPath] = mockSaveBase64ToFile.mock.calls[0];
    expect(savedBase64).toBe('Zm9v');
    expect(savedPath.startsWith('/tmp/chatgpt-downloads/chatgpt_')).toBe(true);
    const timestamp = Number(savedPath.match(/chatgpt_(\d+)\.png$/)?.[1] || '0');
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
    expect(rows).toEqual([
      {
        status: '✅ saved',
        file: expect.stringContaining('/tmp/chatgpt-downloads/chatgpt_'),
        link: '🔗 https://chatgpt.com/c/abc123',
      },
    ]);
  });

  it('waits for images when the page is initially empty', async () => {
    mockGetUrls.mockResolvedValue([]);

    const rows = await imageDownloadCommand.func(page, {
      timeout: '9',
    });

    expect(mockWaitForImages).toHaveBeenCalledWith(page, [], 9);
    expect(rows[0].status).toBe('✅ saved');
  });

  it('filters out pre-existing visible image URLs before exporting', async () => {
    mockGetUrls.mockResolvedValue([
      'https://cdn.example.com/original-1.png',
      'https://cdn.example.com/new-2.png',
    ]);
    mockGetAssets.mockResolvedValue([
      {
        url: 'https://cdn.example.com/new-2.png',
        dataUrl: 'data:image/png;base64,Zm9v',
        mimeType: 'image/png',
      },
    ]);

    const rows = await imageDownloadCommand.func(page, {
      before_urls: ['https://cdn.example.com/original-1.png'],
      op: '/tmp/chatgpt-downloads',
    });

    expect(mockWaitForImages).not.toHaveBeenCalled();
    expect(mockGetAssets).toHaveBeenCalledWith(page, ['https://cdn.example.com/new-2.png']);
    expect(rows[0].status).toBe('✅ saved');
  });

  it('returns no-images when nothing becomes visible', async () => {
    mockGetUrls.mockResolvedValue([]);
    mockWaitForImages.mockResolvedValue([]);

    const rows = await imageDownloadCommand.func(page, {});

    expect(mockGetAssets).not.toHaveBeenCalled();
    expect(rows).toEqual([
      {
        status: '⚠️ no-images',
        file: '📁 -',
        link: '🔗 https://chatgpt.com/c/abc123',
      },
    ]);
  });

  it('returns an index error when the requested image is missing', async () => {
    mockGetUrls.mockResolvedValue(['https://cdn.example.com/img-1.png']);

    const rows = await imageDownloadCommand.func(page, { image: '2' });

    expect(mockGetAssets).not.toHaveBeenCalled();
    expect(rows).toEqual([
      {
        status: '⚠️ image-2-unavailable',
        file: '📁 -',
        link: '🔗 https://chatgpt.com/c/abc123',
      },
    ]);
  });

  it('returns export-failed when assets cannot be extracted', async () => {
    mockGetAssets.mockResolvedValue([]);

    const rows = await imageDownloadCommand.func(page, {});

    expect(rows).toEqual([
      {
        status: '⚠️ export-failed',
        file: '📁 -',
        link: '🔗 https://chatgpt.com/c/abc123',
      },
    ]);
  });

  it('downloads all visible images when the all shorthand is enabled', async () => {
    mockGetUrls.mockResolvedValue([
      'https://cdn.example.com/img-1.png',
      'https://cdn.example.com/img-2.webp',
    ]);
    mockGetAssets.mockResolvedValue([
      {
        url: 'https://cdn.example.com/img-1.png',
        dataUrl: 'data:image/png;base64,Zm9v',
        mimeType: 'image/png',
      },
      {
        url: 'https://cdn.example.com/img-2.webp',
        dataUrl: 'data:image/webp;base64,YmFy',
        mimeType: 'image/webp',
      },
    ]);

    const rows = await imageDownloadCommand.func(page, {
      all: 'true',
      op: '/tmp/chatgpt-downloads',
    });

    expect(mockGetAssets).toHaveBeenCalledWith(page, [
      'https://cdn.example.com/img-1.png',
      'https://cdn.example.com/img-2.webp',
    ]);
    expect(mockSaveBase64ToFile).toHaveBeenCalledTimes(2);
    expect(mockSaveBase64ToFile.mock.calls[0][0]).toBe('Zm9v');
    expect(mockSaveBase64ToFile.mock.calls[0][1]).toMatch(/^\/tmp\/chatgpt-downloads\/chatgpt_\d+_1\.png$/);
    expect(mockSaveBase64ToFile.mock.calls[1][0]).toBe('YmFy');
    expect(mockSaveBase64ToFile.mock.calls[1][1]).toMatch(/^\/tmp\/chatgpt-downloads\/chatgpt_\d+_2\.webp$/);
    expect(rows).toEqual([
      {
        status: '✅ saved',
        file: expect.stringContaining('/tmp/chatgpt-downloads/chatgpt_'),
        link: '🔗 https://chatgpt.com/c/abc123',
      },
      {
        status: '✅ saved',
        file: expect.stringContaining('/tmp/chatgpt-downloads/chatgpt_'),
        link: '🔗 https://chatgpt.com/c/abc123',
      },
    ]);
  });
});

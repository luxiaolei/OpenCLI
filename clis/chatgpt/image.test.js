import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jackwener/opencli/registry', () => ({
  cli: (definition) => definition,
  Strategy: { COOKIE: 'cookie' },
}));

const {
  mockCreateFunc,
  mockDownloadFunc,
} = vi.hoisted(() => ({
  mockCreateFunc: vi.fn(),
  mockDownloadFunc: vi.fn(),
}));

vi.mock('./image-create.js', () => ({
  imageCreateCommand: {
    func: mockCreateFunc,
  },
}));

vi.mock('./image-download.js', () => ({
  imageDownloadCommand: {
    func: mockDownloadFunc,
  },
}));

import { imageCommand } from './image.js';

describe('chatgpt/image legacy shorthand', () => {
  const page = { wait: vi.fn().mockResolvedValue(undefined) };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateFunc.mockResolvedValue([
      {
        action: 'create',
        status: 'result_visible',
        page_url: 'https://chatgpt.com/c/create123',
        page_title: 'ChatGPT',
        account_tier: 'Pro',
        conversation_id: 'create123',
      },
    ]);
    mockDownloadFunc.mockResolvedValue([
      {
        status: '✅ saved',
        file: '📁 /tmp/chatgpt/chatgpt_123_1.png',
        link: '🔗 https://chatgpt.com/c/create123',
      },
      {
        status: '✅ saved',
        file: '📁 /tmp/chatgpt/chatgpt_123_2.png',
        link: '🔗 https://chatgpt.com/c/create123',
      },
    ]);
  });

  it('routes legacy image generation through the stable image-create plus download chain', async () => {
    const rows = await imageCommand.func(page, {
      prompt: 'blue ceramic mug',
      op: '/tmp/chatgpt',
    });

    expect(mockCreateFunc).toHaveBeenCalledWith(page, {
      prompt: 'blue ceramic mug',
      timeout: '30',
      history: '',
      match: 'contains',
      title: '',
      thinking: '',
      file: '',
      aspect: '',
      size: '',
    });
    expect(mockDownloadFunc).toHaveBeenCalledWith(page, {
      url: 'https://chatgpt.com/c/create123',
      op: '/tmp/chatgpt',
      timeout: '3',
      all: true,
    });
    expect(rows).toEqual([
      {
        status: '✅ saved',
        file: '📁 /tmp/chatgpt/chatgpt_123_1.png',
        link: '🔗 https://chatgpt.com/c/create123',
      },
      {
        status: '✅ saved',
        file: '📁 /tmp/chatgpt/chatgpt_123_2.png',
        link: '🔗 https://chatgpt.com/c/create123',
      },
    ]);
  });

  it('passes create baseline image urls into shorthand auto-download', async () => {
    mockCreateFunc.mockResolvedValue([
      {
        action: 'create',
        status: 'submitted',
        page_url: 'https://chatgpt.com/c/history123',
        page_title: 'ChatGPT',
        account_tier: 'Pro',
        conversation_id: 'history123',
        before_urls: [
          'https://cdn.example.com/original-thread.png',
          'https://cdn.example.com/previous-result.png',
        ],
      },
    ]);

    await imageCommand.func(page, {
      prompt: 'continue the existing image thread',
      history: 'prior poster thread',
      op: '/tmp/chatgpt',
      timeout: '6',
    });

    expect(mockDownloadFunc).toHaveBeenCalledWith(page, {
      url: 'https://chatgpt.com/c/history123',
      op: '/tmp/chatgpt',
      timeout: '3',
      all: true,
      before_urls: [
        'https://cdn.example.com/original-thread.png',
        'https://cdn.example.com/previous-result.png',
      ],
    });
  });

  it('returns the ChatGPT link without downloading when skip-download is enabled', async () => {
    const rows = await imageCommand.func(page, {
      prompt: 'tiny watercolor fox',
      sd: 'true',
    });

    expect(mockCreateFunc).toHaveBeenCalledWith(page, {
      prompt: 'tiny watercolor fox',
      timeout: '30',
      history: '',
      match: 'contains',
      title: '',
      thinking: '',
      file: '',
      aspect: '',
      size: '',
    });
    expect(mockDownloadFunc).not.toHaveBeenCalled();
    expect(rows).toEqual([
      {
        status: '🎨 generated',
        file: '📁 -',
        link: '🔗 https://chatgpt.com/c/create123',
      },
    ]);
  });

  it('does not poll downloads when create returns only the /images workbench link', async () => {
    mockCreateFunc.mockResolvedValue([
      {
        action: 'create',
        status: 'submitted',
        page_url: 'https://chatgpt.com/images/',
        page_title: 'ChatGPT Image 2.0',
        account_tier: 'Pro',
        conversation_id: '',
      },
    ]);

    const rows = await imageCommand.func(page, {
      prompt: 'slow image generation',
      op: '/tmp/chatgpt',
      timeout: '6',
    });

    expect(mockDownloadFunc).not.toHaveBeenCalled();
    expect(rows).toEqual([
      {
        status: '⏳ submitted',
        file: '📁 -',
        link: '🔗 https://chatgpt.com/images/',
      },
    ]);
  });

  it('retries auto-download polling until generated images become visible', async () => {
    mockCreateFunc.mockResolvedValue([
      {
        action: 'create',
        status: 'submitted',
        page_url: 'https://chatgpt.com/c/create789',
        page_title: 'ChatGPT',
        account_tier: 'Pro',
        conversation_id: 'create789',
      },
    ]);
    mockDownloadFunc
      .mockResolvedValueOnce([
        {
          status: '⚠️ no-images',
          file: '📁 -',
          link: '🔗 https://chatgpt.com/c/create789',
        },
      ])
      .mockResolvedValueOnce([
        {
          status: '✅ saved',
          file: '📁 /tmp/chatgpt/chatgpt_789_1.png',
          link: '🔗 https://chatgpt.com/c/create789',
        },
      ]);

    const rows = await imageCommand.func(page, {
      prompt: 'studio product shot',
      op: '/tmp/chatgpt',
      timeout: '6',
    });

    expect(mockDownloadFunc).toHaveBeenCalledTimes(2);
    expect(mockDownloadFunc).toHaveBeenNthCalledWith(1, page, {
      url: 'https://chatgpt.com/c/create789',
      op: '/tmp/chatgpt',
      timeout: '3',
      all: true,
    });
    expect(mockDownloadFunc).toHaveBeenNthCalledWith(2, page, {
      url: 'https://chatgpt.com/c/create789',
      op: '/tmp/chatgpt',
      timeout: '3',
      all: true,
    });
    expect(rows).toEqual([
      {
        status: '✅ saved',
        file: '📁 /tmp/chatgpt/chatgpt_789_1.png',
        link: '🔗 https://chatgpt.com/c/create789',
      },
    ]);
  });

  it('falls back to a submitted link when the thread exists but downloadable images are still not visible after polling', async () => {
    mockCreateFunc.mockResolvedValue([
      {
        action: 'create',
        status: 'submitted',
        page_url: 'https://chatgpt.com/c/create456',
        page_title: 'ChatGPT',
        account_tier: 'Pro',
        conversation_id: 'create456',
      },
    ]);
    mockDownloadFunc
      .mockResolvedValueOnce([
        {
          status: '⚠️ no-images',
          file: '📁 -',
          link: '🔗 https://chatgpt.com/c/create456',
        },
      ])
      .mockResolvedValueOnce([
        {
          status: '⚠️ no-images',
          file: '📁 -',
          link: '🔗 https://chatgpt.com/c/create456',
        },
      ]);

    const rows = await imageCommand.func(page, {
      prompt: 'studio product shot',
      timeout: '6',
    });

    expect(mockDownloadFunc).toHaveBeenCalledTimes(2);
    expect(rows).toEqual([
      {
        status: '⏳ submitted',
        file: '📁 -',
        link: '🔗 https://chatgpt.com/c/create456',
      },
    ]);
  });

  it('passes the requested thinking / model label through to image-create', async () => {
    await imageCommand.func(page, {
      prompt: '继续做新品海报',
      thinking: 'Extended',
      sd: 'true',
    });

    expect(mockCreateFunc).toHaveBeenCalledWith(page, {
      prompt: '继续做新品海报',
      timeout: '30',
      history: '',
      match: 'contains',
      title: '',
      thinking: 'Extended',
      file: '',
      aspect: '',
      size: '',
    });
  });

  it('passes reference image and aspect ratio options through to image-create', async () => {
    await imageCommand.func(page, {
      prompt: '参考这张图做一张横版海报',
      file: '/tmp/reference.png',
      aspect: '16:9',
      sd: 'true',
    });

    expect(mockCreateFunc).toHaveBeenCalledWith(page, {
      prompt: '参考这张图做一张横版海报',
      timeout: '30',
      history: '',
      match: 'contains',
      title: '',
      thinking: '',
      file: '/tmp/reference.png',
      aspect: '16:9',
      size: '',
    });
  });

  it('passes history selection and requested title through to image-create', async () => {
    await imageCommand.func(page, {
      prompt: '继续做新品海报',
      history: '菜品生成',
      match: 'exact',
      title: '菜品生成 v2',
      sd: 'true',
    });

    expect(mockCreateFunc).toHaveBeenCalledWith(page, {
      prompt: '继续做新品海报',
      timeout: '30',
      history: '菜品生成',
      match: 'exact',
      title: '菜品生成 v2',
      thinking: '',
      file: '',
      aspect: '',
      size: '',
    });
  });
});

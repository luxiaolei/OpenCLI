import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jackwener/opencli/registry', () => ({
  cli: (definition) => definition,
  Strategy: { COOKIE: 'cookie' },
}));

const {
  mockBuildRows,
  mockOpenImages,
  mockReadCapabilities,
} = vi.hoisted(() => ({
  mockBuildRows: vi.fn((snapshot) => [{ Category: 'page', Name: 'url', Value: snapshot.url || '' }]),
  mockOpenImages: vi.fn(),
  mockReadCapabilities: vi.fn(),
}));

vi.mock('./utils.js', () => ({
  CHATGPT_WEB_DOMAIN: 'chatgpt.com',
  buildChatGPTImageCapabilityRows: mockBuildRows,
  openChatGPTImages: mockOpenImages,
  readChatGPTImageCapabilities: mockReadCapabilities,
}));

import { imageCapabilitiesCommand } from './image-capabilities.js';

describe('chatgpt/image-capabilities', () => {
  const page = {};

  beforeEach(() => {
    vi.clearAllMocks();
    mockReadCapabilities.mockResolvedValue({
      url: 'https://chatgpt.com/images/',
      accountTier: 'Pro',
      styleCards: ['漫画风潮'],
    });
  });

  it('opens the images workbench and returns capability rows', async () => {
    const result = await imageCapabilitiesCommand.func(page, {});
    expect(mockOpenImages).toHaveBeenCalledTimes(1);
    expect(mockReadCapabilities).toHaveBeenCalledWith(page);
    expect(mockBuildRows).toHaveBeenCalledWith({
      url: 'https://chatgpt.com/images/',
      accountTier: 'Pro',
      styleCards: ['漫画风潮'],
    });
    expect(result).toEqual([{ Category: 'page', Name: 'url', Value: 'https://chatgpt.com/images/' }]);
  });

  it('preserves blocked not-signed-in rows from the capability reader', async () => {
    mockReadCapabilities.mockResolvedValue({
      url: 'https://chatgpt.com/auth/login?next=%2Fimages%2F',
      title: '开始使用 | ChatGPT',
      isSignedIn: false,
    });
    mockBuildRows.mockReturnValueOnce([
      { Category: 'page', Name: 'url', Value: 'https://chatgpt.com/auth/login?next=%2Fimages%2F' },
      { Category: 'state', Name: 'status', Value: 'blocked' },
      { Category: 'state', Name: 'reason', Value: 'not-signed-in' },
    ]);

    const result = await imageCapabilitiesCommand.func(page, {});

    expect(result).toEqual([
      { Category: 'page', Name: 'url', Value: 'https://chatgpt.com/auth/login?next=%2Fimages%2F' },
      { Category: 'state', Name: 'status', Value: 'blocked' },
      { Category: 'state', Name: 'reason', Value: 'not-signed-in' },
    ]);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jackwener/opencli/registry', () => ({
  cli: (definition) => definition,
  Strategy: { COOKIE: 'cookie' },
}));

const {
  mockGetConversationList,
  mockOpenImages,
} = vi.hoisted(() => ({
  mockGetConversationList: vi.fn(),
  mockOpenImages: vi.fn(),
}));

vi.mock('./utils.js', () => ({
  CHATGPT_WEB_DOMAIN: 'chatgpt.com',
  getChatGPTConversationList: mockGetConversationList,
  openChatGPTImages: mockOpenImages,
}));

import { historyListCommand } from './history-list.js';

describe('chatgpt/history-list', () => {
  const page = {};

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConversationList.mockResolvedValue([
      { Title: '菜品生成', Url: 'https://chatgpt.com/c/dish123', Current: true },
      { Title: '产品图修图', Url: 'https://chatgpt.com/c/image456', Current: false },
    ]);
  });

  it('opens ChatGPT images and lists visible history rows', async () => {
    const rows = await historyListCommand.func(page, {});

    expect(mockOpenImages).toHaveBeenCalledTimes(1);
    expect(mockGetConversationList).toHaveBeenCalledWith(page);
    expect(rows).toEqual([
      { title: '菜品生成', url: 'https://chatgpt.com/c/dish123', current: 'yes' },
      { title: '产品图修图', url: 'https://chatgpt.com/c/image456', current: '' },
    ]);
  });
});

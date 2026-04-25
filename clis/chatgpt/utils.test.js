import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deleteChatGPTConversation,
  enterChatGPTImageComposer,
  getChatGPTConversationList,
  hasChatGPTImageContext,
  renameChatGPTConversation,
  selectChatGPTImageAspect,
  selectChatGPTImageMode,
  uploadChatGPTImageReference,
  waitForChatGPTImages,
} from './utils.js';

class FakeHTMLElement {
  constructor({ href = '', text = '', ariaCurrent = '' } = {}) {
    this.href = href;
    this.innerText = text;
    this.textContent = text;
    this._attrs = new Map();
    if (href) this._attrs.set('href', href);
    if (ariaCurrent) this._attrs.set('aria-current', ariaCurrent);
  }

  getAttribute(name) {
    return this._attrs.get(name) ?? '';
  }

  dispatchEvent() {}

  querySelectorAll() {
    return [];
  }

  getBoundingClientRect() {
    return { width: 100, height: 20 };
  }
}

class FakeHTMLInputElement extends FakeHTMLElement {
  constructor(attrs = {}) {
    super();
    this._attrs = new Map(Object.entries(attrs));
    this.files = [];
  }
}

describe('chatgpt utils', () => {
  afterEach(() => {
    delete global.window;
    delete global.document;
    delete global.HTMLElement;
    vi.restoreAllMocks();
  });

  it('lists visible conversations and marks the current one', async () => {
    const anchors = [
      new FakeHTMLElement({ href: '/c/current-123', text: 'Current thread', ariaCurrent: 'page' }),
      new FakeHTMLElement({ href: '/c/older-456', text: 'Older thread' }),
    ];
    const page = {
      evaluate: vi.fn(async (script) => {
        const windowObject = {
          location: {
            href: 'https://chatgpt.com/c/current-123',
            pathname: '/c/current-123',
            origin: 'https://chatgpt.com',
          },
          getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
        };
        const documentObject = {
          querySelectorAll: (selector) => selector === 'a[href]' ? anchors : [],
        };
        return Function('window', 'document', 'HTMLElement', 'Element', `return (${script});`)(
          windowObject,
          documentObject,
          FakeHTMLElement,
          FakeHTMLElement,
        );
      }),
    };

    await expect(getChatGPTConversationList(page)).resolves.toEqual([
      {
        Title: 'Current thread',
        Url: 'https://chatgpt.com/c/current-123',
        Current: true,
      },
      {
        Title: 'Older thread',
        Url: 'https://chatgpt.com/c/older-456',
        Current: false,
      },
    ]);
  });

  it('enters ChatGPT image mode from a normal chat via plus menu create image', async () => {
    let currentPath = '/';
    let currentUrl = 'https://chatgpt.com/';
    let menuOpen = false;
    let imageContext = false;
    const plusButton = new FakeHTMLElement({ text: '', ariaCurrent: '' });
    plusButton._attrs.set('id', 'composer-plus-btn');
    plusButton._attrs.set('aria-label', '添加文件等');
    plusButton.click = () => { menuOpen = true; };
    const createImageOption = new FakeHTMLElement({ text: '创建图片' });
    createImageOption.click = () => {
      menuOpen = false;
      imageContext = true;
      currentPath = '/c/image-thread';
      currentUrl = 'https://chatgpt.com/c/image-thread';
    };
    const promptTextarea = new FakeHTMLElement();
    promptTextarea._attrs.set('placeholder', '描述或编辑图片');
    const imageModeButton = new FakeHTMLElement({ text: '图片' });
    const aspectButton = new FakeHTMLElement({ text: '自动' });
    aspectButton._attrs.set('aria-label', 'Choose image aspect ratio');
    const menuRoot = new FakeHTMLElement();
    menuRoot.querySelectorAll = () => menuOpen ? [createImageOption] : [];
    const mainRoot = new FakeHTMLElement();
    mainRoot.querySelectorAll = (selector) => {
      if (selector.includes('textarea') || selector.includes('[contenteditable')) return imageContext ? [promptTextarea] : [];
      if (selector.includes('#composer-plus-btn')) return [plusButton];
      if (selector.includes('button') || selector.includes('[role="button"]')) {
        return imageContext ? [plusButton, imageModeButton, aspectButton] : [plusButton];
      }
      return [];
    };

    const page = {
      evaluate: vi.fn(async (script) => {
        const windowObject = {
          location: {
            get href() { return currentUrl; },
            get pathname() { return currentPath; },
          },
          getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
          PointerEvent: class PointerEvent {},
          MouseEvent: class MouseEvent {},
        };
        const documentObject = {
          querySelectorAll: (selector) => {
            if (selector === 'main' || selector === '[role="main"]') return [mainRoot];
            if (selector.includes('[data-radix-popper-content-wrapper]') || selector.includes('[role="menu"]') || selector.includes('[role="dialog"]') || selector.includes('[data-state="open"]')) {
              return menuOpen ? [menuRoot] : [];
            }
            return [];
          },
          body: { dispatchEvent: () => {} },
        };
        return await Function('window', 'document', 'HTMLElement', 'Element', 'MouseEvent', `return (${script});`)(
          windowObject,
          documentObject,
          FakeHTMLElement,
          FakeHTMLElement,
          class MouseEvent {},
        );
      }),
    };

    await expect(enterChatGPTImageComposer(page)).resolves.toEqual(expect.objectContaining({
      ok: true,
      method: 'plus-menu',
      selectedLabel: '创建图片',
      pagePath: '/c/image-thread',
      imageModeButtonLabel: '图片',
      aspectButtonLabel: '自动 Choose image aspect ratio',
    }));
  });

  it('treats an in-thread image composer as valid image context outside /images', () => {
    expect(hasChatGPTImageContext({
      url: 'https://chatgpt.com/c/image-thread',
      isImagesPage: false,
      isImageComposer: true,
      promptPlaceholder: '描述或编辑图片',
      uploadInputs: ['upload-photo (image/*)'],
    })).toBe(true);
  });

  it('uses the model-switcher test id as a valid selector anchor for thinking selection', async () => {
    const clicked = [];
    const optionExtended = new FakeHTMLElement({ text: 'Extended' });
    optionExtended.click = () => { clicked.push('Extended'); };
    const menuRoot = new FakeHTMLElement();
    menuRoot.querySelectorAll = (selector) => selector.includes('[role="menuitem"]')
      ? [optionExtended]
      : [];
    const modelSelector = new FakeHTMLElement({ text: 'ChatGPT' });
    modelSelector.click = () => { clicked.push('selector'); };
    modelSelector._attrs.set('data-testid', 'model-switcher-dropdown-button');

    const page = {
      evaluate: vi.fn(async (script) => {
        const windowObject = {
          getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
        };
        const documentObject = {
          querySelectorAll: (selector) => {
            if (selector.includes('model-switcher-dropdown-button')) return [modelSelector];
            if (selector.includes('[data-radix-popper-content-wrapper]')) return [menuRoot];
            return [];
          },
          body: { dispatchEvent: () => {} },
        };
        return await Function('window', 'document', 'HTMLElement', 'Element', 'MouseEvent', `return (${script});`)(
          windowObject,
          documentObject,
          FakeHTMLElement,
          FakeHTMLElement,
          class MouseEvent {},
        );
      }),
    };

    await expect(selectChatGPTImageMode(page, 'Extended')).resolves.toEqual(expect.objectContaining({
      ok: true,
      selectedLabel: 'Extended',
    }));
    expect(clicked).toEqual(['selector', 'Extended']);
  });

  it('selects a visible ChatGPT image aspect ratio option', async () => {
    const clicked = [];
    const option = new FakeHTMLElement({ text: '16:9' });
    option.click = () => { clicked.push('16:9'); };
    const page = {
      evaluate: vi.fn(async (script) => {
        const windowObject = {
          getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
        };
        const documentObject = {
          querySelectorAll: (selector) => {
            if (selector.includes('[data-radix-popper-content-wrapper]')) return [];
            if (selector.includes('button')) return [option];
            return [];
          },
          body: { dispatchEvent: () => {} },
        };
        return await Function('window', 'document', 'HTMLElement', 'Element', 'MouseEvent', `return (${script});`)(
          windowObject,
          documentObject,
          FakeHTMLElement,
          FakeHTMLElement,
          class MouseEvent {},
        );
      }),
    };

    await expect(selectChatGPTImageAspect(page, '16:9')).resolves.toEqual(expect.objectContaining({
      ok: true,
      selectedLabel: '16:9',
    }));
    expect(clicked).toEqual(['16:9']);
  });

  it('opens the ChatGPT Images auto aspect dropdown before selecting a widescreen option', async () => {
    const clicked = [];
    let menuOpen = false;
    const option = new FakeHTMLElement({ text: '宽屏 16:9' });
    option.click = () => { clicked.push('宽屏 16:9'); };
    const menuRoot = new FakeHTMLElement({ text: 'Choose image aspect ratio' });
    menuRoot.querySelectorAll = (selector) => selector.includes('[role="menuitem"]')
      ? [option]
      : [];
    const autoTrigger = new FakeHTMLElement({ text: '自动' });
    autoTrigger.click = () => {
      clicked.push('自动');
      menuOpen = true;
    };
    const page = {
      evaluate: vi.fn(async (script) => {
        const windowObject = {
          getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
        };
        const documentObject = {
          querySelectorAll: (selector) => {
            if (selector.includes('[data-radix-popper-content-wrapper]') || selector.includes('[role="menu"]')) {
              return menuOpen ? [menuRoot] : [];
            }
            if (selector.includes('button')) return [autoTrigger];
            return [];
          },
          body: { dispatchEvent: () => {} },
        };
        return await Function('window', 'document', 'HTMLElement', 'Element', 'MouseEvent', `return (${script});`)(
          windowObject,
          documentObject,
          FakeHTMLElement,
          FakeHTMLElement,
          class MouseEvent {},
        );
      }),
    };

    await expect(selectChatGPTImageAspect(page, '16:9')).resolves.toEqual(expect.objectContaining({
      ok: true,
      selectedLabel: '宽屏 16:9',
      triggerLabel: '自动',
    }));
    expect(clicked).toEqual(['自动', '宽屏 16:9']);
  });

  it('assigns a reference image payload to a ChatGPT image file input', async () => {
    let bodyText = '';
    const input = new FakeHTMLInputElement({ accept: 'image/png,image/jpeg' });
    input.dispatchEvent = (event) => {
      if (event?.type === 'change') bodyText = 'reference.png';
    };
    const page = {
      evaluate: vi.fn(async (script) => {
        class FakeFile {
          constructor(chunks, name, opts = {}) {
            this.chunks = chunks;
            this.name = name;
            this.type = opts.type || '';
          }
        }
        class FakeDataTransfer {
          constructor() {
            this._files = [];
            this.items = { add: (file) => this._files.push(file) };
          }
          get files() { return this._files; }
        }
        class FakeEvent {
          constructor(type) { this.type = type; }
        }
        const windowObject = {
          getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
        };
        const documentObject = {
          body: {
            get innerText() { return bodyText; },
            get textContent() { return bodyText; },
          },
          querySelectorAll: (selector) => {
            if (selector === 'input[type="file"]') return [input];
            return [];
          },
        };
        return await Function('window', 'document', 'HTMLElement', 'HTMLInputElement', 'Element', 'File', 'DataTransfer', 'Event', 'atob', `return (${script});`)(
          windowObject,
          documentObject,
          FakeHTMLElement,
          FakeHTMLInputElement,
          FakeHTMLElement,
          FakeFile,
          FakeDataTransfer,
          FakeEvent,
          atob,
        );
      }),
    };

    await expect(uploadChatGPTImageReference(page, {
      name: 'reference.png',
      mimeType: 'image/png',
      base64: Buffer.from('png').toString('base64'),
    })).resolves.toEqual(expect.objectContaining({
      ok: true,
      fileName: 'reference.png',
      confirmed: true,
    }));
    expect(input.files[0].name).toBe('reference.png');
  });

  it('navigates to the target conversation before renaming via sidebar actions', async () => {
    const page = {
      goto: vi.fn(async () => {}),
      wait: vi.fn(async () => {}),
      evaluate: vi.fn(async () => ({ ok: true, action: 'rename', threadTitle: 'Renamed thread' })),
    };

    await renameChatGPTConversation(page, 'https://chatgpt.com/c/rename-123', 'Renamed thread');

    expect(page.goto).toHaveBeenCalledWith('https://chatgpt.com/c/rename-123', { waitUntil: 'load', settleMs: 2500 });
    expect(page.wait).toHaveBeenCalledWith({ time: 1 });
    expect(page.evaluate).toHaveBeenCalledTimes(1);
  });

  it('navigates to the target conversation before deleting via sidebar actions', async () => {
    const page = {
      goto: vi.fn(async () => {}),
      wait: vi.fn(async () => {}),
      evaluate: vi.fn(async () => ({ ok: true, action: 'delete' })),
    };

    await deleteChatGPTConversation(page, 'https://chatgpt.com/c/delete-123');

    expect(page.goto).toHaveBeenCalledWith('https://chatgpt.com/c/delete-123', { waitUntil: 'load', settleMs: 2500 });
    expect(page.wait).toHaveBeenCalledWith({ time: 1 });
    expect(page.evaluate).toHaveBeenCalledTimes(1);
  });

  it('uses fixed waits while polling for newly generated ChatGPT images', async () => {
    const visibleUrlRounds = [
      ['https://cdn.example.com/original.png'],
      ['https://cdn.example.com/original.png', 'https://cdn.example.com/edited.png'],
      ['https://cdn.example.com/original.png', 'https://cdn.example.com/edited.png'],
    ];
    const page = {
      wait: vi.fn().mockResolvedValue(undefined),
      evaluate: vi.fn(async (script) => {
        const source = String(script);
        if (source.includes("label === 'Stop generating'")) return false;
        if (source.includes("document.querySelectorAll('img')")) {
          return visibleUrlRounds.shift() ?? ['https://cdn.example.com/original.png', 'https://cdn.example.com/edited.png'];
        }
        throw new Error(`Unexpected script: ${source.slice(0, 80)}`);
      }),
    };

    const urls = await waitForChatGPTImages(page, ['https://cdn.example.com/original.png'], 6);

    expect(urls).toEqual(['https://cdn.example.com/edited.png']);
    expect(page.wait).toHaveBeenNthCalledWith(1, { time: 3 });
    expect(page.wait).toHaveBeenNthCalledWith(2, { time: 3 });
  });
});

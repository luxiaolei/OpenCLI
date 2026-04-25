import * as os from 'node:os';
import * as path from 'node:path';
import { cli, Strategy } from '@jackwener/opencli/registry';
import {
  CHATGPT_WEB_DOMAIN,
  extractChatGPTConversationId,
  getChatGPTConversationList,
  getChatGPTVisibleImageUrls,
  getCurrentChatGPTUrl,
  hasChatGPTImageContext,
  openChatGPTConversation,
  openChatGPTImages,
  parseChatGPTConversationUrl,
  parseChatGPTPositiveInt,
  readChatGPTImageCapabilities,
} from './utils.js';
import { imageDownloadCommand } from './image-download.js';
import { pollChatGPTImageDownloads } from './image-auto-download.js';

const CHATGPT_IMAGE_EDIT_COMPOSER_SELECTORS = [
  '[data-testid="modal-lightbox-new"] textarea[placeholder*="描述编辑"]',
  '[data-testid="modal-lightbox-new"] textarea[placeholder*="Describe edit"]',
  '[data-testid="modal-lightbox-new"] textarea',
  '[data-testid="modal-lightbox-new"] [contenteditable="true"][role="textbox"]',
  '[data-testid="modal-lightbox-new"] [contenteditable="true"]',
  '[role="dialog"] textarea[placeholder*="描述编辑"]',
  '[role="dialog"] textarea[placeholder*="Describe edit"]',
  '[role="dialog"] textarea',
  '[role="dialog"] [contenteditable="true"][role="textbox"]',
  '[role="dialog"] [contenteditable="true"]',
];

const CHATGPT_IMAGE_EDIT_SEND_BUTTON_SELECTORS = [
  '[data-testid="modal-lightbox-new"] #composer-submit-button',
  '[data-testid="modal-lightbox-new"] button[data-testid="send-button"]',
  '[data-testid="modal-lightbox-new"] button[aria-label="发送提示"]',
  '[data-testid="modal-lightbox-new"] button[aria-label="Send prompt"]',
  '[role="dialog"] #composer-submit-button',
  '[role="dialog"] button[data-testid="send-button"]',
  '[role="dialog"] button[aria-label="发送提示"]',
  '[role="dialog"] button[aria-label="Send prompt"]',
];

const CHATGPT_IMAGE_EDIT_STOP_BUTTON_SELECTORS = [
  '[data-testid="modal-lightbox-new"] button[data-testid="stop-button"]',
  '[data-testid="modal-lightbox-new"] button[aria-label="停止流式传输"]',
  '[data-testid="modal-lightbox-new"] button[aria-label="Stop streaming"]',
  '[role="dialog"] button[data-testid="stop-button"]',
  '[role="dialog"] button[aria-label="停止流式传输"]',
  '[role="dialog"] button[aria-label="Stop streaming"]',
];

function parseChatGPTImageEditIndex(value, fallback = 1) {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeBooleanFlag(value) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}

function expandHomePath(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (raw === '~') return os.homedir();
  if (raw.startsWith('~/')) return path.join(os.homedir(), raw.slice(2));
  return raw;
}

async function waitForChatGPTImageSettle(page, seconds = 1) {
  if (!page || typeof page.wait !== 'function') return;
  try {
    await page.wait({ time: seconds });
  } catch {
    await page.wait(seconds);
  }
}

export function mergeChatGPTImageEditCandidates(preferredItems, fallbackItems) {
  const merged = [];
  const seen = new Set();
  for (const item of [
    ...(Array.isArray(preferredItems) ? preferredItems : []),
    ...(Array.isArray(fallbackItems) ? fallbackItems : []),
  ]) {
    if (seen.has(item)) continue;
    seen.add(item);
    merged.push(item);
  }
  return merged;
}

function buildOpenImageForEditScript(openIndex = 1) {
  return `((requestedIndex) => {
    const clean = (value) => String(value ?? '')
      .replace(/\\u00a0/g, ' ')
      .replace(/\\s+/g, ' ')
      .trim();

    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const textOf = (node) => clean(node instanceof HTMLElement ? (node.innerText || node.textContent || '') : '');
    const attrOf = (node, name) => clean(node instanceof Element ? (node.getAttribute(name) || '') : '');
    const lower = (value) => clean(value).toLowerCase();
    const queryVisible = (root, selector) => Array.from(root.querySelectorAll(selector)).find((node) => isVisible(node)) || null;
    const currentPath = window.location.pathname || '';
    const index = Number.isFinite(Number(requestedIndex)) && Number(requestedIndex) > 0 ? Number(requestedIndex) : 1;

    const findSectionByHeading = (headings) => Array.from(document.querySelectorAll('section')).find((section) => isVisible(section) && headings.some((heading) => textOf(section).includes(heading))) || null;
    const isOpenImageButton = (node) => {
      const label = lower(attrOf(node, 'aria-label') || textOf(node));
      return label.includes('打开图片') || label.includes('open image');
    };

    const collectConversationImageTriggers = () => {
      const seen = new Set();
      const items = [];
      const isConversationImageControl = (node) => {
        const label = lower(attrOf(node, 'aria-label') || textOf(node));
        return label.includes('已生成图片')
          || label.includes('generated image')
          || label.includes('打开图片')
          || label.includes('open image')
          || label.includes('编辑图片')
          || label.includes('edit image');
      };
      const push = (node) => {
        if (!(node instanceof HTMLElement)) return;
        if (seen.has(node)) return;
        if (!isVisible(node)) return;
        if (!node.querySelector('img') && !isConversationImageControl(node)) return;
        seen.add(node);
        items.push(node);
      };

      Array.from(document.querySelectorAll('[id^="image-"] [role="button"], [id^="image-"] button, [id^="image-"] [tabindex="0"]')).forEach(push);
      Array.from(document.querySelectorAll('section [role="button"], section button, main [role="button"], main button')).forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        if (!isConversationImageControl(node) && !node.querySelector('img')) return;
        if (!(node.closest('[id^="image-"]') || node.closest('[data-testid^="conversation-turn-"]'))) return;
        push(node);
      });
      return items;
    };

    let button = null;
    let source = '';
    let availableCount = 0;

    if (currentPath.startsWith('/images')) {
      const mergeCandidates = function mergeChatGPTImageEditCandidates(preferredItems, fallbackItems) {
  const merged = [];
  const seen = new Set();
  for (const item of [
    ...(Array.isArray(preferredItems) ? preferredItems : []),
    ...(Array.isArray(fallbackItems) ? fallbackItems : []),
  ]) {
    if (seen.has(item)) continue;
    seen.add(item);
    merged.push(item);
  }
  return merged;
};
      const myImagesSection = findSectionByHeading(['我的图片', 'My images']);
      const preferredButtons = Array.from((myImagesSection || document).querySelectorAll('button, [role="button"], a'))
        .filter((node) => isVisible(node) && isOpenImageButton(node));
      const fallbackButtons = Array.from(document.querySelectorAll('button, [role="button"], a'))
        .filter((node) => isVisible(node) && isOpenImageButton(node));
      const candidates = mergeCandidates(preferredButtons, fallbackButtons);
      availableCount = candidates.length;
      button = candidates[index - 1] || null;
      source = preferredButtons.length > 0 ? 'images-my-images-first' : 'images-page';
    } else if (currentPath.startsWith('/c/')) {
      const candidates = collectConversationImageTriggers();
      availableCount = candidates.length;
      button = candidates[index - 1] || null;
      source = 'conversation-thread';
    } else {
      return {
        ok: false,
        reason: 'ChatGPT image edit requires either /images or a conversation thread.',
        pagePath: currentPath,
      };
    }

    if (!(button instanceof HTMLElement)) {
      return {
        ok: false,
        reason: currentPath.startsWith('/images')
          ? 'No visible Open image entry was found for the requested index on ChatGPT Images.'
          : 'No visible generated image entry was found for the requested index in this ChatGPT conversation.',
        availableCount,
        requestedIndex: index,
        source,
      };
    }

    button.click();

    const modalRoot = queryVisible(document, '[data-testid="modal-lightbox-new"]') || queryVisible(document, '[role="dialog"]');
    return {
      ok: true,
      openLabel: attrOf(button, 'aria-label') || textOf(button),
      modalVisible: Boolean(modalRoot),
      requestedIndex: index,
      availableCount,
      source,
    };
  })(${JSON.stringify(openIndex)})`;
}

function buildSelectImageInLightboxScript(imageIndex = 1) {
  return `((requestedIndex) => {
    const clean = (value) => String(value ?? '')
      .replace(/\\u00a0/g, ' ')
      .replace(/\\s+/g, ' ')
      .trim();

    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const attrOf = (node, name) => clean(node instanceof Element ? (node.getAttribute(name) || '') : '');
    const lower = (value) => clean(value).toLowerCase();
    const queryVisible = (root, selector) => Array.from(root.querySelectorAll(selector)).find((node) => isVisible(node)) || null;
    const index = Number.isFinite(Number(requestedIndex)) && Number(requestedIndex) > 0 ? Number(requestedIndex) : 1;
    const modalRoot = queryVisible(document, '[data-testid="modal-lightbox-new"]') || queryVisible(document, '[role="dialog"]');

    if (!(modalRoot instanceof HTMLElement)) {
      return { ok: false, reason: 'ChatGPT image lightbox was not open.' };
    }

    const thumbnails = Array.from(modalRoot.querySelectorAll('button[aria-label]'))
      .filter((node) => isVisible(node))
      .filter((node) => {
        const label = lower(attrOf(node, 'aria-label'));
        return label.includes('图片 ') || label.includes('图片：') || label.includes('image ');
      });

    if (thumbnails.length === 0) {
      return index === 1
        ? { ok: true, selectedIndex: 1, availableCount: 1, mode: 'single-image' }
        : { ok: false, reason: 'Requested image index is not available in this ChatGPT image lightbox.', availableCount: 1, requestedIndex: index };
    }

    const button = thumbnails[index - 1] || null;
    if (!(button instanceof HTMLElement)) {
      return {
        ok: false,
        reason: 'Requested image index is not available in this ChatGPT image lightbox.',
        availableCount: thumbnails.length,
        requestedIndex: index,
      };
    }

    button.click();
    return {
      ok: true,
      selectedIndex: index,
      availableCount: thumbnails.length,
      label: attrOf(button, 'aria-label'),
      mode: 'thumbnail-strip',
    };
  })(${JSON.stringify(imageIndex)})`;
}

function buildImageEditStateScript() {
  const composerSelectorsJson = JSON.stringify(CHATGPT_IMAGE_EDIT_COMPOSER_SELECTORS);
  const sendSelectorsJson = JSON.stringify(CHATGPT_IMAGE_EDIT_SEND_BUTTON_SELECTORS);
  const stopSelectorsJson = JSON.stringify(CHATGPT_IMAGE_EDIT_STOP_BUTTON_SELECTORS);
  return `(() => {
    const clean = (value) => String(value ?? '')
      .replace(/\\u00a0/g, ' ')
      .replace(/\\s+/g, ' ')
      .trim();

    const uniq = (items) => Array.from(new Set(items.map((item) => clean(item)).filter(Boolean)));
    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const textOf = (node) => clean(node instanceof HTMLElement ? (node.innerText || node.textContent || '') : '');
    const attrOf = (node, name) => clean(node instanceof Element ? (node.getAttribute(name) || '') : '');
    const lower = (value) => clean(value).toLowerCase();
    const queryVisible = (root, selector) => Array.from(root.querySelectorAll(selector)).find((node) => isVisible(node)) || null;
    const findFirstVisibleIn = (root, selectors) => {
      const searchRoot = root instanceof Element || root instanceof Document ? root : document;
      for (const selector of selectors) {
        const found = Array.from(searchRoot.querySelectorAll(selector)).find((node) => isVisible(node));
        if (found instanceof HTMLElement) return found;
      }
      return null;
    };
    const combinedLabel = (node) => clean([textOf(node), attrOf(node, 'aria-label')].filter(Boolean).join(' '));

    const accountButton = document.querySelector('[data-testid="accounts-profile-button"]');
    const modalRoot = queryVisible(document, '[data-testid="modal-lightbox-new"]') || queryVisible(document, '[role="dialog"]');
    const modalDialog = queryVisible(document, '[data-testid="modal-lightbox-new"] [role="dialog"]') || queryVisible(document, '[role="dialog"]');
    const modalScope = modalRoot || modalDialog || document;

    let editComposer = findFirstVisibleIn(modalScope, ${composerSelectorsJson});
    if (!(editComposer instanceof HTMLElement)) {
      editComposer = Array.from(modalScope.querySelectorAll('textarea, [contenteditable="true"], [role="textbox"]'))
        .find((node) => isVisible(node)) || null;
    }

    let sendButton = findFirstVisibleIn(modalScope, ${sendSelectorsJson});
    if (!(sendButton instanceof HTMLElement)) {
      sendButton = Array.from(modalScope.querySelectorAll('button, [role="button"]')).find((node) => {
        if (!isVisible(node)) return false;
        const label = lower(combinedLabel(node));
        return label.includes('发送提示') || label.includes('send prompt');
      }) || null;
    }

    let stopButton = findFirstVisibleIn(modalScope, ${stopSelectorsJson});
    if (!(stopButton instanceof HTMLElement)) {
      stopButton = Array.from(modalScope.querySelectorAll('button, [role="button"]')).find((node) => {
        if (!isVisible(node)) return false;
        const label = lower(combinedLabel(node));
        return label.includes('停止流式传输') || label.includes('stop streaming');
      }) || null;
    }

    const actionSelectors = '[data-testid="image-gen-overlay-left-actions"] button, [data-testid="image-gen-overlay-right-actions"] button, button, [role="button"], a';
    const resultActionLabels = uniq(Array.from(document.querySelectorAll(actionSelectors))
      .filter((node) => isVisible(node))
      .map((node) => attrOf(node, 'aria-label') || textOf(node))
      .filter((label) => {
        const normalized = lower(label);
        return normalized.includes('打开图片') || normalized.includes('open image')
          || normalized.includes('编辑图片') || normalized.includes('edit image')
          || normalized === '编辑' || normalized === 'edit'
          || normalized.includes('分享此图片') || normalized.includes('share this image');
      }));

    const openImageLabels = uniq(Array.from(document.querySelectorAll('button, [role="button"], a'))
      .filter((node) => isVisible(node))
      .map((node) => attrOf(node, 'aria-label') || textOf(node))
      .filter((label) => {
        const normalized = lower(label);
        return normalized.includes('打开图片') || normalized.includes('open image');
      }));

    const loadingHeadlines = uniq(Array.from(document.querySelectorAll('[data-testid="image-gen-loading-state-headline"]'))
      .filter((node) => isVisible(node))
      .map((node) => textOf(node)));

    const lightboxThumbnailLabels = uniq(Array.from(modalScope.querySelectorAll('button[aria-label]'))
      .filter((node) => isVisible(node))
      .map((node) => attrOf(node, 'aria-label'))
      .filter((label) => {
        const normalized = lower(label);
        return normalized.includes('图片 ') || normalized.includes('图片：') || normalized.includes('image ');
      }));

    const currentUrl = window.location.href;
    const currentPath = window.location.pathname || '';
    const pathTail = currentPath.startsWith('/c/') ? currentPath.slice(3) : '';
    const conversationId = pathTail ? (pathTail.split('/')[0] || '') : '';

    return {
      url: currentUrl,
      pathname: currentPath,
      title: clean(document.title || ''),
      accountTier: textOf(accountButton).includes('Pro') ? 'Pro' : '',
      conversationId,
      modalVisible: Boolean(modalRoot || modalDialog),
      modalTitle: textOf(queryVisible(modalScope, 'h2')),
      editComposerVisible: Boolean(editComposer),
      editPromptPlaceholder: attrOf(editComposer, 'placeholder') || attrOf(editComposer, 'aria-label'),
      sendButtonLabel: sendButton ? combinedLabel(sendButton) : '',
      stopButtonLabel: stopButton ? combinedLabel(stopButton) : '',
      loadingHeadlines,
      openImageLabels,
      resultActionLabels,
      lightboxThumbnailLabels,
      isImagesPage: currentPath.startsWith('/images'),
      isConversationPage: currentPath.startsWith('/c/'),
    };
  })()`;
}

function buildOpenImageEditComposerScript() {
  return `(() => {
    const clean = (value) => String(value ?? '')
      .replace(/\\u00a0/g, ' ')
      .replace(/\\s+/g, ' ')
      .trim();

    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const textOf = (node) => clean(node instanceof HTMLElement ? (node.innerText || node.textContent || '') : '');
    const attrOf = (node, name) => clean(node instanceof Element ? (node.getAttribute(name) || '') : '');
    const lower = (value) => clean(value).toLowerCase();
    const combinedLabel = (node) => clean([textOf(node), attrOf(node, 'aria-label')].filter(Boolean).join(' '));
    const queryVisible = (root, selector) => Array.from(root.querySelectorAll(selector)).find((node) => isVisible(node)) || null;

    const modalRoot = queryVisible(document, '[data-testid="modal-lightbox-new"]') || queryVisible(document, '[role="dialog"]');
    const searchRoot = modalRoot || document;
    const editButton = Array.from(searchRoot.querySelectorAll('button, [role="button"], a')).find((node) => {
      if (!isVisible(node)) return false;
      const label = lower(combinedLabel(node));
      return label.includes('编辑图片') || label.includes('edit image') || label === '编辑' || label === 'edit';
    }) || null;

    if (!(editButton instanceof HTMLElement)) {
      return { ok: false, reason: 'ChatGPT image edit action was not found.' };
    }

    editButton.click();
    return {
      ok: true,
      label: combinedLabel(editButton),
      scope: modalRoot ? 'modal' : 'page',
    };
  })()`;
}

function buildImageEditPromptScript(prompt) {
  const composerSelectorsJson = JSON.stringify(CHATGPT_IMAGE_EDIT_COMPOSER_SELECTORS);
  const sendSelectorsJson = JSON.stringify(CHATGPT_IMAGE_EDIT_SEND_BUTTON_SELECTORS);
  return `((inputText) => {
    const waitFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const clean = (value) => String(value ?? '')
      .replace(/\\u00a0/g, ' ')
      .replace(/\\s+/g, ' ')
      .trim();

    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const attrOf = (node, name) => clean(node instanceof Element ? (node.getAttribute(name) || '') : '');
    const textOf = (node) => clean(node instanceof HTMLElement ? (node.innerText || node.textContent || '') : '');
    const combinedLabel = (node) => clean([textOf(node), attrOf(node, 'aria-label')].filter(Boolean).join(' '));
    const isDisabled = (node) => {
      if (!(node instanceof HTMLElement)) return true;
      if ('disabled' in node && node.disabled) return true;
      return attrOf(node, 'aria-disabled').toLowerCase() === 'true';
    };
    const queryVisible = (root, selector) => Array.from(root.querySelectorAll(selector)).find((node) => isVisible(node)) || null;
    const findFirstVisibleIn = (root, selectors) => {
      const searchRoot = root instanceof Element || root instanceof Document ? root : document;
      for (const selector of selectors) {
        const found = Array.from(searchRoot.querySelectorAll(selector)).find((node) => isVisible(node));
        if (found instanceof HTMLElement) return found;
      }
      return null;
    };

    const modalRoot = queryVisible(document, '[data-testid="modal-lightbox-new"]') || queryVisible(document, '[role="dialog"]');
    const searchRoot = modalRoot || document;

    const fillComposer = (composer, value) => {
      composer.focus();
      if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
        const proto = composer instanceof HTMLTextAreaElement
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        setter?.call(composer, value);
        composer.dispatchEvent(new Event('input', { bubbles: true }));
        composer.dispatchEvent(new Event('change', { bubbles: true }));
        return 'text-input';
      }

      if (composer instanceof HTMLElement) {
        const selection = window.getSelection();
        selection?.removeAllRanges();
        const range = document.createRange();
        range.selectNodeContents(composer);
        selection?.addRange(range);
        document.execCommand('insertText', false, value);
        if (clean(composer.innerText || composer.textContent || '') !== clean(value)) {
          composer.textContent = value;
          composer.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            cancelable: true,
            data: value,
            inputType: 'insertText',
          }));
        }
        return 'contenteditable';
      }

      throw new Error('No ChatGPT image edit composer found');
    };

    let composer = findFirstVisibleIn(searchRoot, ${composerSelectorsJson});
    if (!(composer instanceof HTMLElement)) {
      composer = Array.from(searchRoot.querySelectorAll('textarea, [contenteditable="true"], [role="textbox"]'))
        .find((node) => isVisible(node)) || null;
    }

    if (!(composer instanceof HTMLElement)) {
      return { ok: false, reason: 'ChatGPT image edit composer was not found.' };
    }

    try {
      fillComposer(composer, inputText);
    } catch (error) {
      return {
        ok: false,
        reason: 'Failed to insert the prompt into the ChatGPT image edit composer.',
        detail: error instanceof Error ? error.message : String(error),
      };
    }

    return (async () => {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        let sendButton = findFirstVisibleIn(searchRoot, ${sendSelectorsJson});
        if (!(sendButton instanceof HTMLElement)) {
          sendButton = Array.from(searchRoot.querySelectorAll('button, [role="button"]')).find((node) => {
            if (!isVisible(node)) return false;
            const label = combinedLabel(node).toLowerCase();
            return label.includes('send prompt') || label.includes('发送提示');
          }) || null;
        }

        if (sendButton instanceof HTMLElement && !isDisabled(sendButton)) {
          sendButton.click();
          return {
            ok: true,
            submitLabel: combinedLabel(sendButton),
            submitSelector: attrOf(sendButton, 'aria-label') ? 'aria-label' : (sendButton.getAttribute('type') === 'submit' ? 'type=submit' : 'button'),
          };
        }

        await waitFor(300);
      }

      return {
        ok: false,
        reason: 'ChatGPT image edit send button did not become clickable after prompt insertion.',
      };
    })();
  })(${JSON.stringify(prompt)})`;
}

function normalizeChatGPTImageEditStatus(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  return new Set(['blocked', 'failed', 'submitted', 'result_visible', 'saved']).has(raw) ? raw : '';
}

function normalizeChatGPTImageResultAction(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return '';
  if (raw.includes('打开图片') || raw.includes('open image')) return 'open';
  if (raw.includes('编辑图片') || raw.includes('edit image') || raw === '编辑' || raw === 'edit') return 'edit';
  if (raw.includes('分享此图片') || raw.includes('share this image')) return 'share';
  return '';
}

export function normalizeChatGPTImageEditSnapshot(snapshot) {
  const asArray = (value) => Array.isArray(value) ? Array.from(new Set(value.map((item) => String(item ?? '').trim()).filter(Boolean))) : [];
  const pageUrl = String(snapshot?.pageUrl ?? snapshot?.url ?? '').trim();
  const resultActionLabels = asArray(snapshot?.resultActionLabels);
  const explicitActions = asArray(snapshot?.resultActions).map((item) => normalizeChatGPTImageResultAction(item)).filter(Boolean);
  const derivedActions = resultActionLabels.map((item) => normalizeChatGPTImageResultAction(item)).filter(Boolean);
  return {
    status: normalizeChatGPTImageEditStatus(snapshot?.status ?? ''),
    detail: String(snapshot?.detail ?? '').trim(),
    pageUrl,
    pathname: String(snapshot?.pathname ?? '').trim(),
    pageTitle: String(snapshot?.pageTitle ?? snapshot?.title ?? '').trim(),
    accountTier: String(snapshot?.accountTier ?? '').trim(),
    conversationId: String(snapshot?.conversationId ?? '').trim() || extractChatGPTConversationId(pageUrl),
    modalVisible: Boolean(snapshot?.modalVisible),
    modalTitle: String(snapshot?.modalTitle ?? '').trim(),
    editComposerVisible: Boolean(snapshot?.editComposerVisible),
    editPromptPlaceholder: String(snapshot?.editPromptPlaceholder ?? '').trim(),
    sendButtonLabel: String(snapshot?.sendButtonLabel ?? '').trim(),
    stopButtonLabel: String(snapshot?.stopButtonLabel ?? '').trim(),
    loadingHeadlines: asArray(snapshot?.loadingHeadlines),
    openImageLabels: asArray(snapshot?.openImageLabels),
    lightboxThumbnailLabels: asArray(snapshot?.lightboxThumbnailLabels ?? snapshot?.modalThumbnailLabels),
    resultActions: Array.from(new Set([...explicitActions, ...derivedActions])),
    resultActionLabels,
    isImagesPage: Boolean(snapshot?.isImagesPage),
    isConversationPage: Boolean(snapshot?.isConversationPage),
  };
}

export function buildChatGPTImageEditRow(snapshot, extra = {}) {
  const normalized = normalizeChatGPTImageEditSnapshot(snapshot);
  const status = normalizeChatGPTImageEditStatus(extra.status ?? '')
    || normalized.status
    || (normalized.conversationId && normalized.resultActions.length > 0 && normalized.loadingHeadlines.length === 0 ? 'result_visible' : 'submitted');
  const row = {
    action: 'edit',
    status,
    page_url: normalized.pageUrl,
    page_title: normalized.pageTitle,
    account_tier: normalized.accountTier,
    conversation_id: normalized.conversationId,
  };
  if (extra.file) row.file = String(extra.file);
  if (extra.reason) row.reason = String(extra.reason);
  if (extra.detail || normalized.detail) row.detail = String(extra.detail || normalized.detail);
  return row;
}

function hasChatGPTImageEditComposer(snapshot) {
  const normalized = normalizeChatGPTImageEditSnapshot(snapshot);
  return Boolean(
    normalized.modalVisible
    && (normalized.editComposerVisible || /描述编辑|describe edit/i.test(normalized.editPromptPlaceholder))
  );
}

function hasChatGPTImageEditSubmittedSignal(snapshot, baselineConversationId = '') {
  const normalized = normalizeChatGPTImageEditSnapshot(snapshot);
  const conversationAdvanced = Boolean(normalized.conversationId && normalized.conversationId !== baselineConversationId);
  return Boolean(
    conversationAdvanced
    || normalized.loadingHeadlines.length > 0
    || normalized.stopButtonLabel
  );
}

function hasChatGPTImageEditResultVisibleSignal(snapshot, baselineConversationId = '') {
  const normalized = normalizeChatGPTImageEditSnapshot(snapshot);
  const conversationAdvanced = Boolean(normalized.conversationId && normalized.conversationId !== baselineConversationId);
  return Boolean(
    conversationAdvanced
    && normalized.resultActions.length > 0
    && normalized.loadingHeadlines.length === 0
    && !normalized.stopButtonLabel
  );
}

export async function openChatGPTImageForEdit(page, openIndex = 1) {
  const result = await page.evaluate(buildOpenImageForEditScript(openIndex)).catch((error) => ({
    ok: false,
    reason: error instanceof Error ? error.message : String(error),
  }));
  return result && typeof result === 'object' ? result : { ok: false, reason: 'Unknown open-image result.' };
}

export async function waitForChatGPTImageOpenTarget(page, openIndex = 1, timeoutSeconds = 8) {
  const timeout = parseChatGPTPositiveInt(timeoutSeconds, 8);
  let lastResult = await openChatGPTImageForEdit(page, openIndex);
  if (lastResult?.ok) return lastResult;
  for (let attempt = 0; attempt < timeout; attempt += 1) {
    await waitForChatGPTImageSettle(page);
    lastResult = await openChatGPTImageForEdit(page, openIndex);
    if (lastResult?.ok) return lastResult;
  }
  return lastResult;
}

export async function selectChatGPTImageInLightbox(page, imageIndex = 1) {
  if (imageIndex <= 1) return { ok: true, selectedIndex: 1, mode: 'default' };
  const result = await page.evaluate(buildSelectImageInLightboxScript(imageIndex)).catch((error) => ({
    ok: false,
    reason: error instanceof Error ? error.message : String(error),
  }));
  return result && typeof result === 'object' ? result : { ok: false, reason: 'Unknown lightbox selection result.' };
}

export async function openChatGPTImageEditComposer(page) {
  const result = await page.evaluate(buildOpenImageEditComposerScript()).catch((error) => ({
    ok: false,
    reason: error instanceof Error ? error.message : String(error),
  }));
  return result && typeof result === 'object' ? result : { ok: false, reason: 'Unknown edit-action result.' };
}

async function recoverChatGPTImageEditState(page, detail = '') {
  try {
    await openChatGPTImages(page);
    const conversations = await getChatGPTConversationList(page);
    if (conversations[0]?.Url) {
      await openChatGPTConversation(page, conversations[0].Url);
    }
    const snapshot = await page.evaluate(buildImageEditStateScript()).catch(async (error) => ({
      url: await getCurrentChatGPTUrl(page),
      detail: error instanceof Error ? error.message : String(error),
    }));
    return normalizeChatGPTImageEditSnapshot({
      ...snapshot,
      detail: String(snapshot?.detail ?? '').trim() || detail,
    });
  } catch (error) {
    return normalizeChatGPTImageEditSnapshot({
      url: await getCurrentChatGPTUrl(page),
      detail: detail || (error instanceof Error ? error.message : String(error)),
    });
  }
}

export async function readChatGPTImageEditState(page) {
  try {
    const snapshot = await page.evaluate(buildImageEditStateScript());
    return normalizeChatGPTImageEditSnapshot(snapshot);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (/stale page identity|page not found:/i.test(detail)) {
      return recoverChatGPTImageEditState(page, detail);
    }
    return normalizeChatGPTImageEditSnapshot({
      url: await getCurrentChatGPTUrl(page),
      detail,
    });
  }
}

export async function waitForChatGPTImageEditModal(page, timeoutSeconds = 10) {
  const timeout = parseChatGPTPositiveInt(timeoutSeconds, 10);
  let lastSnapshot = await readChatGPTImageEditState(page);
  if (hasChatGPTImageEditComposer(lastSnapshot)) return lastSnapshot;
  for (let attempt = 0; attempt < timeout; attempt += 1) {
    await waitForChatGPTImageSettle(page);
    lastSnapshot = await readChatGPTImageEditState(page);
    if (hasChatGPTImageEditComposer(lastSnapshot)) return lastSnapshot;
  }
  return lastSnapshot;
}

export async function sendChatGPTImageEditPrompt(page, prompt) {
  const result = await page.evaluate(buildImageEditPromptScript(prompt)).catch((error) => ({
    ok: false,
    reason: 'Failed to execute prompt insertion in ChatGPT image edit.',
    detail: error instanceof Error ? error.message : String(error),
  }));
  return result && typeof result === 'object' ? result : { ok: false, reason: 'Unknown send result.' };
}

export async function waitForChatGPTImageEditState(page, timeoutSeconds = 30, baselineSnapshot = {}) {
  const timeout = parseChatGPTPositiveInt(timeoutSeconds, 30);
  const baseline = normalizeChatGPTImageEditSnapshot(baselineSnapshot);
  const baselineConversationId = baseline.conversationId;
  let lastSnapshot = await readChatGPTImageEditState(page);
  let submittedSnapshot = hasChatGPTImageEditSubmittedSignal(lastSnapshot, baselineConversationId)
    ? { ...lastSnapshot, status: 'submitted' }
    : null;

  if (hasChatGPTImageEditResultVisibleSignal(lastSnapshot, baselineConversationId)) {
    return {
      ...lastSnapshot,
      status: 'result_visible',
    };
  }

  for (let attempt = 0; attempt < timeout; attempt += 1) {
    await waitForChatGPTImageSettle(page);
    lastSnapshot = await readChatGPTImageEditState(page);
    if (hasChatGPTImageEditResultVisibleSignal(lastSnapshot, baselineConversationId)) {
      return {
        ...lastSnapshot,
        status: 'result_visible',
      };
    }
    if (hasChatGPTImageEditSubmittedSignal(lastSnapshot, baselineConversationId)) {
      submittedSnapshot = {
        ...lastSnapshot,
        status: 'submitted',
      };
    }
  }

  if (submittedSnapshot) return submittedSnapshot;
  return {
    ...lastSnapshot,
    status: 'submitted',
  };
}

export const imageEditInternals = {
  buildChatGPTImageEditRow,
  openChatGPTImageForEdit,
  openChatGPTImageEditComposer,
  readChatGPTImageEditState,
  waitForChatGPTImageOpenTarget,
  selectChatGPTImageInLightbox,
  sendChatGPTImageEditPrompt,
  waitForChatGPTImageEditModal,
  waitForChatGPTImageEditState,
};

export const imageEditCommand = cli({
  site: 'chatgpt',
  name: 'image-edit',
  description: 'Open a target ChatGPT image, submit an edit prompt, and optionally wait for visible edited results to download locally',
  domain: CHATGPT_WEB_DOMAIN,
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  defaultFormat: 'plain',
  timeoutSeconds: 180,
  args: [
    { name: 'prompt', required: true, positional: true, help: 'Edit prompt to send for the selected ChatGPT image' },
    { name: 'url', required: false, help: 'Optional ChatGPT conversation URL to target a specific image-edit thread' },
    { name: 'image', required: false, help: '1-based image index. On /images it selects the visible image entry; with --url it selects the lightbox image when available (default: 1)', default: '1' },
    { name: 'op', required: false, help: 'Output directory for downloaded edited images', default: '~/Pictures/chatgpt' },
    { name: 'sd', type: 'boolean', required: false, help: 'Skip download shorthand; only submit the edit and show the ChatGPT thread state', default: false },
    { name: 'timeout', required: false, help: 'Max seconds to keep polling the edit thread for downloadable results before falling back to the ChatGPT thread state (default: 30)', default: '30' },
  ],
  columns: ['action', 'status', 'file', 'page_url', 'conversation_id'],
  func: async (page, kwargs) => {
    const prompt = String(kwargs.prompt ?? '').trim();
    const timeoutRaw = String(kwargs.timeout ?? '30').trim() || '30';
    const timeout = parseChatGPTPositiveInt(kwargs.timeout, 30);
    const outputDir = expandHomePath(String(kwargs.op || '~/Pictures/chatgpt')).trim();
    const skipDownloadRaw = kwargs.sd;
    const skipDownload = skipDownloadRaw === '' || skipDownloadRaw === true || normalizeBooleanFlag(skipDownloadRaw);
    const targetUrlRaw = String(kwargs.url ?? '').trim();
    const targetUrl = targetUrlRaw ? parseChatGPTConversationUrl(targetUrlRaw) : null;
    const imageIndex = parseChatGPTImageEditIndex(kwargs.image, 1);

    if (targetUrlRaw && !targetUrl) {
      return [imageEditInternals.buildChatGPTImageEditRow({
        url: await getCurrentChatGPTUrl(page),
      }, {
        status: 'blocked',
        reason: 'invalid-conversation-url',
        detail: 'The provided ChatGPT conversation URL is invalid.',
      })];
    }

    if (!imageIndex) {
      return [imageEditInternals.buildChatGPTImageEditRow({
        url: await getCurrentChatGPTUrl(page),
      }, {
        status: 'blocked',
        reason: 'invalid-image-index',
        detail: 'The image index must be a positive integer.',
      })];
    }

    if (targetUrl) {
      await openChatGPTConversation(page, targetUrl);
    } else {
      await openChatGPTImages(page);
      const preflight = await readChatGPTImageCapabilities(page);

      if (!preflight.isImagesPage) {
        return [imageEditInternals.buildChatGPTImageEditRow(preflight, {
          status: 'blocked',
          reason: 'not-images-page',
          detail: preflight.detail,
        })];
      }

      if (!hasChatGPTImageContext(preflight)) {
        return [imageEditInternals.buildChatGPTImageEditRow(preflight, {
          status: 'blocked',
          reason: 'no-image-context',
        })];
      }
    }

    const openResult = await imageEditInternals.waitForChatGPTImageOpenTarget(page, targetUrl ? 1 : imageIndex, targetUrl ? 8 : 4);
    if (!openResult?.ok) {
      return [imageEditInternals.buildChatGPTImageEditRow({
        url: await getCurrentChatGPTUrl(page),
      }, {
        status: 'blocked',
        reason: targetUrl ? 'open-thread-image-unavailable' : 'open-image-unavailable',
        detail: openResult?.reason || 'open-image-failed',
      })];
    }

    if (targetUrl || openResult?.modalVisible) {
      await waitForChatGPTImageSettle(page);
    }
    let readySnapshot = await imageEditInternals.waitForChatGPTImageEditModal(page, 10);

    if (targetUrl) {
      const selectResult = await imageEditInternals.selectChatGPTImageInLightbox(page, imageIndex);
      if (!selectResult?.ok) {
        return [imageEditInternals.buildChatGPTImageEditRow(readySnapshot, {
          status: 'blocked',
          reason: 'image-index-unavailable',
          detail: selectResult?.reason || 'Requested image index is unavailable.',
        })];
      }

      await waitForChatGPTImageSettle(page);
      readySnapshot = await imageEditInternals.waitForChatGPTImageEditModal(page, 10);

      if (!hasChatGPTImageEditComposer(readySnapshot)) {
        const openComposerResult = await imageEditInternals.openChatGPTImageEditComposer(page);
        if (openComposerResult?.ok) {
          await waitForChatGPTImageSettle(page);
          readySnapshot = await imageEditInternals.waitForChatGPTImageEditModal(page, 10);
        }
      }
    }

    if (!hasChatGPTImageEditComposer(readySnapshot)) {
      return [imageEditInternals.buildChatGPTImageEditRow(readySnapshot, {
        status: 'blocked',
        reason: 'edit-modal-unavailable',
        detail: readySnapshot.detail || (targetUrl
          ? 'ChatGPT image edit modal was not ready after opening the thread image.'
          : 'ChatGPT image edit modal was not ready.'),
      })];
    }

    const beforeVisibleImageUrls = await getChatGPTVisibleImageUrls(page).catch(() => []);
    const sendResult = await imageEditInternals.sendChatGPTImageEditPrompt(page, prompt);
    if (!sendResult?.ok) {
      return [imageEditInternals.buildChatGPTImageEditRow(readySnapshot, {
        status: 'failed',
        reason: 'send-unavailable',
        detail: sendResult?.reason || 'send-failed',
      })];
    }

    const finalSnapshot = await imageEditInternals.waitForChatGPTImageEditState(page, timeout, readySnapshot);
    if (skipDownload) {
      return [imageEditInternals.buildChatGPTImageEditRow(finalSnapshot)];
    }

    const downloadRows = await pollChatGPTImageDownloads(page, {
      url: finalSnapshot.pageUrl || await getCurrentChatGPTUrl(page),
      op: outputDir,
      timeout: timeoutRaw,
      downloader: imageDownloadCommand.func,
      all: true,
      downloadKwargs: {
        before_urls: beforeVisibleImageUrls,
      },
    });
    const firstDownloadRow = Array.isArray(downloadRows) ? downloadRows[0] : null;
    if (!firstDownloadRow || firstDownloadRow.status !== '✅ saved') {
      return [imageEditInternals.buildChatGPTImageEditRow(finalSnapshot)];
    }

    return downloadRows.map((row) => imageEditInternals.buildChatGPTImageEditRow(finalSnapshot, {
      status: 'saved',
      file: row.file,
    }));
  },
});

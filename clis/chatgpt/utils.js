export const CHATGPT_WEB_DOMAIN = 'chatgpt.com';
export const CHATGPT_DEEP_RESEARCH_URL = 'https://chatgpt.com/deep-research';
export const CHATGPT_DEEP_RESEARCH_MODE_LABELS = ['Deep Research', '深度研究'];

const CHATGPT_COMPOSER_SELECTORS = [
  'textarea[placeholder*="获取详细报告"]',
  'textarea[aria-label*="获取详细报告"]',
  'textarea[placeholder*="message"]',
  'textarea[aria-label*="message"]',
  'textarea[data-testid="prompt-textarea"]',
  'textarea',
  '[contenteditable="true"][data-lexical-editor="true"]',
  '[contenteditable="true"][role="textbox"]',
  '[contenteditable="true"][aria-label*="message"]',
  '[contenteditable="true"]',
  '[role="textbox"][contenteditable="true"]',
];

const CHATGPT_SEND_BUTTON_SELECTORS = [
  'button[aria-label="发送提示"]',
  'button[aria-label="Send prompt"]',
  'button[aria-label*="发送"]',
  'button[aria-label*="Send"]',
  'button[type="submit"]',
];

function buildSnapshotScript() {
  const composerSelectorsJson = JSON.stringify(CHATGPT_COMPOSER_SELECTORS);
  const sendSelectorsJson = JSON.stringify(CHATGPT_SEND_BUTTON_SELECTORS);
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
    const combinedLabel = (node) => clean([textOf(node), attrOf(node, 'aria-label')].filter(Boolean).join(' '));
    const isDisabled = (node) => {
      if (!(node instanceof HTMLElement)) return true;
      if ('disabled' in node && node.disabled) return true;
      return attrOf(node, 'aria-disabled').toLowerCase() === 'true';
    };

    const findFirstVisible = (selectors) => {
      for (const selector of selectors) {
        const found = Array.from(document.querySelectorAll(selector)).find((node) => isVisible(node));
        if (found instanceof HTMLElement) return found;
      }
      return null;
    };

    const findActionNode = (matcher) => Array.from(document.querySelectorAll('button, [role="button"], a, span, div'))
      .find((node) => isVisible(node) && matcher(combinedLabel(node).toLowerCase()));

    let composer = findFirstVisible(${composerSelectorsJson});
    if (!(composer instanceof HTMLElement)) {
      composer = Array.from(document.querySelectorAll('textarea, [contenteditable="true"], [role="textbox"]'))
        .find((node) => isVisible(node)) || null;
    }

    const composerText = composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement
      ? clean(composer.value)
      : textOf(composer);
    const composerPlaceholder = attrOf(composer, 'placeholder') || attrOf(composer, 'aria-label');

    let sendButton = findFirstVisible(${sendSelectorsJson});
    if (!(sendButton instanceof HTMLElement)) {
      sendButton = Array.from(document.querySelectorAll('button, [role="button"]'))
        .find((node) => {
          if (!isVisible(node)) return false;
          const label = combinedLabel(node).toLowerCase();
          return label.includes('send prompt') || label.includes('发送提示');
        }) || null;
    }

    const retryNode = findActionNode((label) => {
      const hasMode = label.includes('deep research') || label.includes('深度研究');
      const hasRetry = label.includes('click to retry') || label.includes('点击以重试') || label.includes('retry');
      return hasMode && hasRetry;
    });

    const modeNode = findActionNode((label) => label === 'deep research' || label === '深度研究');
    const shareNode = findActionNode((label) => label.includes('share') || label.includes('分享'));
    const loginNode = Array.from(document.querySelectorAll('a, button')).find((node) => {
      if (!isVisible(node)) return false;
      const label = combinedLabel(node).toLowerCase();
      return label.includes('log in') || label.includes('sign in') || label.includes('登录') || label.includes('免费注册') || label.includes('sign up');
    }) || null;

    const currentUrl = window.location.href;
    const currentPath = window.location.pathname || '';
    const toAbsoluteUrl = (href) => {
      try {
        return new URL(href, window.location.origin).href;
      } catch {
        return '';
      }
    };

    const conversationLinks = [];
    const seenConversationUrls = new Set();
    for (const node of Array.from(document.querySelectorAll('a[href]'))) {
      if (!isVisible(node)) continue;
      const href = node.getAttribute('href') || '';
      const url = toAbsoluteUrl(href);
      if (!url || !/\\/c\\//.test(url) || seenConversationUrls.has(url)) continue;
      seenConversationUrls.add(url);
      conversationLinks.push({
        url,
        href,
        title: textOf(node) || attrOf(node, 'aria-label'),
        ariaCurrent: attrOf(node, 'aria-current'),
      });
    }

    const currentConversation = conversationLinks.find((item) => item.url === currentUrl || item.href === currentPath || item.ariaCurrent === 'page') || null;
    const conversationMatch = currentPath.match(/^\/c\/([^/?#]+)/);
    const documentTitle = clean(document.title || '').replace(/\s*[-|·].*$/, '').trim();
    const modeLabel = clean(modeNode ? combinedLabel(modeNode) : (retryNode ? combinedLabel(retryNode) : '')).replace(/[，,].*$/, '').trim();

    return {
      url: currentUrl,
      pathname: currentPath,
      conversationId: conversationMatch ? conversationMatch[1] : '',
      threadTitle: clean(currentConversation?.title || '') || (conversationMatch ? documentTitle : ''),
      modeLabel,
      retryLabel: clean(retryNode ? combinedLabel(retryNode) : ''),
      shareVisible: Boolean(shareNode),
      sendEnabled: Boolean(sendButton) && !isDisabled(sendButton),
      sendLabel: clean(sendButton ? combinedLabel(sendButton) : ''),
      composerHasText: Boolean(composerText),
      composerText,
      composerPlaceholder,
      isDeepResearchPage: currentPath === '/deep-research',
      isSignedIn: loginNode ? false : null,
    };
  })()`;
}

function buildSendPromptScript(prompt) {
  const composerSelectorsJson = JSON.stringify(CHATGPT_COMPOSER_SELECTORS);
  const sendSelectorsJson = JSON.stringify(CHATGPT_SEND_BUTTON_SELECTORS);
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

    const findFirstVisible = (selectors) => {
      for (const selector of selectors) {
        const found = Array.from(document.querySelectorAll(selector)).find((node) => isVisible(node));
        if (found instanceof HTMLElement) return found;
      }
      return null;
    };

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

      throw new Error('No ChatGPT composer found');
    };

    let composer = findFirstVisible(${composerSelectorsJson});
    if (!(composer instanceof HTMLElement)) {
      composer = Array.from(document.querySelectorAll('textarea, [contenteditable="true"], [role="textbox"]'))
        .find((node) => isVisible(node)) || null;
    }

    if (!(composer instanceof HTMLElement)) {
      return { ok: false, reason: 'ChatGPT Deep Research composer was not found.' };
    }

    try {
      fillComposer(composer, inputText);
    } catch (error) {
      return {
        ok: false,
        reason: 'Failed to insert the prompt into the ChatGPT Deep Research composer.',
        detail: error instanceof Error ? error.message : String(error),
      };
    }

    return (async () => {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        let sendButton = findFirstVisible(${sendSelectorsJson});
        if (!(sendButton instanceof HTMLElement)) {
          sendButton = Array.from(document.querySelectorAll('button, [role="button"]'))
            .find((node) => {
              if (!isVisible(node)) return false;
              const label = combinedLabel(node).toLowerCase();
              return label.includes('send prompt') || label.includes('发送提示');
            }) || null;
        }

        if (sendButton instanceof HTMLElement) {
          if (!isDisabled(sendButton)) {
            sendButton.click();
            return {
              ok: true,
              submitLabel: combinedLabel(sendButton),
              submitSelector: attrOf(sendButton, 'aria-label') ? 'aria-label' : (sendButton.getAttribute('type') === 'submit' ? 'type=submit' : 'button'),
            };
          }
        }

        await waitFor(300);
      }

      return {
        ok: false,
        reason: 'ChatGPT Deep Research send button did not become clickable after prompt insertion.',
      };
    })();
  })(${JSON.stringify(prompt)})`;
}

function buildConversationListScript() {
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

    const toAbsoluteUrl = (href) => {
      try {
        return new URL(href, window.location.origin).href;
      } catch {
        return '';
      }
    };

    const items = [];
    const seen = new Set();
    for (const node of Array.from(document.querySelectorAll('a[href]'))) {
      if (!isVisible(node)) continue;
      const href = node.getAttribute('href') || '';
      const url = toAbsoluteUrl(href);
      if (!url || !/\\/c\\//.test(url) || seen.has(url)) continue;
      const title = clean(node.innerText || node.textContent || node.getAttribute('aria-label') || '');
      if (!title) continue;
      seen.add(url);
      items.push({ Title: title, Url: url });
    }
    return items;
  })()`;
}

export function parseChatGPTPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseChatGPTTitleMatchMode(value, fallback = 'contains') {
  const raw = String(value ?? fallback).trim().toLowerCase();
  if (raw === 'contains' || raw === 'exact') return raw;
  return null;
}

export function parseChatGPTConversationUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.hostname !== CHATGPT_WEB_DOMAIN && !url.hostname.endsWith(`.${CHATGPT_WEB_DOMAIN}`)) return null;
    if (!/^\/c\/[^/?#]+/.test(url.pathname)) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function extractChatGPTConversationId(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const directMatch = raw.match(/\/c\/([^/?#]+)/);
  if (directMatch) return directMatch[1];
  const parsedUrl = parseChatGPTConversationUrl(raw);
  if (!parsedUrl) return '';
  const parsedMatch = parsedUrl.match(/\/c\/([^/?#]+)/);
  return parsedMatch ? parsedMatch[1] : '';
}

export function normalizeChatGPTTitle(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function pickChatGPTConversationByTitle(conversations, query, mode = 'contains') {
  const normalizedQuery = normalizeChatGPTTitle(query);
  if (!normalizedQuery) return null;
  for (const conversation of conversations) {
    const normalizedTitle = normalizeChatGPTTitle(conversation?.Title);
    if (!normalizedTitle) continue;
    if (mode === 'exact') {
      if (normalizedTitle === normalizedQuery) return conversation;
      continue;
    }
    if (normalizedTitle.includes(normalizedQuery)) return conversation;
  }
  return null;
}

export function resolveChatGPTConversationForQuery(conversations, query, mode) {
  const normalizedQuery = String(query ?? '').trim();
  if (!normalizedQuery) return conversations[0] ?? null;
  const exact = pickChatGPTConversationByTitle(conversations, normalizedQuery, 'exact');
  if (exact) return exact;
  if (mode === 'contains') return pickChatGPTConversationByTitle(conversations, normalizedQuery, 'contains');
  return null;
}

export function normalizeChatGPTModeLabel(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/深度研究/i.test(raw)) return '深度研究';
  if (/deep research/i.test(raw)) return 'Deep Research';
  return raw;
}

export function classifyChatGPTDeepResearchSnapshot(snapshot) {
  if (snapshot?.retryLabel && /(click to retry|点击以重试|retry)/i.test(snapshot.retryLabel)) {
    return 'retry_required';
  }
  if (snapshot?.conversationId) {
    return 'thread_created';
  }
  if (snapshot?.composerHasText && snapshot?.sendEnabled) {
    return 'input_ready';
  }
  if (snapshot?.isDeepResearchPage || snapshot?.modeLabel) {
    return 'landing';
  }
  return 'unknown';
}

export function normalizeChatGPTDeepResearchSnapshot(snapshot) {
  const url = String(snapshot?.url ?? '').trim();
  const conversationId = String(snapshot?.conversationId ?? '').trim() || extractChatGPTConversationId(url);
  const normalized = {
    url,
    pathname: String(snapshot?.pathname ?? '').trim(),
    conversationId,
    threadTitle: String(snapshot?.threadTitle ?? '').trim(),
    modeLabel: normalizeChatGPTModeLabel(snapshot?.modeLabel ?? ''),
    retryLabel: String(snapshot?.retryLabel ?? '').trim(),
    shareVisible: Boolean(snapshot?.shareVisible),
    sendEnabled: Boolean(snapshot?.sendEnabled),
    sendLabel: String(snapshot?.sendLabel ?? '').trim(),
    composerHasText: Boolean(snapshot?.composerHasText),
    composerText: String(snapshot?.composerText ?? '').trim(),
    composerPlaceholder: String(snapshot?.composerPlaceholder ?? '').trim(),
    isDeepResearchPage: Boolean(snapshot?.isDeepResearchPage),
    isSignedIn: typeof snapshot?.isSignedIn === 'boolean' ? snapshot.isSignedIn : null,
  };
  normalized.uiState = classifyChatGPTDeepResearchSnapshot(normalized);
  return normalized;
}

export function buildChatGPTDeepResearchRow(snapshot, extra = {}) {
  const normalized = normalizeChatGPTDeepResearchSnapshot(snapshot);
  const row = {
    ui_state: normalized.uiState,
    conversation_url: normalized.url,
    conversation_id: normalized.conversationId,
    thread_title: normalized.threadTitle,
    mode_label: normalized.modeLabel,
  };
  if (extra.detail) row.detail = String(extra.detail);
  return row;
}

export async function getCurrentChatGPTUrl(page) {
  return page.evaluate('window.location.href').catch(() => '');
}

export async function openChatGPTDeepResearch(page) {
  await page.goto(CHATGPT_DEEP_RESEARCH_URL, { waitUntil: 'load', settleMs: 2500 });
  await page.wait(1);
}

export async function openChatGPTConversation(page, url) {
  await page.goto(url, { waitUntil: 'load', settleMs: 2500 });
  await page.wait(1);
}

export async function readChatGPTDeepResearchSnapshot(page) {
  const snapshot = await page.evaluate(buildSnapshotScript()).catch(async () => ({
    url: await getCurrentChatGPTUrl(page),
  }));
  return normalizeChatGPTDeepResearchSnapshot(snapshot);
}

export async function sendChatGPTDeepResearchPrompt(page, prompt) {
  const result = await page.evaluate(buildSendPromptScript(prompt)).catch((error) => ({
    ok: false,
    reason: 'Failed to execute prompt insertion in ChatGPT Deep Research.',
    detail: error instanceof Error ? error.message : String(error),
  }));
  return result && typeof result === 'object' ? result : { ok: false, reason: 'Unknown send result.' };
}

export async function waitForChatGPTDeepResearchState(page, timeoutSeconds = 30) {
  const timeout = parseChatGPTPositiveInt(timeoutSeconds, 30);
  let lastSnapshot = await readChatGPTDeepResearchSnapshot(page);
  if (lastSnapshot.uiState === 'thread_created' || lastSnapshot.uiState === 'retry_required') {
    return lastSnapshot;
  }
  for (let attempt = 0; attempt < timeout; attempt += 1) {
    await page.wait(1);
    lastSnapshot = await readChatGPTDeepResearchSnapshot(page);
    if (lastSnapshot.uiState === 'thread_created' || lastSnapshot.uiState === 'retry_required') {
      return lastSnapshot;
    }
  }
  return lastSnapshot;
}

export async function getChatGPTConversationList(page) {
  const items = await page.evaluate(buildConversationListScript()).catch(() => []);
  return Array.isArray(items) ? items.filter((item) => item && typeof item.Url === 'string') : [];
}

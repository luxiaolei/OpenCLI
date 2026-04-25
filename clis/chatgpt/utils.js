export const CHATGPT_WEB_DOMAIN = 'chatgpt.com';
export const CHATGPT_DEEP_RESEARCH_URL = 'https://chatgpt.com/deep-research';
export const CHATGPT_DEEP_RESEARCH_MODE_LABELS = ['Deep Research', '深度研究'];
const CHATGPT_DEEP_RESEARCH_UI_STATES = new Set(['landing', 'input_ready', 'submitted', 'pending', 'retry_required', 'unknown']);

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

const CHATGPT_IMAGE_COMPOSER_SELECTORS = [
  'textarea[placeholder*="描述新图片"]',
  'textarea[aria-label*="描述新图片"]',
  'textarea[placeholder*="Describe a new image"]',
  'textarea[aria-label*="Describe a new image"]',
  'textarea[placeholder*="image"]',
  'textarea[aria-label*="image"]',
  'textarea[data-testid="prompt-textarea"]',
  'textarea',
  '[contenteditable="true"][data-lexical-editor="true"]',
  '[contenteditable="true"][role="textbox"]',
  '[contenteditable="true"]',
  '[role="textbox"][contenteditable="true"]',
];

const CHATGPT_IMAGE_SEND_BUTTON_SELECTORS = [
  '#composer-submit-button',
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
      const hasRetry = label.includes('click to retry') || label.includes('点击以重试');
      return hasMode && hasRetry;
    });

    const modeNode = findActionNode((label) => {
      const hasMode = label.includes('deep research') || label.includes('深度研究');
      const hasRetry = label.includes('click to retry') || label.includes('点击以重试');
      return hasMode && !hasRetry;
    });
    const shareNode = findActionNode((label) => label.includes('share') || label.includes('分享'));
    const loginNode = Array.from(document.querySelectorAll('a, button')).find((node) => {
      if (!isVisible(node)) return false;
      const label = combinedLabel(node).toLowerCase();
      return label.includes('log in') || label.includes('sign in') || label.includes('登录') || label.includes('免费注册') || label.includes('sign up');
    }) || null;

    const currentUrl = window.location.href;
    const currentPath = window.location.pathname || '';
    const mainRoot = queryVisible(document, 'main') || queryVisible(document, '[role="main"]') || document.body;
    const mainText = clean([
      textOf(mainRoot),
      clean(document.body ? (document.body.innerText || document.body.textContent || '') : ''),
    ].filter(Boolean).join(' '));
    const lowerMainText = mainText.toLowerCase();
    const lowerDocumentHtml = String(document.body ? (document.body.innerHTML || '') : '').toLowerCase();
    const hasDeepResearchText = lowerMainText.includes('deep research')
      || lowerMainText.includes('深度研究')
      || lowerDocumentHtml.includes('deep research')
      || lowerDocumentHtml.includes('深度研究');
    const hasSitesText = /应用\\s*站点|apply\\s*sites/i.test(mainText)
      || /应用\\s*站点|apply\\s*sites/i.test(String(document.body ? (document.body.innerHTML || '') : ''));
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
    const conversationMatch = currentPath.match(/^\\/c\\/([^/?#]+)/);
    const documentTitle = clean(document.title || '').replace(/\\s*[-|·].*$/, '').trim();
    const inferredModeLabel = modeNode
      ? combinedLabel(modeNode)
      : (retryNode
        ? combinedLabel(retryNode)
        : (hasDeepResearchText && hasSitesText ? (mainText.includes('深度研究') ? '深度研究' : 'Deep Research') : ''));
    const modeLabel = clean(inferredModeLabel).replace(/[，,].*$/, '').trim();

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

    const currentUrl = window.location.href || '';
    const currentPath = window.location.pathname || '';
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
      items.push({
        Title: title,
        Url: url,
        Current: url === currentUrl || href === currentPath || clean(node.getAttribute('aria-current') || '').toLowerCase() === 'page',
      });
    }
    return items;
  })()`;
}

function buildChatGPTDeepResearchFallbackScript() {
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
    const matchVisibleNode = (predicate) => Array.from(document.querySelectorAll('button, [role="button"], a, span, div'))
      .find((node) => isVisible(node) && predicate(combinedLabel(node).toLowerCase())) || null;

    const retryNode = matchVisibleNode((label) => {
      const hasMode = label.includes('deep research') || label.includes('深度研究');
      const hasRetry = label.includes('click to retry') || label.includes('点击以重试');
      return hasMode && hasRetry;
    });
    const modeNode = matchVisibleNode((label) => {
      const hasMode = label.includes('deep research') || label.includes('深度研究');
      const hasRetry = label.includes('click to retry') || label.includes('点击以重试');
      return hasMode && !hasRetry;
    });
    const shareNode = matchVisibleNode((label) => label.includes('share') || label.includes('分享'));
    const sendNode = matchVisibleNode((label) => label.includes('send prompt') || label.includes('发送提示'));
    const loginNode = Array.from(document.querySelectorAll('a, button')).find((node) => {
      if (!isVisible(node)) return false;
      const label = combinedLabel(node).toLowerCase();
      return label.includes('log in') || label.includes('sign in') || label.includes('登录') || label.includes('免费注册') || label.includes('sign up');
    }) || null;

    const currentUrl = window.location.href;
    const currentPath = window.location.pathname || '';
    const mainRoot = Array.from(document.querySelectorAll('main, [role="main"]')).find((node) => isVisible(node)) || document.body;
    const mainText = clean([
      textOf(mainRoot),
      clean(document.body ? (document.body.innerText || document.body.textContent || '') : ''),
    ].filter(Boolean).join(' '));
    const lowerMainText = mainText.toLowerCase();
    const lowerDocumentHtml = String(document.body ? (document.body.innerHTML || '') : '').toLowerCase();
    const hasDeepResearchText = lowerMainText.includes('deep research')
      || lowerMainText.includes('深度研究')
      || lowerDocumentHtml.includes('deep research')
      || lowerDocumentHtml.includes('深度研究');
    const hasSitesText = /应用\\s*站点|apply\\s*sites/i.test(mainText)
      || /应用\\s*站点|apply\\s*sites/i.test(String(document.body ? (document.body.innerHTML || '') : ''));
    const conversationMatch = currentPath.match(/^\\/c\\/([^/?#]+)/);
    const documentTitle = clean(document.title || '').replace(/\\s*[-|·].*$/, '').trim();
    const inferredModeLabel = modeNode
      ? combinedLabel(modeNode)
      : (retryNode
        ? combinedLabel(retryNode)
        : (hasDeepResearchText && hasSitesText ? (mainText.includes('深度研究') ? '深度研究' : 'Deep Research') : ''));

    return {
      url: currentUrl,
      pathname: currentPath,
      conversationId: conversationMatch ? conversationMatch[1] : '',
      threadTitle: conversationMatch ? documentTitle : '',
      modeLabel: clean(inferredModeLabel).replace(/[，,].*$/, '').trim(),
      retryLabel: clean(retryNode ? combinedLabel(retryNode) : ''),
      shareVisible: Boolean(shareNode),
      sendLabel: clean(sendNode ? combinedLabel(sendNode) : ''),
      sendEnabled: Boolean(sendNode),
      isDeepResearchPage: currentPath === '/deep-research',
      isSignedIn: loginNode ? false : null,
    };
  })()`;
}

function hasMeaningfulChatGPTDeepResearchSignal(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return false;
  if (snapshot.isSignedIn === false) return true;
  if (snapshot.isDeepResearchPage) return true;
  if (String(snapshot.modeLabel ?? '').trim()) return true;
  if (String(snapshot.retryLabel ?? '').trim()) return true;
  if (String(snapshot.sendLabel ?? '').trim()) return true;
  if (Boolean(snapshot.composerHasText)) return true;
  return false;
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
    if (url.protocol !== 'https:') return null;
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

function isChatGPTAuthUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return false;
  try {
    const url = new URL(raw);
    if (url.hostname === 'auth.openai.com') return true;
    return (url.hostname === CHATGPT_WEB_DOMAIN || url.hostname.endsWith(`.${CHATGPT_WEB_DOMAIN}`))
      && url.pathname.startsWith('/auth/');
  } catch {
    return false;
  }
}

export function normalizeChatGPTTitle(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function normalizeChatGPTOptionLabel(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function pickChatGPTOptionLabel(options, query) {
  const normalizedQuery = normalizeChatGPTOptionLabel(query);
  if (!normalizedQuery) return null;
  const rows = Array.isArray(options)
    ? options.map((option) => ({
      raw: String(option ?? '').trim(),
      normalized: normalizeChatGPTOptionLabel(option),
    })).filter((option) => option.normalized)
    : [];
  return rows.find((option) => option.normalized === normalizedQuery)
    || rows.find((option) => option.normalized.includes(normalizedQuery));
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

export function normalizeChatGPTDeepResearchUiState(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  return CHATGPT_DEEP_RESEARCH_UI_STATES.has(raw) ? raw : '';
}

export function classifyChatGPTDeepResearchSnapshot(snapshot) {
  if (snapshot?.retryLabel && /(deep research|深度研究)/i.test(snapshot.retryLabel) && /(click to retry|点击以重试)/i.test(snapshot.retryLabel)) {
    return 'retry_required';
  }
  if (snapshot?.conversationId && snapshot?.modeLabel) {
    return 'pending';
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
  const explicitUiState = normalizeChatGPTDeepResearchUiState(snapshot?.uiState ?? '');
  const inferredSignedIn = typeof snapshot?.isSignedIn === 'boolean'
    ? snapshot.isSignedIn
    : (isChatGPTAuthUrl(url) ? false : null);
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
    isSignedIn: inferredSignedIn,
  };
  normalized.uiState = explicitUiState || classifyChatGPTDeepResearchSnapshot(normalized);
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
  const detail = extra.detail || (normalized.isSignedIn === false ? 'Not signed in to ChatGPT.' : '');
  if (detail) row.detail = String(detail);
  return row;
}

export async function getCurrentChatGPTUrl(page) {
  return page.evaluate('window.location.href').catch(() => '');
}

export async function openChatGPTDeepResearch(page) {
  await page.goto(CHATGPT_DEEP_RESEARCH_URL, { waitUntil: 'load', settleMs: 2500 });
  await page.wait({ time: 1 });
}

export async function openChatGPTConversation(page, url) {
  await page.goto(url, { waitUntil: 'load', settleMs: 2500 });
  await page.wait({ time: 1 });
}

export async function readChatGPTDeepResearchSnapshot(page) {
  let latestSnapshot = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const snapshot = await page.evaluate(buildSnapshotScript()).catch(() => null);
    if (snapshot) {
      latestSnapshot = snapshot;
      if (hasMeaningfulChatGPTDeepResearchSignal(snapshot)) {
        return normalizeChatGPTDeepResearchSnapshot(snapshot);
      }
    }
    if (attempt < 2) {
      await page.wait({ time: 1 }).catch(() => undefined);
    }
  }

  const fallbackSnapshot = await page.evaluate(buildChatGPTDeepResearchFallbackScript()).catch(async () => ({
    url: await getCurrentChatGPTUrl(page),
  }));
  return normalizeChatGPTDeepResearchSnapshot({
    ...(latestSnapshot && typeof latestSnapshot === 'object' ? latestSnapshot : {}),
    ...(fallbackSnapshot && typeof fallbackSnapshot === 'object' ? fallbackSnapshot : {}),
  });
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
  let pendingSnapshot = lastSnapshot.uiState === 'pending' ? lastSnapshot : null;
  if (lastSnapshot.uiState === 'retry_required') {
    return lastSnapshot;
  }
  for (let attempt = 0; attempt < timeout; attempt += 1) {
    await page.wait({ time: 1 });
    lastSnapshot = await readChatGPTDeepResearchSnapshot(page);
    if (lastSnapshot.uiState === 'retry_required') {
      return lastSnapshot;
    }
    if (lastSnapshot.uiState === 'pending') {
      pendingSnapshot = lastSnapshot;
    }
  }
  if (pendingSnapshot) {
    return pendingSnapshot;
  }
  return {
    ...lastSnapshot,
    uiState: 'submitted',
  };
}

export async function getChatGPTConversationList(page) {
  const items = await page.evaluate(buildConversationListScript()).catch(() => []);
  return Array.isArray(items) ? items.filter((item) => item && typeof item.Url === 'string') : [];
}

function buildConversationSnapshotScript() {
  return `(() => {
    const clean = (value) => String(value ?? '')
      .replace(/\\u00a0/g, ' ')
      .replace(/\\s+/g, ' ')
      .trim();

    const currentUrl = window.location.href;
    const currentPath = window.location.pathname || '';
    const conversationMatch = currentPath.match(/^\\/c\\/([^/?#]+)/);
    const documentTitle = clean(document.title || '').replace(/\\s*[-|·].*$/, '').trim();
    return {
      url: currentUrl,
      pathname: currentPath,
      conversationId: conversationMatch ? conversationMatch[1] : '',
      threadTitle: documentTitle,
      title: documentTitle,
    };
  })()`;
}

export function normalizeChatGPTConversationSnapshot(snapshot) {
  const url = String(snapshot?.url ?? '').trim();
  const title = String(snapshot?.threadTitle ?? snapshot?.title ?? '').trim();
  return {
    url,
    pathname: String(snapshot?.pathname ?? '').trim(),
    title,
    threadTitle: title,
    conversationId: String(snapshot?.conversationId ?? '').trim() || extractChatGPTConversationId(url),
  };
}

export function buildChatGPTHistoryRow(snapshot, extra = {}) {
  const normalized = normalizeChatGPTConversationSnapshot(snapshot);
  const status = String(extra.status ?? '').trim() || 'ok';
  return {
    action: String(extra.action ?? '').trim() || 'history',
    status,
    title: String(extra.title ?? normalized.threadTitle ?? '').trim(),
    url: String(extra.url ?? normalized.url ?? '').trim(),
    conversation_id: String(extra.conversationId ?? normalized.conversationId ?? '').trim(),
    ...(extra.detail ? { detail: String(extra.detail).trim() } : {}),
  };
}

export async function readChatGPTConversationSnapshot(page) {
  const snapshot = await page.evaluate(buildConversationSnapshotScript()).catch(async () => ({
    url: await getCurrentChatGPTUrl(page),
  }));
  return normalizeChatGPTConversationSnapshot(snapshot);
}

function buildConversationMenuActionScript(url, action, payload = '') {
  const menuLabels = ['more', 'more actions', '更多', '更多操作', 'conversation actions', '会话操作'];
  const renameLabels = ['rename', '重命名'];
  const deleteLabels = ['delete', '删除'];
  const saveLabels = ['save', '保存', 'rename', '重命名', 'done', '完成', 'confirm', '确认'];
  return `((targetUrl, targetAction, payloadText) => {
    const waitFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const clean = (value) => String(value ?? '')
      .replace(/\\u00a0/g, ' ')
      .replace(/\\s+/g, ' ')
      .trim();
    const lower = (value) => clean(value).toLowerCase();
    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const combinedLabel = (node) => clean([
      node instanceof HTMLElement ? (node.innerText || node.textContent || '') : '',
      node instanceof Element ? (node.getAttribute('aria-label') || '') : '',
      node instanceof Element ? (node.getAttribute('title') || '') : '',
    ].filter(Boolean).join(' '));
    const toAbsoluteUrl = (href) => {
      try {
        return new URL(href, window.location.origin).href;
      } catch {
        return '';
      }
    };
    const allButtons = (root = document) => Array.from(root.querySelectorAll('button, [role="button"], [role="menuitem"], a, div[role="button"]')).filter((node) => isVisible(node));
    const ancestorChain = (node) => {
      const items = [];
      let current = node instanceof HTMLElement ? node : null;
      while (current && current !== document.body && items.length < 10) {
        items.push(current);
        current = current.parentElement;
      }
      if (document.body) items.push(document.body);
      return items;
    };
    const labelIncludesAny = (value, labels) => labels.some((label) => value === label || value.includes(label));

    const findConversationAnchor = () => Array.from(document.querySelectorAll('a[href]')).find((node) => isVisible(node) && toAbsoluteUrl(node.getAttribute('href') || '') === targetUrl) || null;
    const anchor = findConversationAnchor();
    if (!(anchor instanceof HTMLElement)) {
      return { ok: false, reason: 'conversation-not-found', url: targetUrl };
    }

    const row = ancestorChain(anchor).find((candidate) => allButtons(candidate).some((button) => {
      if (button === anchor) return false;
      const label = lower(combinedLabel(button));
      return labelIncludesAny(label, ${JSON.stringify(['more', 'more actions', '更多', '更多操作', 'conversation actions', '会话操作'])}) || lower(button.getAttribute('aria-haspopup') || '') === 'menu';
    })) || anchor.parentElement || document.body;

    let menuButton = allButtons(row).find((button) => {
      if (button === anchor) return false;
      const label = lower(combinedLabel(button));
      return labelIncludesAny(label, ${JSON.stringify(['more', 'more actions', '更多', '更多操作', 'conversation actions', '会话操作'])}) || lower(button.getAttribute('aria-haspopup') || '') === 'menu';
    }) || null;
    if (!(menuButton instanceof HTMLElement)) {
      const rowButtons = allButtons(row).filter((button) => button !== anchor);
      menuButton = rowButtons[rowButtons.length - 1] || null;
    }
    if (!(menuButton instanceof HTMLElement)) {
      return { ok: false, reason: 'menu-button-not-found', url: targetUrl };
    }

    menuButton.click();
    return waitFor(180).then(() => {
      const actionLabels = targetAction === 'rename' ? ${JSON.stringify(['rename', '重命名'])} : ${JSON.stringify(['delete', '删除'])};
      const actionNode = allButtons(document).find((button) => labelIncludesAny(lower(combinedLabel(button)), actionLabels));
      if (!(actionNode instanceof HTMLElement)) {
        return { ok: false, reason: 'action-not-found', url: targetUrl };
      }
      actionNode.click();
      return waitFor(220).then(() => {
        if (targetAction === 'rename') {
          const input = Array.from(document.querySelectorAll('input, textarea, [contenteditable="true"]')).find((node) => isVisible(node));
          if (!(input instanceof HTMLElement)) {
            return { ok: false, reason: 'rename-input-not-found', url: targetUrl };
          }
          if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
            input.focus();
            input.value = payloadText;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          } else {
            input.focus();
            input.textContent = payloadText;
            input.dispatchEvent(new InputEvent('input', {
              bubbles: true,
              cancelable: true,
              data: payloadText,
              inputType: 'insertText',
            }));
          }
          const saveNode = allButtons(document).find((button) => labelIncludesAny(lower(combinedLabel(button)), ${JSON.stringify(['save', '保存', 'rename', '重命名', 'done', '完成', 'confirm', '确认'])}));
          if (!(saveNode instanceof HTMLElement)) {
            return { ok: false, reason: 'rename-confirm-not-found', url: targetUrl };
          }
          saveNode.click();
          return waitFor(180).then(() => ({ ok: true, action: 'rename', url: targetUrl, threadTitle: payloadText }));
        }

        const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [data-radix-popper-content-wrapper]')).filter((node) => isVisible(node));
        const deleteNode = allButtons(dialogs[0] || document).find((button) => button !== actionNode && labelIncludesAny(lower(combinedLabel(button)), ${JSON.stringify(['delete', '删除'])}));
        if (!(deleteNode instanceof HTMLElement)) {
          return { ok: false, reason: 'delete-confirm-not-found', url: targetUrl };
        }
        deleteNode.click();
        return waitFor(180).then(() => ({ ok: true, action: 'delete', url: targetUrl }));
      });
    });
  })(${JSON.stringify(url)}, ${JSON.stringify(action)}, ${JSON.stringify(payload)})`;
}

export async function renameChatGPTConversation(page, url, title) {
  const targetUrl = parseChatGPTConversationUrl(url);
  const nextTitle = String(title ?? '').trim();
  if (!targetUrl || !nextTitle) {
    return { ok: false, reason: 'invalid-rename-target', url: targetUrl || String(url ?? '').trim() };
  }
  await openChatGPTConversation(page, targetUrl);
  const result = await page.evaluate(buildConversationMenuActionScript(targetUrl, 'rename', nextTitle)).catch((error) => ({
    ok: false,
    reason: error instanceof Error ? error.message : String(error),
    url: targetUrl,
  }));
  return {
    ...normalizeChatGPTConversationSnapshot({ url: targetUrl, threadTitle: nextTitle }),
    ...(result && typeof result === 'object' ? result : {}),
  };
}

export async function deleteChatGPTConversation(page, url) {
  const targetUrl = parseChatGPTConversationUrl(url);
  if (!targetUrl) {
    return { ok: false, reason: 'invalid-delete-target', url: String(url ?? '').trim() };
  }
  await openChatGPTConversation(page, targetUrl);
  const result = await page.evaluate(buildConversationMenuActionScript(targetUrl, 'delete')).catch((error) => ({
    ok: false,
    reason: error instanceof Error ? error.message : String(error),
    url: targetUrl,
  }));
  return {
    ...normalizeChatGPTConversationSnapshot({ url: targetUrl }),
    ...(result && typeof result === 'object' ? result : {}),
  };
}

export const CHATGPT_IMAGES_URL = 'https://chatgpt.com/images';

function buildImageCapabilitiesScript() {
  return `((async () => {
    const clean = (value) => String(value ?? '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
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
    const waitFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const triggerClick = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      try { node.scrollIntoView({ block: 'center', inline: 'center' }); } catch {}
      try { node.focus({ preventScroll: true }); } catch {}
      try {
        const EventCtor = window.PointerEvent || window.MouseEvent;
        node.dispatchEvent(new EventCtor('pointerdown', { bubbles: true, cancelable: true, composed: true, button: 0 }));
      } catch {}
      try { node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, composed: true, button: 0 })); } catch {}
      try { node.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, composed: true, button: 0 })); } catch {}
      try { node.click(); } catch { return false; }
      return true;
    };

    const mainRoot = queryVisible(document, 'main') || queryVisible(document, '[role="main"]') || document.body;
    const accountButton = queryVisible(document, '[data-testid="accounts-profile-button"]');
    const promptInput = Array.from(mainRoot.querySelectorAll('textarea, [contenteditable="true"][role="textbox"], [contenteditable="true"]'))
      .find((node) => isVisible(node)) || null;
    const modelSelector = queryVisible(document, '[data-testid="model-switcher-dropdown-button"]')
      || Array.from(document.querySelectorAll('button, [role="button"]')).find((node) => {
        if (!isVisible(node)) return false;
        const label = lower(attrOf(node, 'aria-label') || textOf(node));
        return label.includes('model selector') || label.includes('模型选择器');
      }) || null;
    const addButton = queryVisible(mainRoot, '#composer-plus-btn')
      || Array.from(mainRoot.querySelectorAll('button')).find((node) => {
        if (!isVisible(node)) return false;
        const label = lower(attrOf(node, 'aria-label') || textOf(node));
        return label.includes('添加文件等') || label.includes('add file');
      }) || null;
    const imageModeButton = Array.from(mainRoot.querySelectorAll('button, [role="button"]')).find((node) => {
      if (!isVisible(node)) return false;
      const label = lower(attrOf(node, 'aria-label') || textOf(node));
      return label === '图片' || label === 'image' || label.includes('图片，点击以重试') || label.includes('image, click to retry');
    }) || null;
    const aspectButton = Array.from(mainRoot.querySelectorAll('button, [role="button"]')).find((node) => {
      if (!isVisible(node)) return false;
      const label = lower(attrOf(node, 'aria-label') || textOf(node));
      return label.includes('image aspect ratio') || label.includes('宽高比') || label === '自动' || label === 'auto';
    }) || null;
    const voiceButton = Array.from(mainRoot.querySelectorAll('button')).find((node) => {
      if (!isVisible(node)) return false;
      const label = lower(attrOf(node, 'aria-label') || textOf(node));
      return label.includes('开始听写') || label.includes('启动语音功能') || label.includes('start dictation') || label.includes('voice');
    }) || null;
    const sendButton = queryVisible(mainRoot, '#composer-submit-button')
      || Array.from(mainRoot.querySelectorAll('button')).find((node) => {
        if (!isVisible(node)) return false;
        const label = lower(attrOf(node, 'aria-label') || textOf(node));
        return label.includes('发送提示') || label.includes('send prompt');
      }) || null;

    const promptPlaceholder = attrOf(promptInput, 'placeholder') || attrOf(promptInput, 'aria-label');
    const isImageComposer = Boolean(
      /描述(新图片|或编辑图片)|describe (a )?new image|describe or edit image/i.test(promptPlaceholder)
      || imageModeButton
      || aspectButton
    );

    const findSectionByHeading = (heading) => Array.from(mainRoot.querySelectorAll('section')).find((section) => isVisible(section) && textOf(section).includes(heading)) || null;
    const collectSectionButtons = (section) => uniq(Array.from(section ? section.querySelectorAll('button') : []).filter((button) => isVisible(button)).map((button) => {
      const label = attrOf(button, 'title') || attrOf(button, 'aria-label') || textOf(button);
      return clean(label).replace(/[›>].*$/, '');
    }).filter((label) => {
      const normalized = lower(label);
      return label && !normalized.includes('上一页') && !normalized.includes('下一页') && !normalized.includes('previous') && !normalized.includes('next') && !normalized.includes('添加你自己的图片');
    }));

    const styleSection = findSectionByHeading('在图像上试用风格效果') || findSectionByHeading('Try styles on images');
    const taskSection = findSectionByHeading('发现新事物') || findSectionByHeading('Discover something new');
    const resultActions = uniq(Array.from(document.querySelectorAll('[data-testid="image-gen-overlay-left-actions"] button, [data-testid="image-gen-overlay-right-actions"] button')).filter((button) => isVisible(button)).map((button) => attrOf(button, 'aria-label') || textOf(button)).filter((label) => {
      const normalized = lower(label);
      return normalized.includes('打开图片') || normalized.includes('open image') || normalized.includes('编辑图片') || normalized.includes('edit image') || normalized.includes('分享此图片') || normalized.includes('share this image');
    }));
    const uploadInputs = uniq(Array.from(mainRoot.querySelectorAll('input[type="file"]')).map((node) => {
      const id = attrOf(node, 'id');
      const accept = attrOf(node, 'accept');
      return id || accept ? [id || 'file-input', accept ? '(' + accept + ')' : ''].filter(Boolean).join(' ') : '';
    }));
    const dragDropNode = Array.from(mainRoot.querySelectorAll('h3, div, span')).find((node) => {
      if (!isVisible(node)) return false;
      const value = lower(textOf(node));
      return value.includes('拖放图片以上传') || (value.includes('drag') && value.includes('upload'));
    }) || null;

    const collectModelOptions = () => {
      const menuRoots = Array.from(document.querySelectorAll('[data-radix-popper-content-wrapper], [role="menu"], [role="listbox"], [data-state="open"]'))
        .filter((node) => isVisible(node));
      const seen = new Set();
      const labels = [];
      for (const root of menuRoots) {
        const candidates = Array.from(root.querySelectorAll('[role="menuitem"], [role="menuitemradio"], [role="option"], button, [role="button"], [data-radix-collection-item], [tabindex]'));
        for (const node of candidates) {
          if (!isVisible(node)) continue;
          const label = clean(attrOf(node, 'aria-label') || textOf(node));
          if (!label || label.length > 80) continue;
          const normalized = lower(label);
          if (normalized === lower(textOf(modelSelector)) || normalized === lower(attrOf(modelSelector, 'aria-label'))) continue;
          if (seen.has(normalized)) continue;
          seen.add(normalized);
          labels.push(label);
        }
      }
      return labels;
    };

    let modelOptions = [];
    if (modelSelector instanceof HTMLElement) {
      triggerClick(modelSelector);
      for (let attempt = 0; attempt < 4; attempt += 1) {
        await waitFor(160);
        modelOptions = collectModelOptions();
        if (modelOptions.length > 0) break;
      }
      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }

    return {
      url: window.location.href,
      pathname: window.location.pathname || '',
      title: clean(document.title || ''),
      accountTier: textOf(accountButton).includes('Pro') ? 'Pro' : '',
      modelSelectorLabel: textOf(modelSelector) || attrOf(modelSelector, 'aria-label'),
      modelOptions,
      promptPlaceholder,
      addButtonLabel: attrOf(addButton, 'aria-label') || textOf(addButton),
      imageModeButtonLabel: imageModeButton ? (attrOf(imageModeButton, 'aria-label') || textOf(imageModeButton)) : '',
      aspectButtonLabel: aspectButton ? (attrOf(aspectButton, 'aria-label') || textOf(aspectButton)) : '',
      voiceButtonLabel: attrOf(voiceButton, 'aria-label') || textOf(voiceButton),
      sendButtonLabel: attrOf(sendButton, 'aria-label') || textOf(sendButton),
      dragDropText: textOf(dragDropNode),
      uploadInputs,
      styleCards: collectSectionButtons(styleSection),
      taskCards: collectSectionButtons(taskSection),
      resultActions,
      isImagesPage: (window.location.pathname || '').startsWith('/images'),
      isImageComposer,
    };
  })())`;
}

export function normalizeChatGPTImageCapabilitySnapshot(snapshot) {
  const asArray = (value) => Array.isArray(value) ? Array.from(new Set(value.map((item) => String(item ?? '').trim()).filter(Boolean))) : [];
  const url = String(snapshot?.url ?? '').trim();
  const inferredSignedIn = typeof snapshot?.isSignedIn === 'boolean'
    ? snapshot.isSignedIn
    : (isChatGPTAuthUrl(url) ? false : null);
  return {
    detail: String(snapshot?.detail ?? '').trim(),
    url,
    pathname: String(snapshot?.pathname ?? '').trim(),
    title: String(snapshot?.title ?? '').trim(),
    accountTier: String(snapshot?.accountTier ?? '').trim(),
    modelSelectorLabel: String(snapshot?.modelSelectorLabel ?? '').trim(),
    modelOptions: asArray(snapshot?.modelOptions),
    promptPlaceholder: String(snapshot?.promptPlaceholder ?? '').trim(),
    addButtonLabel: String(snapshot?.addButtonLabel ?? '').trim(),
    imageModeButtonLabel: String(snapshot?.imageModeButtonLabel ?? '').trim(),
    aspectButtonLabel: String(snapshot?.aspectButtonLabel ?? '').trim(),
    voiceButtonLabel: String(snapshot?.voiceButtonLabel ?? '').trim(),
    sendButtonLabel: String(snapshot?.sendButtonLabel ?? '').trim(),
    dragDropText: String(snapshot?.dragDropText ?? '').trim(),
    uploadInputs: asArray(snapshot?.uploadInputs),
    styleCards: asArray(snapshot?.styleCards),
    taskCards: asArray(snapshot?.taskCards),
    resultActions: asArray(snapshot?.resultActions),
    isImagesPage: Boolean(snapshot?.isImagesPage),
    isImageComposer: Boolean(snapshot?.isImageComposer),
    isSignedIn: inferredSignedIn,
  };
}

export function buildChatGPTImageCapabilityRows(snapshot) {
  const normalized = normalizeChatGPTImageCapabilitySnapshot(snapshot);
  const rows = [];
  const push = (Category, Name, Value) => {
    if (Value === undefined || Value === null) return;
    const text = String(Value).trim();
    if (!text) return;
    rows.push({ Category, Name, Value: text });
  };

  push('page', 'url', normalized.url);
  push('page', 'title', normalized.title);
  push('debug', 'detail', normalized.detail);

  if (normalized.isSignedIn === false) {
    push('state', 'status', 'blocked');
    push('state', 'reason', 'not-signed-in');
    return rows;
  }

  const imageContextVisible = Boolean(
    normalized.isImageComposer
    || normalized.styleCards.length > 0
    || normalized.taskCards.length > 0
    || normalized.resultActions.length > 0
    || normalized.dragDropText
    || normalized.uploadInputs.length > 0
  );

  if (!normalized.isImagesPage && !imageContextVisible) {
    push('state', 'status', 'absent');
    push('state', 'reason', 'not-images-page');
    return rows;
  }

  if (!imageContextVisible) {
    push('state', 'status', 'absent');
    push('state', 'reason', 'no-image-context');
    return rows;
  }

  push('account', 'tier', normalized.accountTier);
  push('composer', 'model_selector', normalized.modelSelectorLabel);
  normalized.modelOptions.forEach((item) => push('composer', 'model_option', item));
  push('composer', 'prompt_placeholder', normalized.promptPlaceholder);
  push('composer', 'add_button', normalized.addButtonLabel);
  push('composer', 'image_mode_button', normalized.imageModeButtonLabel);
  push('composer', 'aspect_button', normalized.aspectButtonLabel);
  push('composer', 'voice_button', normalized.voiceButtonLabel);
  push('composer', 'send_button', normalized.sendButtonLabel);
  push('upload', 'drag_drop', normalized.dragDropText || (normalized.uploadInputs.length ? 'supported' : ''));
  normalized.uploadInputs.forEach((item) => push('upload', 'input', item));
  normalized.styleCards.forEach((item) => push('style_preset', 'card', item));
  normalized.taskCards.forEach((item) => push('task_template', 'card', item));
  normalized.resultActions.forEach((item) => push('result_action', 'action', item));
  return rows;
}

export async function openChatGPTImages(page) {
  await page.goto(CHATGPT_IMAGES_URL, { waitUntil: 'load', settleMs: 2500 });
  await page.wait({ time: 1 });
}

function buildEnterImageComposerScript() {
  const imageComposerSelectorsJson = JSON.stringify(CHATGPT_IMAGE_COMPOSER_SELECTORS);
  return `((async () => {
    const waitFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const clean = (value) => String(value ?? '')
      .replace(/\\u00a0/g, ' ')
      .replace(/\\s+/g, ' ')
      .trim();
    const lower = (value) => clean(value).toLowerCase();
    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const attrOf = (node, name) => clean(node instanceof Element ? (node.getAttribute(name) || '') : '');
    const textOf = (node) => clean(node instanceof HTMLElement ? (node.innerText || node.textContent || '') : '');
    const combinedLabel = (node) => clean([textOf(node), attrOf(node, 'aria-label'), attrOf(node, 'title')].filter(Boolean).join(' '));
    const queryVisible = (root, selector) => Array.from(root.querySelectorAll(selector)).find((node) => isVisible(node)) || null;
    const triggerClick = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      try { node.scrollIntoView({ block: 'center', inline: 'center' }); } catch {}
      try { node.focus({ preventScroll: true }); } catch {}
      try {
        const EventCtor = window.PointerEvent || window.MouseEvent;
        node.dispatchEvent(new EventCtor('pointerdown', { bubbles: true, cancelable: true, composed: true, button: 0 }));
      } catch {}
      try { node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, composed: true, button: 0 })); } catch {}
      try { node.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, composed: true, button: 0 })); } catch {}
      try { node.click(); } catch { return false; }
      return true;
    };
    const currentPath = window.location.pathname || '';
    const currentUrl = window.location.href;
    const mainRoot = queryVisible(document, 'main') || queryVisible(document, '[role="main"]') || document.body;
    const findImageComposer = () => Array.from(mainRoot.querySelectorAll(${imageComposerSelectorsJson}.join(',')))
      .find((node) => isVisible(node)) || null;
    const findImageModeButton = () => Array.from(mainRoot.querySelectorAll('button, [role="button"]')).find((node) => {
      if (!isVisible(node)) return false;
      const label = lower(attrOf(node, 'aria-label') || textOf(node));
      return label === '图片' || label === 'image' || label.includes('图片，点击以重试') || label.includes('image, click to retry');
    }) || null;
    const findAspectButton = () => Array.from(mainRoot.querySelectorAll('button, [role="button"]')).find((node) => {
      if (!isVisible(node)) return false;
      const label = lower(attrOf(node, 'aria-label') || textOf(node));
      return label.includes('image aspect ratio') || label.includes('宽高比') || label === '自动' || label === 'auto';
    }) || null;
    const detectImageContext = () => {
      const composer = findImageComposer();
      const promptPlaceholder = attrOf(composer, 'placeholder') || attrOf(composer, 'aria-label');
      const imageModeButton = findImageModeButton();
      const aspectButton = findAspectButton();
      return {
        composer,
        promptPlaceholder,
        imageModeButton,
        aspectButton,
        active: Boolean(
          currentPath.startsWith('/images')
          || /描述(新图片|或编辑图片)|describe (a )?new image|describe or edit image/i.test(promptPlaceholder)
          || imageModeButton
          || aspectButton
        ),
      };
    };
    const initial = detectImageContext();
    if (initial.active) {
      return {
        ok: true,
        method: currentPath.startsWith('/images') ? 'images-page' : 'already-image-composer',
        pageUrl: currentUrl,
        pagePath: currentPath,
        promptPlaceholder: initial.promptPlaceholder,
        imageModeButtonLabel: initial.imageModeButton ? combinedLabel(initial.imageModeButton) : '',
        aspectButtonLabel: initial.aspectButton ? combinedLabel(initial.aspectButton) : '',
      };
    }

    const plusButton = queryVisible(mainRoot, '#composer-plus-btn')
      || Array.from(mainRoot.querySelectorAll('button, [role="button"]')).find((node) => {
        if (!isVisible(node)) return false;
        const label = lower(attrOf(node, 'aria-label') || textOf(node));
        return label.includes('添加文件等') || label.includes('add photo') || label.includes('add files') || label.includes('add photos and files');
      }) || null;
    if (!(plusButton instanceof HTMLElement)) {
      return { ok: false, reason: 'plus-button-not-found', pageUrl: currentUrl, pagePath: currentPath };
    }

    triggerClick(plusButton);
    const collectMenuOptions = () => {
      const menuRoots = Array.from(document.querySelectorAll('[data-radix-popper-content-wrapper], [role="menu"], [role="dialog"], [data-state="open"]'))
        .filter((node) => isVisible(node));
      const seen = new Set();
      const options = [];
      for (const root of menuRoots) {
        const candidates = Array.from(root.querySelectorAll('[role="menuitem"], [role="menuitemradio"], [role="option"], button, [role="button"], a, [tabindex]'));
        for (const node of candidates) {
          if (!isVisible(node)) continue;
          const label = combinedLabel(node);
          if (!label || label.length > 80) continue;
          const normalized = lower(label);
          if (seen.has(normalized)) continue;
          seen.add(normalized);
          options.push({ node, label, normalized, role: attrOf(node, 'role') });
        }
      }
      return options;
    };

    let options = [];
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await waitFor(140);
      options = collectMenuOptions();
      if (options.length > 0) break;
    }
    const createImage = options
      .filter((option) => option.normalized.includes('创建图片') || (option.normalized.includes('create') && option.normalized.includes('image')))
      .sort((a, b) => {
        const aExact = a.normalized === '创建图片' || a.normalized === 'create image';
        const bExact = b.normalized === '创建图片' || b.normalized === 'create image';
        const aScore = (aExact ? 20 : 0) + ((a.role === 'menuitemradio' || a.role === 'menuitem' || a.role === 'option') ? 10 : 0);
        const bScore = (bExact ? 20 : 0) + ((b.role === 'menuitemradio' || b.role === 'menuitem' || b.role === 'option') ? 10 : 0);
        return bScore - aScore;
      })[0] || null;
    if (!(createImage?.node instanceof HTMLElement)) {
      return {
        ok: false,
        reason: options.length > 0 ? 'create-image-option-not-found' : 'plus-menu-not-open',
        pageUrl: currentUrl,
        pagePath: currentPath,
        availableLabels: options.map((option) => option.label),
      };
    }

    triggerClick(createImage.node);
    for (let attempt = 0; attempt < 16; attempt += 1) {
      await waitFor(180);
      const next = detectImageContext();
      if (next.active) {
        return {
          ok: true,
          method: 'plus-menu',
          selectedLabel: createImage.label,
          pageUrl: window.location.href,
          pagePath: window.location.pathname || '',
          promptPlaceholder: next.promptPlaceholder,
          imageModeButtonLabel: next.imageModeButton ? combinedLabel(next.imageModeButton) : '',
          aspectButtonLabel: next.aspectButton ? combinedLabel(next.aspectButton) : '',
        };
      }
    }

    return {
      ok: false,
      reason: 'image-context-not-entered',
      pageUrl: window.location.href,
      pagePath: window.location.pathname || '',
      selectedLabel: createImage.label,
      availableLabels: options.map((option) => option.label),
    };
  })())`;
}

export async function enterChatGPTImageComposer(page) {
  const result = await page.evaluate(buildEnterImageComposerScript()).catch(async (error) => ({
    ok: false,
    reason: error instanceof Error ? error.message : String(error),
    pageUrl: await getCurrentChatGPTUrl(page),
  }));
  return result && typeof result === 'object' ? result : { ok: false, reason: 'Unknown ChatGPT image entry result.' };
}

export async function readChatGPTImageCapabilities(page) {
  const snapshot = await page.evaluate(buildImageCapabilitiesScript()).catch(async (error) => ({
    url: await getCurrentChatGPTUrl(page),
    detail: error instanceof Error ? error.message : String(error),
  }));
  return normalizeChatGPTImageCapabilitySnapshot(snapshot);
}

function buildImageModeSelectionScript(requestedMode) {
  return `((requestedLabel) => {
    const waitFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const clean = (value) => String(value ?? '')
      .replace(/\\u00a0/g, ' ')
      .replace(/\\s+/g, ' ')
      .trim();
    const lower = (value) => clean(value).toLowerCase();
    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const attrOf = (node, name) => clean(node instanceof Element ? (node.getAttribute(name) || '') : '');
    const textOf = (node) => clean(node instanceof HTMLElement ? (node.innerText || node.textContent || '') : '');
    const triggerClick = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      try { node.scrollIntoView({ block: 'center', inline: 'center' }); } catch {}
      try { node.focus({ preventScroll: true }); } catch {}
      try {
        const EventCtor = window.PointerEvent || window.MouseEvent;
        node.dispatchEvent(new EventCtor('pointerdown', { bubbles: true, cancelable: true, composed: true, button: 0 }));
      } catch {}
      try { node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, composed: true, button: 0 })); } catch {}
      try { node.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, composed: true, button: 0 })); } catch {}
      try { node.click(); } catch { return false; }
      return true;
    };
    const currentQuery = lower(requestedLabel);
    if (!currentQuery) return { ok: true, skipped: true };

    const modelSelector = Array.from(document.querySelectorAll('[data-testid="model-switcher-dropdown-button"], button, [role="button"]'))
      .find((node) => {
        if (!isVisible(node)) return false;
        const dataTestId = node instanceof Element ? (node.getAttribute('data-testid') || '') : '';
        if (dataTestId === 'model-switcher-dropdown-button') return true;
        const label = lower(attrOf(node, 'aria-label') || textOf(node));
        return label.includes('model selector') || label.includes('模型选择器');
      }) || null;
    if (!(modelSelector instanceof HTMLElement)) {
      return { ok: false, reason: 'model-selector-not-found' };
    }

    const currentLabel = textOf(modelSelector) || attrOf(modelSelector, 'aria-label');
    const selectorLabels = [currentLabel, attrOf(modelSelector, 'aria-label')].map((label) => lower(label)).filter(Boolean);
    if (selectorLabels.includes(currentQuery)) {
      return { ok: true, selectedLabel: currentLabel, currentLabel, alreadySelected: true, availableLabels: [] };
    }

    const collectOptions = () => {
      const menuRoots = Array.from(document.querySelectorAll('[data-radix-popper-content-wrapper], [role="menu"], [role="listbox"], [data-state="open"]'))
        .filter((node) => isVisible(node));
      const seen = new Set();
      const options = [];
      for (const root of menuRoots) {
        const candidates = Array.from(root.querySelectorAll('[role="menuitem"], [role="menuitemradio"], [role="option"], button, [role="button"], [data-radix-collection-item], [tabindex]'));
        for (const node of candidates) {
          if (!isVisible(node)) continue;
          const label = clean(attrOf(node, 'aria-label') || textOf(node));
          if (!label || label.length > 80) continue;
          const normalized = lower(label);
          if (selectorLabels.includes(normalized) || seen.has(normalized)) continue;
          seen.add(normalized);
          options.push({ node, label, normalized });
        }
      }
      return options;
    };

    return (async () => {
      triggerClick(modelSelector);
      let options = [];
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await waitFor(180);
        options = collectOptions();
        if (options.length > 0) break;
      }

      const exact = options.find((option) => option.normalized === currentQuery) || null;
      const partial = exact || options
        .filter((option) => option.normalized.includes(currentQuery))
        .sort((a, b) => {
          const aScore = (a.normalized.startsWith(currentQuery) ? 10 : 0) - a.label.length;
          const bScore = (b.normalized.startsWith(currentQuery) ? 10 : 0) - b.label.length;
          return bScore - aScore;
        })[0] || null;
      if (!partial?.node || !(partial.node instanceof HTMLElement)) {
        document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return {
          ok: false,
          reason: options.length > 0 ? 'mode-option-not-found' : 'mode-options-not-visible',
          currentLabel,
          availableLabels: options.map((option) => option.label),
        };
      }

      triggerClick(partial.node);
      await waitFor(180);
      return {
        ok: true,
        currentLabel,
        selectedLabel: partial.label,
        availableLabels: options.map((option) => option.label),
      };
    })();
  })(${JSON.stringify(requestedMode)})`;
}

export async function selectChatGPTImageMode(page, requestedMode) {
  const query = String(requestedMode ?? '').trim();
  if (!query) return { ok: true, skipped: true };
  const result = await page.evaluate(buildImageModeSelectionScript(query)).catch((error) => ({
    ok: false,
    reason: error instanceof Error ? error.message : String(error),
    currentLabel: '',
    availableLabels: [],
  }));
  return result && typeof result === 'object' ? result : { ok: false, reason: 'Unknown ChatGPT image mode selection result.' };
}

function buildImageAspectSelectionScript(requestedAspect) {
  return `((requestedLabel) => {
    const waitFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const clean = (value) => String(value ?? '')
      .replace(/\\u00a0/g, ' ')
      .replace(/\\s+/g, ' ')
      .trim();
    const lower = (value) => clean(value).toLowerCase();
    const compact = (value) => lower(value).replace(/[：:]/g, ':').replace(/\\s+/g, '');
    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const attrOf = (node, name) => clean(node instanceof Element ? (node.getAttribute(name) || '') : '');
    const textOf = (node) => clean(node instanceof HTMLElement ? (node.innerText || node.textContent || '') : '');
    const combinedLabel = (node) => clean([textOf(node), attrOf(node, 'aria-label'), attrOf(node, 'title')].filter(Boolean).join(' '));
    const triggerClick = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      try { node.scrollIntoView({ block: 'center', inline: 'center' }); } catch {}
      try { node.focus({ preventScroll: true }); } catch {}
      try {
        const EventCtor = window.PointerEvent || window.MouseEvent;
        node.dispatchEvent(new EventCtor('pointerdown', { bubbles: true, cancelable: true, composed: true, button: 0 }));
      } catch {}
      try { node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, composed: true, button: 0 })); } catch {}
      try { node.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, composed: true, button: 0 })); } catch {}
      try { node.click(); } catch { return false; }
      return true;
    };
    const queryRaw = clean(requestedLabel);
    const query = compact(queryRaw);
    if (!query) return { ok: true, skipped: true };

    const aliasesByQuery = new Map([
      ['auto', ['auto', 'automatic', '自动']],
      ['自动', ['auto', 'automatic', '自动']],
      ['square', ['square', '1:1', '方形', '正方形']],
      ['方形', ['square', '1:1', '方形', '正方形']],
      ['正方形', ['square', '1:1', '方形', '正方形']],
      ['landscape', ['landscape', '16:9', '4:3', '横向', '横版', '横屏', '宽屏', 'widescreen']],
      ['横向', ['landscape', '16:9', '4:3', '横向', '横版', '横屏', '宽屏', 'widescreen']],
      ['横版', ['landscape', '16:9', '4:3', '横向', '横版', '横屏', '宽屏', 'widescreen']],
      ['横屏', ['landscape', '16:9', '4:3', '横向', '横版', '横屏', '宽屏', 'widescreen']],
      ['wide', ['wide', 'widescreen', '16:9', '宽屏']],
      ['widescreen', ['wide', 'widescreen', '16:9', '宽屏']],
      ['宽屏', ['wide', 'widescreen', '16:9', '宽屏']],
      ['portrait', ['portrait', '9:16', '3:4', '纵向', '竖向', '竖版', '故事', 'story']],
      ['纵向', ['portrait', '9:16', '3:4', '纵向', '竖向', '竖版', '故事', 'story']],
      ['竖向', ['portrait', '9:16', '3:4', '纵向', '竖向', '竖版', '故事', 'story']],
      ['竖版', ['portrait', '9:16', '3:4', '纵向', '竖向', '竖版', '故事', 'story']],
      ['story', ['story', '9:16', '故事']],
      ['故事', ['story', '9:16', '故事']],
    ]);
    const wanted = new Set([query, lower(queryRaw), ...((aliasesByQuery.get(query) || aliasesByQuery.get(lower(queryRaw)) || []).map((item) => compact(item)))]);
    const ratioPattern = /\\b\\d+\\s*[:：]\\s*\\d+\\b/;
    const isAspectishLabel = (label) => {
      const value = lower(label);
      const flat = compact(label);
      return ratioPattern.test(label)
        || value.includes('aspect')
        || value.includes('ratio')
        || value.includes('size')
        || value.includes('orientation')
        || value.includes('比例')
        || value.includes('尺寸')
        || value.includes('横向')
        || value.includes('横版')
        || value.includes('横屏')
        || value.includes('宽屏')
        || value.includes('竖向')
        || value.includes('竖版')
        || value.includes('纵向')
        || value.includes('故事')
        || value.includes('方形')
        || value.includes('正方形')
        || flat === 'auto'
        || flat === '自动'
        || flat.includes('square')
        || flat.includes('portrait')
        || flat.includes('landscape')
        || flat.includes('widescreen');
    };
    const matchesWanted = (label) => {
      const value = lower(label);
      const flat = compact(label);
      if (wanted.has(flat) || wanted.has(value)) return true;
      for (const item of wanted) {
        if (item && (flat.includes(item) || value.includes(item))) return true;
      }
      return false;
    };
    const isBadControl = (node) => {
      const label = lower(combinedLabel(node));
      const testId = lower(attrOf(node, 'data-testid'));
      return testId.includes('model-switcher')
        || testId.includes('send')
        || label.includes('send prompt')
        || label.includes('发送提示')
        || label.includes('添加文件')
        || label.includes('add file')
        || label.includes('voice')
        || label.includes('dictation');
    };
    const allClickable = () => Array.from(document.querySelectorAll('button, [role="button"], [role="menuitem"], [role="option"], [data-radix-collection-item]'))
      .filter((node) => isVisible(node) && !isBadControl(node));
    const collectOptions = () => {
      const roots = Array.from(document.querySelectorAll('[data-radix-popper-content-wrapper], [role="menu"], [role="listbox"], [data-state="open"]'))
        .filter((node) => isVisible(node));
      const candidates = roots.length > 0
        ? roots.flatMap((root) => Array.from(root.querySelectorAll('[role="menuitem"], [role="menuitemradio"], [role="option"], button, [role="button"], [data-radix-collection-item], [tabindex]')))
        : allClickable();
      const seen = new Set();
      const options = [];
      for (const node of candidates) {
        if (!(node instanceof HTMLElement) || !isVisible(node) || isBadControl(node)) continue;
        const label = combinedLabel(node);
        if (!label || label.length > 100) continue;
        if (!isAspectishLabel(label) && !matchesWanted(label)) continue;
        const key = compact(label);
        if (seen.has(key)) continue;
        seen.add(key);
        options.push({ node, label, normalized: key });
      }
      return options;
    };

    return (async () => {
      const visibleOptions = collectOptions();
      const already = visibleOptions.find((option) => matchesWanted(option.label) && /true|checked/i.test(String(option.node.getAttribute('aria-selected') || option.node.getAttribute('aria-checked') || option.node.getAttribute('aria-pressed') || '')));
      if (already) {
        return { ok: true, alreadySelected: true, selectedLabel: already.label, currentLabel: already.label, availableLabels: visibleOptions.map((option) => option.label) };
      }

      const direct = visibleOptions.find((option) => matchesWanted(option.label)) || null;
      if (direct?.node instanceof HTMLElement) {
        triggerClick(direct.node);
        await waitFor(180);
        return { ok: true, selectedLabel: direct.label, currentLabel: '', availableLabels: visibleOptions.map((option) => option.label) };
      }

      const triggerCandidates = allClickable().filter((node) => isAspectishLabel(combinedLabel(node)));
      const sortedTriggers = triggerCandidates.sort((a, b) => {
        const aLabel = combinedLabel(a);
        const bLabel = combinedLabel(b);
        const aScore = ratioPattern.test(aLabel) ? 10 : 0;
        const bScore = ratioPattern.test(bLabel) ? 10 : 0;
        return bScore - aScore;
      });
      const tried = [];
      let lastOptions = visibleOptions;
      for (const trigger of sortedTriggers.slice(0, 8)) {
        const triggerLabel = combinedLabel(trigger);
        tried.push(triggerLabel);
        triggerClick(trigger);
        for (let attempt = 0; attempt < 5; attempt += 1) {
          await waitFor(160);
          const options = collectOptions();
          if (options.length > 0) lastOptions = options;
          const found = options.find((option) => matchesWanted(option.label));
          if (found?.node instanceof HTMLElement) {
            triggerClick(found.node);
            await waitFor(180);
            return { ok: true, selectedLabel: found.label, currentLabel: triggerLabel, availableLabels: options.map((option) => option.label), triggerLabel };
          }
        }
      }
      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return {
        ok: false,
        reason: lastOptions.length > 0 ? 'aspect-option-not-found' : 'aspect-selector-not-found',
        requestedLabel: queryRaw,
        availableLabels: Array.from(new Set(lastOptions.map((option) => option.label).concat(tried))).filter(Boolean),
      };
    })();
  })(${JSON.stringify(requestedAspect)})`;
}

export async function selectChatGPTImageAspect(page, requestedAspect) {
  const query = String(requestedAspect ?? '').trim();
  if (!query) return { ok: true, skipped: true };
  const result = await page.evaluate(buildImageAspectSelectionScript(query)).catch((error) => ({
    ok: false,
    reason: error instanceof Error ? error.message : String(error),
    currentLabel: '',
    availableLabels: [],
  }));
  return result && typeof result === 'object' ? result : { ok: false, reason: 'Unknown ChatGPT image aspect selection result.' };
}

function buildImageReferenceUploadScript(fileSpec) {
  return `((referenceFile) => {
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
    const lower = (value) => clean(value).toLowerCase();
    const bytesFromBase64 = (base64) => {
      const binary = atob(String(base64 || ''));
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      return bytes;
    };
    const acceptsImage = (input) => {
      const accept = lower(attrOf(input, 'accept'));
      return !accept || accept.includes('image') || accept.includes('.png') || accept.includes('.jpg') || accept.includes('.jpeg') || accept.includes('.webp') || accept.includes('.gif') || accept.includes('.avif');
    };
    const findFileInput = () => Array.from(document.querySelectorAll('input[type="file"]'))
      .find((node) => node instanceof HTMLInputElement && acceptsImage(node)) || null;
    const countAttachmentSignals = () => {
      const fileName = clean(referenceFile.name);
      const text = clean(document.body?.innerText || document.body?.textContent || '');
      const hasFileName = Boolean(fileName && text.includes(fileName));
      const previews = Array.from(document.querySelectorAll('img, [data-testid*="attachment"], [data-testid*="upload"], [aria-label*="Remove"], [aria-label*="移除"]'))
        .filter((node) => isVisible(node)).length;
      return { hasFileName, previews };
    };

    return (async () => {
      const input = findFileInput();
      if (!(input instanceof HTMLInputElement)) {
        return { ok: false, reason: 'No image file input was found on the ChatGPT image page.' };
      }
      const before = countAttachmentSignals();
      const file = new File([bytesFromBase64(referenceFile.base64)], referenceFile.name || 'reference.png', { type: referenceFile.mimeType || 'image/png', lastModified: Date.now() });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      input.files = dataTransfer.files;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      let latest = before;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await waitFor(250);
        latest = countAttachmentSignals();
        if (latest.hasFileName || latest.previews > before.previews) {
          return {
            ok: true,
            fileName: referenceFile.name || file.name,
            mimeType: referenceFile.mimeType || file.type,
            confirmed: true,
            inputAccept: attrOf(input, 'accept'),
          };
        }
      }
      return {
        ok: true,
        fileName: referenceFile.name || file.name,
        mimeType: referenceFile.mimeType || file.type,
        confirmed: false,
        inputAccept: attrOf(input, 'accept'),
        reason: 'File was assigned to the image input, but no visible attachment preview was detected before timeout.',
      };
    })();
  })(${JSON.stringify(fileSpec)})`;
}

export async function uploadChatGPTImageReference(page, fileSpec) {
  if (!fileSpec?.base64) return { ok: false, reason: 'No reference image payload was provided.' };
  const result = await page.evaluate(buildImageReferenceUploadScript(fileSpec)).catch((error) => ({
    ok: false,
    reason: error instanceof Error ? error.message : String(error),
  }));
  return result && typeof result === 'object' ? result : { ok: false, reason: 'Unknown ChatGPT image upload result.' };
}

function buildImageCreateStateScript() {
  return `(() => {
    const clean = (value) => String(value ?? '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
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
    const actionSelectors = '[data-testid="image-gen-overlay-left-actions"] button, [data-testid="image-gen-overlay-right-actions"] button, button, [role="button"], a';

    const accountButton = document.querySelector('[data-testid="accounts-profile-button"]');
    const modelSelector = document.querySelector('[data-testid="model-switcher-dropdown-button"]');
    const resultActionLabels = uniq(Array.from(document.querySelectorAll(actionSelectors))
      .filter((node) => isVisible(node))
      .map((node) => attrOf(node, 'aria-label') || textOf(node))
      .filter((label) => {
        const normalized = lower(label);
        return normalized.includes('打开图片') || normalized.includes('open image')
          || normalized.includes('编辑图片') || normalized.includes('edit image')
          || normalized.includes('分享此图片') || normalized.includes('share this image');
      }));

    return {
      url: window.location.href,
      pathname: window.location.pathname || '',
      title: clean(document.title || ''),
      accountTier: textOf(accountButton).includes('Pro') ? 'Pro' : '',
      modeLabel: textOf(modelSelector) || attrOf(modelSelector, 'aria-label'),
      resultActionLabels,
      isImagesPage: (window.location.pathname || '').startsWith('/images'),
      isConversationPage: /^\\/c\\//.test(window.location.pathname || ''),
    };
  })()`;
}

function buildImageCreatePromptScript(prompt) {
  const composerSelectorsJson = JSON.stringify(CHATGPT_IMAGE_COMPOSER_SELECTORS);
  const sendSelectorsJson = JSON.stringify(CHATGPT_IMAGE_SEND_BUTTON_SELECTORS);
  return `((inputText) => {
    const waitFor = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const clean = (value) => String(value ?? '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
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

      throw new Error('No ChatGPT image composer found');
    };

    let composer = findFirstVisible(${composerSelectorsJson});
    if (!(composer instanceof HTMLElement)) {
      composer = Array.from(document.querySelectorAll('textarea, [contenteditable="true"], [role="textbox"]'))
        .find((node) => isVisible(node)) || null;
    }

    if (!(composer instanceof HTMLElement)) {
      return { ok: false, reason: 'ChatGPT image composer was not found.' };
    }

    try {
      fillComposer(composer, inputText);
    } catch (error) {
      return {
        ok: false,
        reason: 'Failed to insert the prompt into the ChatGPT image composer.',
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
        reason: 'ChatGPT image send button did not become clickable after prompt insertion.',
      };
    })();
  })(${JSON.stringify(prompt)})`;
}

function normalizeChatGPTImageCreateStatus(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  return new Set(['blocked', 'failed', 'submitted', 'result_visible']).has(raw) ? raw : '';
}

function normalizeChatGPTImageResultAction(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return '';
  if (raw.includes('打开图片') || raw.includes('open image')) return 'open';
  if (raw.includes('编辑图片') || raw.includes('edit image')) return 'edit';
  if (raw.includes('分享此图片') || raw.includes('share this image')) return 'share';
  return '';
}

export function hasChatGPTImageContext(snapshot) {
  const normalized = normalizeChatGPTImageCapabilitySnapshot(snapshot);
  return Boolean(
    (normalized.isImagesPage || normalized.isImageComposer)
    && (normalized.isImageComposer
      || normalized.styleCards.length > 0
      || normalized.taskCards.length > 0
      || normalized.resultActions.length > 0
      || normalized.dragDropText
      || normalized.uploadInputs.length > 0)
  );
}

export function normalizeChatGPTImageCreateSnapshot(snapshot) {
  const asArray = (value) => Array.isArray(value) ? Array.from(new Set(value.map((item) => String(item ?? '').trim()).filter(Boolean))) : [];
  const pageUrl = String(snapshot?.pageUrl ?? snapshot?.url ?? '').trim();
  const resultActionLabels = asArray(snapshot?.resultActionLabels);
  const explicitActions = asArray(snapshot?.resultActions).map((item) => normalizeChatGPTImageResultAction(item)).filter(Boolean);
  const derivedActions = resultActionLabels.map((item) => normalizeChatGPTImageResultAction(item)).filter(Boolean);
  return {
    status: normalizeChatGPTImageCreateStatus(snapshot?.status ?? ''),
    detail: String(snapshot?.detail ?? '').trim(),
    pageUrl,
    pathname: String(snapshot?.pathname ?? '').trim(),
    pageTitle: String(snapshot?.pageTitle ?? snapshot?.title ?? '').trim(),
    accountTier: String(snapshot?.accountTier ?? '').trim(),
    modeLabel: String(snapshot?.modeLabel ?? '').trim(),
    conversationId: String(snapshot?.conversationId ?? '').trim() || extractChatGPTConversationId(pageUrl),
    resultActions: Array.from(new Set([...explicitActions, ...derivedActions])),
    resultActionLabels,
    isImagesPage: Boolean(snapshot?.isImagesPage),
    isConversationPage: Boolean(snapshot?.isConversationPage),
  };
}

export function buildChatGPTImageCreateRow(snapshot, extra = {}) {
  const normalized = normalizeChatGPTImageCreateSnapshot(snapshot);
  const status = normalizeChatGPTImageCreateStatus(extra.status ?? '')
    || normalized.status
    || (normalized.conversationId && normalized.resultActions.length > 0 ? 'result_visible' : 'submitted');
  const row = {
    action: 'create',
    status,
    page_url: normalized.pageUrl,
    page_title: normalized.pageTitle,
    account_tier: normalized.accountTier,
    mode_label: String(extra.modeLabel ?? normalized.modeLabel ?? '').trim(),
    conversation_id: normalized.conversationId,
  };
  if (extra.reason) row.reason = String(extra.reason);
  if (extra.detail || normalized.detail) row.detail = String(extra.detail || normalized.detail);
  if (Array.isArray(extra.beforeUrls) && extra.beforeUrls.length > 0) {
    row.before_urls = Array.from(new Set(extra.beforeUrls.map((url) => String(url ?? '').trim()).filter(Boolean)));
  }
  return row;
}

export async function sendChatGPTImagePrompt(page, prompt) {
  const result = await page.evaluate(buildImageCreatePromptScript(prompt)).catch((error) => ({
    ok: false,
    reason: 'Failed to execute prompt insertion in ChatGPT Images.',
    detail: error instanceof Error ? error.message : String(error),
  }));
  return result && typeof result === 'object' ? result : { ok: false, reason: 'Unknown send result.' };
}

async function recoverChatGPTImageCreateState(page, detail = '') {
  try {
    await openChatGPTImages(page);
    const conversations = await getChatGPTConversationList(page);
    if (conversations[0]?.Url) {
      await openChatGPTConversation(page, conversations[0].Url);
    }
    const snapshot = await page.evaluate(buildImageCreateStateScript()).catch(async (error) => ({
      url: await getCurrentChatGPTUrl(page),
      detail: error instanceof Error ? error.message : String(error),
    }));
    return normalizeChatGPTImageCreateSnapshot({
      ...snapshot,
      detail: String(snapshot?.detail ?? '').trim() || detail,
    });
  } catch (error) {
    return normalizeChatGPTImageCreateSnapshot({
      url: await getCurrentChatGPTUrl(page),
      detail: detail || (error instanceof Error ? error.message : String(error)),
    });
  }
}

export async function readChatGPTImageCreateState(page) {
  try {
    const snapshot = await page.evaluate(buildImageCreateStateScript());
    return normalizeChatGPTImageCreateSnapshot(snapshot);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (/stale page identity|page not found:/i.test(detail)) {
      return recoverChatGPTImageCreateState(page, detail);
    }
    return normalizeChatGPTImageCreateSnapshot({
      url: await getCurrentChatGPTUrl(page),
      detail,
    });
  }
}

function hasNewChatGPTImageCreateResult(snapshot, baselineSnapshot) {
  const normalized = normalizeChatGPTImageCreateSnapshot(snapshot);
  if (!normalized.conversationId || normalized.resultActions.length === 0) return false;
  const baseline = normalizeChatGPTImageCreateSnapshot(baselineSnapshot || {});
  if (!baseline.conversationId) return true;
  if (normalized.conversationId !== baseline.conversationId) return true;
  if (normalized.resultActions.length > baseline.resultActions.length) return true;
  const baselineLabels = new Set((baseline.resultActionLabels || []).map((label) => String(label ?? '').trim()).filter(Boolean));
  const currentLabels = (normalized.resultActionLabels || []).map((label) => String(label ?? '').trim()).filter(Boolean);
  return currentLabels.some((label) => !baselineLabels.has(label));
}

async function waitForChatGPTImageCreateSettle(page, seconds = 1) {
  if (!page || typeof page.wait !== 'function') return;
  try {
    await page.wait({ time: seconds });
  } catch {
    await page.wait(seconds);
  }
}

export async function waitForChatGPTImageCreateState(page, timeoutSeconds = 30, baselineSnapshot = undefined) {
  const timeout = parseChatGPTPositiveInt(timeoutSeconds, 30);
  let lastSnapshot = await readChatGPTImageCreateState(page);
  let submittedSnapshot = lastSnapshot.conversationId ? lastSnapshot : null;
  if (hasNewChatGPTImageCreateResult(lastSnapshot, baselineSnapshot)) {
    return {
      ...lastSnapshot,
      status: 'result_visible',
    };
  }
  for (let attempt = 0; attempt < timeout; attempt += 1) {
    await waitForChatGPTImageCreateSettle(page, 1);
    lastSnapshot = await readChatGPTImageCreateState(page);
    if (lastSnapshot.conversationId) {
      submittedSnapshot = lastSnapshot;
    }
    if (hasNewChatGPTImageCreateResult(lastSnapshot, baselineSnapshot)) {
      return {
        ...lastSnapshot,
        status: 'result_visible',
      };
    }
  }
  if (submittedSnapshot) {
    return {
      ...submittedSnapshot,
      status: 'submitted',
    };
  }
  return {
    ...lastSnapshot,
    status: 'submitted',
  };
}

/**
 * ChatGPT web browser automation helpers for image generation.
 * Cross-platform: works on Linux/macOS/Windows via OpenCLI's CDP browser automation.
 */

export const CHATGPT_DOMAIN = 'chatgpt.com';
export const CHATGPT_URL = 'https://chatgpt.com';

// Selectors
const COMPOSER_SELECTOR = '[aria-label="Chat with ChatGPT"]';
const SEND_BTN_SELECTOR = 'button[aria-label="Send prompt"]';

function buildComposerLocatorScript() {
    const selectorsJson = JSON.stringify([COMPOSER_SELECTOR]);
    const markerAttr = 'data-opencli-chatgpt-composer';
    return `
      const isVisible = (el) => {
        if (!(el instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };

      const markerAttr = ${JSON.stringify(markerAttr)};
      const clearMarkers = (active) => {
        document.querySelectorAll('[' + markerAttr + ']').forEach(node => {
          if (node !== active) node.removeAttribute(markerAttr);
        });
      };

      const findComposer = () => {
        const marked = document.querySelector('[' + markerAttr + '="1"]');
        if (marked instanceof HTMLElement && isVisible(marked)) return marked;

        for (const selector of ${JSON.stringify([COMPOSER_SELECTOR])}) {
          const node = Array.from(document.querySelectorAll(selector)).find(c => c instanceof HTMLElement && isVisible(c));
          if (node instanceof HTMLElement) {
            node.setAttribute(markerAttr, '1');
            return node;
          }
        }
        return null;
      };

      findComposer.toString = () => 'findComposer';
      return { findComposer, markerAttr };
    `;
}

/**
 * Send a message to the ChatGPT composer and submit it.
 * Returns true if the message was sent successfully.
 */
export async function sendChatGPTMessage(page, text) {
    // Close sidebar if open (it can cover the chat composer)
    await page.evaluate(`
        (() => {
            const closeBtn = Array.from(document.querySelectorAll('button')).find(b => b.getAttribute('aria-label') === 'Close sidebar');
            if (closeBtn) closeBtn.click();
        })()
    `);
    await page.wait(0.5);

    // Wait for composer to be ready and use Playwright's type()
    await page.wait(1.5);
    
    const typeResult = await page.evaluate(`
        (() => {
            ${buildComposerLocatorScript()}
            const composer = findComposer();
            if (!composer) return false;
            composer.focus();
            composer.textContent = '';
            return true;
        })()
    `);
    
    if (!typeResult) return false;
    
    // Use page.type() which is Playwright's native method
    try {
        if (page.nativeType) {
            await page.nativeType(text);
        } else {
            throw new Error('nativeType unavailable');
        }
    } catch (e) {
        // Fallback: use execCommand
        await page.evaluate(`
            (() => {
                const composer = document.querySelector('[aria-label="Chat with ChatGPT"]');
                if (!composer) return;
                composer.focus();
                document.execCommand('insertText', false, ${JSON.stringify(text)});
            })()
        `);
    }
    
    // Wait for send button to appear (it only shows when there's text)
    await page.wait(1.5);

    // Click send button
    const sent = await page.evaluate(`
        (() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const sendBtn = btns.find(b => b.getAttribute('aria-label') === 'Send prompt');
            return { sendBtnFound: !!sendBtn };
        })()
    `);
    
    if (!sent || !sent.sendBtnFound) {
        return false;
    }
    
    await page.evaluate(`
        (() => {
            const sendBtn = Array.from(document.querySelectorAll('button')).find(b => b.getAttribute('aria-label') === 'Send prompt');
            if (sendBtn) sendBtn.click();
        })()
    `);
    return true;
}

/**
 * Check if ChatGPT is still generating a response.
 */
export async function isGenerating(page) {
    return await page.evaluate(`
        (() => {
            return Array.from(document.querySelectorAll('button')).some(b => {
                const label = b.getAttribute('aria-label') || '';
                return label === 'Stop generating' || label.includes('Thinking');
            });
        })()
    `);
}

/**
 * Get visible image URLs from the ChatGPT page (excluding profile/avatar images).
 */
export async function getChatGPTVisibleImageUrls(page) {
    return await page.evaluate(`
        (() => {
            const isVisible = (el) => {
                if (!(el instanceof HTMLElement)) return false;
                const style = window.getComputedStyle(el);
                if (style.display === 'none' || style.visibility === 'hidden') return false;
                const rect = el.getBoundingClientRect();
                return rect.width > 32 && rect.height > 32;
            };

            const imgs = Array.from(document.querySelectorAll('img')).filter(img =>
                img instanceof HTMLImageElement && isVisible(img)
            );

            const urls = [];
            const seen = new Set();

            for (const img of imgs) {
                const src = img.currentSrc || img.src || '';
                const alt = (img.getAttribute('alt') || '').toLowerCase();
                const cls = (img.className || '').toLowerCase();
                const width = img.naturalWidth || img.width || 0;
                const height = img.naturalHeight || img.height || 0;

                if (!src) continue;
                if (alt.includes('avatar') || alt.includes('profile') || alt.includes('logo') || alt.includes('icon')) continue;
                if (cls.includes('avatar') || cls.includes('profile') || cls.includes('icon')) continue;
                if (width < 128 && height < 128) continue;
                if (seen.has(src)) continue;

                seen.add(src);
                urls.push(src);
            }
            return urls;
        })()
    `);
}

/**
 * Wait for new images to appear after sending a prompt.
 */
export async function waitForChatGPTImages(page, beforeUrls, timeoutSeconds) {
    const beforeSet = new Set(beforeUrls);
    const pollIntervalSeconds = 3;
    const maxPolls = Math.max(1, Math.ceil(timeoutSeconds / pollIntervalSeconds));
    let lastUrls = [];
    let stableCount = 0;
    const waitForFixedPoll = async (seconds) => {
        try {
            await page.wait({ time: seconds });
        }
        catch {
            await page.wait(seconds);
        }
    };

    for (let i = 0; i < maxPolls; i++) {
        await waitForFixedPoll(i === 0 ? 3 : pollIntervalSeconds);

        // Check if still generating
        const generating = await isGenerating(page);
        if (generating) continue;

        const urls = (await getChatGPTVisibleImageUrls(page)).filter(url => !beforeSet.has(url));
        if (urls.length === 0) continue;

        const key = urls.join('\n');
        const prevKey = lastUrls.join('\n');
        if (key === prevKey) {
            stableCount += 1;
        } else {
            lastUrls = urls;
            stableCount = 1;
        }

        if (stableCount >= 2 || i === maxPolls - 1) {
            return lastUrls;
        }
    }
    return lastUrls;
}

/**
 * Export images by URL: fetch from ChatGPT backend API and convert to base64 data URLs.
 */
export async function getChatGPTImageAssets(page, urls) {
    const urlsJson = JSON.stringify(urls);
    return await page.evaluate(`
        (async (targetUrls) => {
            const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(String(reader.result || ''));
                reader.onerror = () => reject(new Error('Failed to read blob'));
                reader.readAsDataURL(blob);
            });

            const inferMime = (value, fallbackUrl) => {
                if (value) return value;
                const lower = String(fallbackUrl || '').toLowerCase();
                if (lower.includes('.png')) return 'image/png';
                if (lower.includes('.webp')) return 'image/webp';
                if (lower.includes('.gif')) return 'image/gif';
                return 'image/jpeg';
            };

            const results = [];

            for (const targetUrl of targetUrls) {
                let dataUrl = '';
                let mimeType = 'image/jpeg';
                let width = 0;
                let height = 0;

                // Try to find the img element for size info
                const img = Array.from(document.querySelectorAll('img')).find(el =>
                    (el.currentSrc || el.src || '') === targetUrl
                );
                if (img) {
                    width = img.naturalWidth || img.width || 0;
                    height = img.naturalHeight || img.height || 0;
                }

                try {
                    if (String(targetUrl).startsWith('data:')) {
                        dataUrl = String(targetUrl);
                        mimeType = (String(targetUrl).match(/^data:([^;]+);/i) || [])[1] || 'image/png';
                    } else {
                        // Try to fetch via CORS from the page's origin
                        const res = await fetch(targetUrl, { credentials: 'include' });
                        if (res.ok) {
                            const blob = await res.blob();
                            mimeType = inferMime(blob.type, targetUrl);
                            dataUrl = await blobToDataUrl(blob);
                        }
                    }
                } catch (e) {
                    // If fetch fails (CORS), try canvas approach via img element
                }

                // Fallback: draw img to canvas
                if (!dataUrl && img && img instanceof HTMLImageElement) {
                    try {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.naturalWidth || img.width || 512;
                        canvas.height = img.naturalHeight || img.height || 512;
                        const ctx = canvas.getContext('2d');
                        if (ctx) {
                            ctx.drawImage(img, 0, 0);
                            dataUrl = canvas.toDataURL('image/png');
                            mimeType = 'image/png';
                        }
                    } catch (e) { }
                }

                if (dataUrl) {
                    results.push({ url: String(targetUrl), dataUrl, mimeType, width, height });
                }
            }

            return results;
        })(${urlsJson})
    `, urls);
}

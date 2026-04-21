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

export const CHATGPT_IMAGES_URL = 'https://chatgpt.com/images';

function buildImageCapabilitiesScript() {
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
    const queryVisible = (root, selector) => Array.from(root.querySelectorAll(selector)).find((node) => isVisible(node)) || null;

    const mainRoot = queryVisible(document, 'main') || queryVisible(document, '[role="main"]') || document.body;
    const accountButton = queryVisible(document, '[data-testid="accounts-profile-button"]');
    const promptInput = Array.from(mainRoot.querySelectorAll('textarea')).find((node) => isVisible(node)) || null;
    const addButton = queryVisible(mainRoot, '#composer-plus-btn')
      || Array.from(mainRoot.querySelectorAll('button')).find((node) => {
        if (!isVisible(node)) return false;
        const label = lower(attrOf(node, 'aria-label') || textOf(node));
        return label.includes('添加文件等') || label.includes('add file');
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

    return {
      url: window.location.href,
      pathname: window.location.pathname || '',
      title: clean(document.title || ''),
      accountTier: textOf(accountButton).includes('Pro') ? 'Pro' : '',
      promptPlaceholder: attrOf(promptInput, 'placeholder') || attrOf(promptInput, 'aria-label'),
      addButtonLabel: attrOf(addButton, 'aria-label') || textOf(addButton),
      voiceButtonLabel: attrOf(voiceButton, 'aria-label') || textOf(voiceButton),
      sendButtonLabel: attrOf(sendButton, 'aria-label') || textOf(sendButton),
      dragDropText: textOf(dragDropNode),
      uploadInputs,
      styleCards: collectSectionButtons(styleSection),
      taskCards: collectSectionButtons(taskSection),
      resultActions,
      isImagesPage: (window.location.pathname || '').startsWith('/images'),
    };
  })()`;
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
    promptPlaceholder: String(snapshot?.promptPlaceholder ?? '').trim(),
    addButtonLabel: String(snapshot?.addButtonLabel ?? '').trim(),
    voiceButtonLabel: String(snapshot?.voiceButtonLabel ?? '').trim(),
    sendButtonLabel: String(snapshot?.sendButtonLabel ?? '').trim(),
    dragDropText: String(snapshot?.dragDropText ?? '').trim(),
    uploadInputs: asArray(snapshot?.uploadInputs),
    styleCards: asArray(snapshot?.styleCards),
    taskCards: asArray(snapshot?.taskCards),
    resultActions: asArray(snapshot?.resultActions),
    isImagesPage: Boolean(snapshot?.isImagesPage),
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

  if (!normalized.isImagesPage) {
    push('state', 'status', 'absent');
    push('state', 'reason', 'not-images-page');
    return rows;
  }

  const imageContextVisible = Boolean(
    normalized.styleCards.length > 0
    || normalized.taskCards.length > 0
    || normalized.resultActions.length > 0
    || normalized.dragDropText
    || normalized.uploadInputs.length > 0
  );

  if (!imageContextVisible) {
    push('state', 'status', 'absent');
    push('state', 'reason', 'no-image-context');
    return rows;
  }

  push('account', 'tier', normalized.accountTier);
  push('composer', 'prompt_placeholder', normalized.promptPlaceholder);
  push('composer', 'add_button', normalized.addButtonLabel);
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

export async function readChatGPTImageCapabilities(page) {
  const snapshot = await page.evaluate(buildImageCapabilitiesScript()).catch(async (error) => ({
    url: await getCurrentChatGPTUrl(page),
    detail: error instanceof Error ? error.message : String(error),
  }));
  return normalizeChatGPTImageCapabilitySnapshot(snapshot);
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
    normalized.isImagesPage
    && (normalized.styleCards.length > 0
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
    conversation_id: normalized.conversationId,
  };
  if (extra.reason) row.reason = String(extra.reason);
  if (extra.detail || normalized.detail) row.detail = String(extra.detail || normalized.detail);
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

export async function waitForChatGPTImageCreateState(page, timeoutSeconds = 30) {
  const timeout = parseChatGPTPositiveInt(timeoutSeconds, 30);
  let lastSnapshot = await readChatGPTImageCreateState(page);
  let submittedSnapshot = lastSnapshot.conversationId ? lastSnapshot : null;
  if (lastSnapshot.conversationId && lastSnapshot.resultActions.length > 0) {
    return {
      ...lastSnapshot,
      status: 'result_visible',
    };
  }
  for (let attempt = 0; attempt < timeout; attempt += 1) {
    await page.wait(1);
    lastSnapshot = await readChatGPTImageCreateState(page);
    if (lastSnapshot.conversationId) {
      submittedSnapshot = lastSnapshot;
    }
    if (lastSnapshot.conversationId && lastSnapshot.resultActions.length > 0) {
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

    for (let i = 0; i < maxPolls; i++) {
        await page.wait(i === 0 ? 3 : pollIntervalSeconds);

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

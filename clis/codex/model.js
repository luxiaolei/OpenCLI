import { cli, Strategy } from '@jackwener/opencli/registry';
import { buildCodexComputerUseHint, normalizeCodexVisibleSessionState } from './utils.js';

const readVisibleSessionStateScript = `
  (function() {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      if (node.hidden || node.getAttribute('aria-hidden') === 'true') return false;
      const style = window.getComputedStyle(node);
      if (!style) return false;
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const visibleTexts = Array.from(document.querySelectorAll('button, [role="button"], [role="menuitem"], [aria-label]'))
      .filter(isVisible)
      .map((node) => normalize(node.innerText || node.textContent || node.getAttribute('aria-label') || ''))
      .filter(Boolean);
    return { visibleTexts };
  })()
`;

const switchModelScript = (desiredModel) => `
  (function(targetModel) {
    const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    const matchesModel = (value) => normalize(value).includes(normalize(targetModel));
    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      if (node.hidden || node.getAttribute('aria-hidden') === 'true') return false;
      const style = window.getComputedStyle(node);
      if (!style) return false;
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const trigger = Array.from(document.querySelectorAll('button, [role="button"]')).find((node) => {
      if (!isVisible(node)) return false;
      const text = normalize(node.innerText || node.textContent || '');
      return /^(gpt|codex)-/.test(text) || /^(low|medium|high|extra high)$/.test(text);
    });
    if (trigger && trigger instanceof HTMLElement) {
      try { trigger.focus({ preventScroll: true }); } catch {}
      trigger.click();
    }
    const option = Array.from(document.querySelectorAll('[role="option"], [role="menuitem"], button, div')).find((node) => {
      if (!isVisible(node)) return false;
      return matchesModel(node.innerText || node.textContent || '') || matchesModel(node.getAttribute('aria-label') || '');
    });
    if (!(option instanceof HTMLElement)) return 'Model picker or target not found';
    try { option.focus({ preventScroll: true }); } catch {}
    option.click();
    return 'Success';
  })(${JSON.stringify(desiredModel)})
`;

export const modelCommand = cli({
    site: 'codex',
    name: 'model',
    description: 'Get or switch the currently active AI model in Codex Desktop',
    domain: 'localhost',
    strategy: Strategy.UI,
    browser: true,
    args: [
        { name: 'model-name', required: false, positional: true, help: 'The ID of the model to switch to (e.g. gpt-4)' }
    ],
    columns: ['Status', 'Model', 'Reasoning', 'Hint'],
    func: async (page, kwargs) => {
        const desiredModel = kwargs['model-name'];
        if (!desiredModel) {
            const rawState = await page.evaluate(readVisibleSessionStateScript);
            const state = normalizeCodexVisibleSessionState(rawState || {});
            return [
                {
                    Status: 'Active',
                    Model: state.model,
                    Reasoning: state.reasoning,
                    Hint: state.needsHint ? buildCodexComputerUseHint('Codex could not find a visible model pill.') : '',
                },
            ];
        }
        const success = await page.evaluate(switchModelScript(desiredModel));
        return [
            {
                Status: success,
                Model: desiredModel,
                Reasoning: '',
                Hint: success === 'Success' ? '' : buildCodexComputerUseHint('Codex could not switch models from the current view.'),
            },
        ];
    },
});

import { describe, expect, it } from 'vitest';
import { __test__ } from './ask.js';
describe('grok ask helpers', () => {
    describe('isOnGrok', () => {
        const fakePage = (url) => ({ evaluate: () => url instanceof Error ? Promise.reject(url) : Promise.resolve(url) });
        it('returns true for grok.com URLs', async () => {
            expect(await __test__.isOnGrok(fakePage('https://grok.com/'))).toBe(true);
            expect(await __test__.isOnGrok(fakePage('https://grok.com/chat/abc123'))).toBe(true);
        });
        it('returns true for grok.com subdomains', async () => {
            expect(await __test__.isOnGrok(fakePage('https://api.grok.com/v1'))).toBe(true);
        });
        it('returns false for non-grok domains', async () => {
            expect(await __test__.isOnGrok(fakePage('https://fakegrok.com/'))).toBe(false);
            expect(await __test__.isOnGrok(fakePage('https://example.com/?next=grok.com'))).toBe(false);
            expect(await __test__.isOnGrok(fakePage('about:blank'))).toBe(false);
        });
        it('returns false when evaluate throws (detached tab)', async () => {
            expect(await __test__.isOnGrok(fakePage(new Error('detached')))).toBe(false);
        });
    });
    it('normalizes boolean flags for explicit web routing', () => {
        expect(__test__.normalizeBooleanFlag(true)).toBe(true);
        expect(__test__.normalizeBooleanFlag('true')).toBe(true);
        expect(__test__.normalizeBooleanFlag('1')).toBe(true);
        expect(__test__.normalizeBooleanFlag('yes')).toBe(true);
        expect(__test__.normalizeBooleanFlag('on')).toBe(true);
        expect(__test__.normalizeBooleanFlag(false)).toBe(false);
        expect(__test__.normalizeBooleanFlag('false')).toBe(false);
        expect(__test__.normalizeBooleanFlag(undefined)).toBe(false);
    });
    it('supports localized explicit web submit selectors in priority order', () => {
        expect(__test__.EXPLICIT_WEB_SUBMIT_SELECTORS).toEqual([
            'button[aria-label="Submit"]',
            'button[aria-label="提交"]',
            'button[type="submit"]',
        ]);
    });
    it('reports selector mismatch diagnostics with locale and overlay details', () => {
        const result = __test__.analyzeExplicitWebSubmitSnapshot({
            locale: 'zh',
            navigatorLanguage: 'zh-CN',
            overlayPresent: true,
            candidates: [],
        });
        expect(result.reason).toMatch(/No Grok submit button matched/);
        expect(result.detail).toContain('locale=zh/zh-CN');
        expect(result.detail).toContain('overlay=present');
        expect(result.detail).toContain('button[aria-label="提交"]');
        expect(result.detail).toContain('button[type="submit"]');
    });
    it('reports disabled submit buttons separately from missing selectors', () => {
        const result = __test__.analyzeExplicitWebSubmitSnapshot({
            locale: 'zh',
            navigatorLanguage: 'zh-CN',
            candidates: [{
                    selector: 'button[aria-label="提交"]',
                    ariaLabel: '提交',
                    type: 'submit',
                    disabled: true,
                    visible: true,
                }],
        });
        expect(result.reason).toMatch(/remained disabled/);
        expect(result.detail).toContain('locale=zh/zh-CN');
        expect(result.detail).toContain('labels=提交');
        expect(result.detail).toContain('selectors=button[aria-label="提交"]');
    });
    it('reports non-visible submit buttons as a separate blocked state', () => {
        const result = __test__.analyzeExplicitWebSubmitSnapshot({
            locale: 'en',
            navigatorLanguage: 'en-US',
            candidates: [{
                    selector: 'button[type="submit"]',
                    ariaLabel: 'Submit',
                    type: 'submit',
                    disabled: false,
                    visible: false,
                }],
        });
        expect(result.reason).toMatch(/not visibly clickable/);
        expect(result.detail).toContain('locale=en/en-US');
        expect(result.detail).toContain('labels=Submit');
    });
    it('ignores baseline bubbles and the echoed prompt when choosing the latest assistant candidate', () => {
        const candidate = __test__.pickLatestAssistantCandidate(['older assistant answer', 'Prompt text', 'Assistant draft', 'Assistant final'], 1, 'Prompt text');
        expect(candidate).toBe('Assistant final');
    });
    it('returns empty when only the echoed prompt appeared after send', () => {
        const candidate = __test__.pickLatestAssistantCandidate(['older assistant answer', 'Prompt text'], 1, 'Prompt text');
        expect(candidate).toBe('');
    });
    it('tracks stabilization by incrementing repeats and resetting on changes', () => {
        expect(__test__.updateStableState('', 0, 'First chunk')).toEqual({
            previousText: 'First chunk',
            stableCount: 0,
        });
        expect(__test__.updateStableState('First chunk', 0, 'First chunk')).toEqual({
            previousText: 'First chunk',
            stableCount: 1,
        });
        expect(__test__.updateStableState('First chunk', 1, 'Second chunk')).toEqual({
            previousText: 'Second chunk',
            stableCount: 0,
        });
    });
});

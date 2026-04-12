import { cli, Strategy } from '@jackwener/opencli/registry';
import { GEMINI_DOMAIN, getGeminiPageState, inspectGeminiImageCapabilities } from './utils.js';
export const imageCapabilitiesCommand = cli({
    site: 'gemini',
    name: 'image-capabilities',
    description: 'Inspect visible Gemini Create image capabilities without generating images',
    domain: GEMINI_DOMAIN,
    strategy: Strategy.COOKIE,
    browser: true,
    navigateBefore: false,
    defaultFormat: 'json',
    timeoutSeconds: 90,
    args: [],
    columns: [
        'status',
        'page_title',
        'create_image_entry_visible',
        'create_image_mode_active',
        'template_cards',
        'upload_affordances',
        'tool_buttons',
        'mode_buttons',
        'page_url',
    ],
    func: async (page) => {
        const pageState = await getGeminiPageState(page).catch(() => ({}));
        if (pageState?.isSignedIn === false) {
            return [{
                    status: 'blocked',
                    reason: 'not-signed-in',
                    page_url: String(pageState?.url ?? ''),
                    page_title: String(pageState?.title ?? ''),
                    activation_path: '',
                    create_image_entry_visible: false,
                    create_image_entry_labels: [],
                    create_image_mode_active: false,
                    create_image_mode_labels: [],
                    template_cards: [],
                    upload_trigger_visible: false,
                    upload_trigger_labels: [],
                    upload_menu_visible: false,
                    upload_affordances: [],
                    tool_buttons: [],
                    mode_buttons: [],
                }];
        }
        return [await inspectGeminiImageCapabilities(page)];
    },
});

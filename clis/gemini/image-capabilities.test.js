import { beforeEach, describe, expect, it, vi } from 'vitest';
const { mockGetGeminiPageState, mockInspectGeminiImageCapabilities } = vi.hoisted(() => ({
    mockGetGeminiPageState: vi.fn(),
    mockInspectGeminiImageCapabilities: vi.fn(),
}));
vi.mock('./utils.js', async () => {
    const actual = await vi.importActual('./utils.js');
    return {
        ...actual,
        getGeminiPageState: mockGetGeminiPageState,
        inspectGeminiImageCapabilities: mockInspectGeminiImageCapabilities,
    };
});
import { imageCapabilitiesCommand } from './image-capabilities.js';
describe('gemini/image-capabilities', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    it('returns a blocked capability snapshot when Gemini is signed out', async () => {
        mockGetGeminiPageState.mockResolvedValue({
            isSignedIn: false,
            url: 'https://gemini.google.com/app',
            title: 'Sign in - Gemini',
        });
        const result = await imageCapabilitiesCommand.func({}, {});
        expect(mockInspectGeminiImageCapabilities).not.toHaveBeenCalled();
        expect(result).toEqual([{
                status: 'blocked',
                reason: 'not-signed-in',
                page_url: 'https://gemini.google.com/app',
                page_title: 'Sign in - Gemini',
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
            }]);
    });
    it('returns the inspected visible capability snapshot', async () => {
        mockGetGeminiPageState.mockResolvedValue({ isSignedIn: true });
        mockInspectGeminiImageCapabilities.mockResolvedValue({
            status: 'verified',
            reason: '',
            page_url: 'https://gemini.google.com/app/abc',
            page_title: 'Gemini',
            activation_path: 'entry-click',
            create_image_entry_visible: true,
            create_image_entry_labels: ['Create image'],
            create_image_mode_active: true,
            create_image_mode_labels: ['Pick a style for your image'],
            template_cards: ['Monochrome', 'Technicolor'],
            upload_trigger_visible: true,
            upload_trigger_labels: ['Open upload file menu'],
            upload_menu_visible: true,
            upload_affordances: ['Upload files', 'Add from Drive', 'Photos'],
            tool_buttons: ['Tools', 'Deselect Create image'],
            mode_buttons: ['Open mode picker'],
        });
        const page = {};
        const result = await imageCapabilitiesCommand.func(page, {});
        expect(mockInspectGeminiImageCapabilities).toHaveBeenCalledWith(page);
        expect(result).toEqual([{
                status: 'verified',
                reason: '',
                page_url: 'https://gemini.google.com/app/abc',
                page_title: 'Gemini',
                activation_path: 'entry-click',
                create_image_entry_visible: true,
                create_image_entry_labels: ['Create image'],
                create_image_mode_active: true,
                create_image_mode_labels: ['Pick a style for your image'],
                template_cards: ['Monochrome', 'Technicolor'],
                upload_trigger_visible: true,
                upload_trigger_labels: ['Open upload file menu'],
                upload_menu_visible: true,
                upload_affordances: ['Upload files', 'Add from Drive', 'Photos'],
                tool_buttons: ['Tools', 'Deselect Create image'],
                mode_buttons: ['Open mode picker'],
            }]);
    });
});

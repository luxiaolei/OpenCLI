import { cli, Strategy } from '@jackwener/opencli/registry';
import {
  buildChatGPTImageCapabilityRows,
  CHATGPT_WEB_DOMAIN,
  openChatGPTImages,
  readChatGPTImageCapabilities,
} from './utils.js';

export const imageCapabilitiesCommand = cli({
  site: 'chatgpt',
  name: 'image-capabilities',
  description: 'Inspect the currently visible ChatGPT Images capabilities for the logged-in browser session',
  domain: CHATGPT_WEB_DOMAIN,
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  defaultFormat: 'plain',
  timeoutSeconds: 180,
  args: [],
  columns: ['Category', 'Name', 'Value'],
  func: async (page) => {
    await openChatGPTImages(page);
    const snapshot = await readChatGPTImageCapabilities(page);
    return buildChatGPTImageCapabilityRows(snapshot);
  },
});

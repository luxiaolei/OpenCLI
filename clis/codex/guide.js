import { cli, Strategy } from '@jackwener/opencli/registry';
import { buildCodexGuideRows } from './utils.js';

export const guideCommand = cli({
  site: 'codex',
  name: 'guide',
  description: 'Show Codex app onboarding, Computer Use permissions, and exact click path guidance',
  domain: 'localhost',
  strategy: Strategy.LOCAL,
  browser: false,
  args: [],
  columns: ['Step', 'Details'],
  func: async () => buildCodexGuideRows(),
});

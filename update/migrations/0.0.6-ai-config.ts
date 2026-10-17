import { defineMigration, type MigrationContext } from './types';

/**
 * Brings `thei.config.json` the settings of AI, all of them off or empty:
 * the switch for AI — a site gains it only when its owner turns it on, and
 * until then behaves exactly as it did — the owner's instructions for every
 * AI, the one model the site calls, with no provider until the owner gives
 * one, and what it may spend a month. Run again after a write it did not
 * live to record, it finds them there and changes nothing.
 */

export default defineMigration({
  id: '0.0.6/002-ai-config',
  version: '0.0.6',
  title: {
    en: 'Add the AI settings to the settings file',
    ru: 'Настройки ИИ в файле настроек',
  },
  async run({ readConfig, writeConfig }: MigrationContext) {
    const config = await readConfig();
    if (config.mcp) return;
    config.mcp = {
      enabled: false,
      instructions: '',
      model: { provider: 'none', apiKey: '', baseUrl: '', model: '' },
      monthlyTokens: 10_000_000,
    };
    await writeConfig(config);
  },
});

import { readFile } from 'node:fs/promises';
import { setTheiConfig } from './index';

export async function bootTheiConfig() {
  const configPath = THEI_SERVER.contentPath('thei.config.json');
  const configRaw = await readFile(configPath, 'utf-8');
  const config = JSON.parse(configRaw);

  setTheiConfig({
    version: config.version,
    languageCode: config.languageCode,
    siteAccessLevel: config.siteAccessLevel,
    displayName: config.displayName,
    secretPhrase: config.secretPhrase,
    password: config.password,
  });

  THEI_SERVER.console.tag('Boot').log('Config checked and loaded!');
}

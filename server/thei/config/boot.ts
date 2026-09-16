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
    // Absent in the file means the same as empty: derive the address from the
    // request. The loader is where the on-disk shape becomes the typed config.
    siteUrl: config.siteUrl ?? '',
    secretPhrase: config.secretPhrase,
    password: config.password,
    backup: config.backup,
  });

  THEI_SERVER.console.tag('Boot').log('Config checked and loaded!');
}

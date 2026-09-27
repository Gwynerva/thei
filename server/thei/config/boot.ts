import { readConfigFile } from '#layers/thei/update/config-file';
import { setTheiConfig, setTheiConfigHead, toTheiConfig, toTheiConfigHead } from './index';

function configPath() {
  return THEI_SERVER.contentPath('thei.config.json');
}

/**
 * Reads what the boot needs before the migrations: the version the content
 * belongs to and the language the update screen speaks. The rest of the file
 * may still be in an older release's shape.
 */
export async function bootTheiConfig() {
  setTheiConfigHead(toTheiConfigHead(await readConfigFile(configPath())));
  THEI_SERVER.console.tag('Boot').log('Config version and language read!');
}

/** Loads the whole config, once the migrations have brought it up to date. */
export async function loadTheiConfig() {
  setTheiConfig(toTheiConfig(await readConfigFile(configPath())));
  THEI_SERVER.console.tag('Boot').log('Config checked and loaded!');
}

import { MigrationError } from '#layers/thei/update/migrations/run';
import { writeInstalledVersion } from '#layers/thei/update/version-file';
import { readConfigFile } from '#layers/thei/update/config-file';
import { setBootUpdate } from '../boot/result';
import { setTheiConfig, type TheiConfig } from '../config';
import { setTheiDbContext } from './global';
import { loadDbContext } from './utils';

export async function bootTheiDb() {
  const installedVersion = THEI_SERVER.config.version;

  try {
    const context = await loadDbContext();
    setTheiDbContext(context);
  } catch (error) {
    if (error instanceof MigrationError) {
      // Not a crash: the process stays up and serves the update page so the
      // operator can see which migration stopped and why.
      setBootUpdate({
        reason: error.reason,
        migrationId: error.migrationId,
        fromVersion: installedVersion,
        toVersion: THEI_SERVER.version,
        message: error.message,
      });
    }

    throw error;
  }

  if (installedVersion !== THEI_SERVER.version) {
    // Read back from disk: a migration may have rewritten the config.
    const configPath = THEI_SERVER.contentPath('thei.config.json');
    const config = (await writeInstalledVersion(
      configPath,
      THEI_SERVER.version,
      await readConfigFile(configPath),
    )) as unknown as TheiConfig;

    setTheiConfig(config);

    THEI_SERVER.console
      .tag('Boot')
      .log(
        `Content updated from ${installedVersion} to ${THEI_SERVER.version}.`,
      );
  }

  THEI_SERVER.console.tag('Boot').log('Database ready!');
}

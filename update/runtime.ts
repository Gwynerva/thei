import { THEI_SERVER } from '#layers/thei/server/thei/global';
import type { UpdateRuntime } from './process';

/**
 * The one place the update system reaches into the running server. Everything
 * else in `update/` takes what it needs as arguments, so it stays testable on
 * its own.
 */
export function updateRuntime(): UpdateRuntime {
  return {
    projectPath: THEI_SERVER.projectPath(),
    theiPath: THEI_SERVER.theiPath(),
    currentVersion: THEI_SERVER.version,
    languageCode: THEI_SERVER.config.languageCode,
    log: (message) => THEI_SERVER.console.tag('Update').log(message),
  };
}

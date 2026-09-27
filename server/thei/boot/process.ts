import pc from 'picocolors';
import { existsSync } from 'node:fs';
import { bootTheiConfig, loadTheiConfig } from '../config/boot';
import { setAsideOrphanDatabase } from '../db/orphan';
import {
  BootDecided,
  bootResult,
  setBootError,
  setBootInstall,
  setBootReady,
} from './result';
import { bootTheiLanguage } from '../language';
import { bootTheiDb } from '../db/boot';
import { bootAdminSessions } from '../admin-session/boot';
import { bootTheiAssets } from '../assets/boot';
import { bootExternalLinkCleanup } from '../external-links/boot';
import {
  bootUpdateChecks,
  bootUpdateTasks,
  failUpdateBootRun,
  finishUpdateBootRun,
} from '../updates/boot';
import { bootOgCleanup } from '../og/boot';

export async function bootTheiServer() {
  THEI_SERVER.console.tag('Boot').log('Booting...');

  try {
    await trySwitchToInstall();
    await bootTheiConfig();
    // Needs only the config, so a site closed for an update speaks its own
    // language too.
    await bootTheiLanguage();
    // Closes the site when an update has work left, and runs the migrations.
    const tasks = await bootTheiDb();
    // The migrations have brought the file to this release's shape.
    await loadTheiConfig();
    await bootAdminSessions();
    // Still closed: tasks convert old content with the new engine's code.
    await bootUpdateTasks(tasks);
    bootTheiAssets();
    bootExternalLinkCleanup();
    bootUpdateChecks();
    bootOgCleanup();
    await finishUpdateBootRun();
    setBootReady();
  } catch (decideOrError) {
    if (decideOrError instanceof BootDecided) {
      THEI_SERVER.console
        .tag('Boot')
        .log(
          `Boot process finished with ${pc.cyan(pc.bold(bootResult.type))} result!`,
        );
      return;
    }

    // A real error, not a boot decision. It must never escape: this runs inside
    // a Nitro plugin, so throwing would kill the process, and a process manager
    // set to restart it would loop forever. Failing into the error state keeps
    // the server up and lets it explain itself.
    THEI_SERVER.console
      .tag('Boot')
      .error('Error was thrown during boot process!', decideOrError);

    const message =
      decideOrError instanceof Error
        ? decideOrError.message
        : String(decideOrError);

    try {
      await failUpdateBootRun(message);
    } catch {
      // Bookkeeping never stands in the way of the error state.
    }

    try {
      setBootError(message);
    } catch {
      // setBootError signals the decision by throwing BootDecided.
    }
  }
}

/**
 * The installation writes the config last, so its absence is what "not
 * installed" means. Whatever else sits in `content/` — files a visit to the
 * wizard produced, a mounted volume's own entries, a database an installation
 * left behind when it stopped halfway — does not make a site.
 */
async function trySwitchToInstall() {
  if (existsSync(THEI_SERVER.contentPath('thei.config.json'))) return;
  await setAsideOrphanDatabase();
  THEI_SERVER.console.tag('Boot').warn('The site is not installed yet.');
  setBootInstall();
}

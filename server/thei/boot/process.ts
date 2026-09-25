import pc from 'picocolors';
import { readdir } from 'node:fs/promises';
import { bootTheiConfig } from '../config/boot';
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

async function trySwitchToInstall() {
  let entries: string[];
  try {
    entries = await readdir(THEI_SERVER.contentPath());
  } catch {
    THEI_SERVER.console.tag('Boot').warn('Content directory does not exist!');
    setBootInstall();
  }

  if (entries.length === 0) {
    THEI_SERVER.console.tag('Boot').warn('Content directory is empty!');
    setBootInstall();
  }
}

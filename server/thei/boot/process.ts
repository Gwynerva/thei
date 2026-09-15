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

export async function bootTheiServer() {
  THEI_SERVER.console.tag('Boot').log('Booting...');

  try {
    await trySwitchToInstall();
    await bootTheiConfig();
    await bootTheiDb();
    await bootTheiLanguage();
    await bootAdminSessions();
    bootTheiAssets();
    bootExternalLinkCleanup();
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

    try {
      setBootError(
        decideOrError instanceof Error
          ? decideOrError.message
          : String(decideOrError),
      );
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

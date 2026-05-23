import pc from 'picocolors';
import { readdir } from 'node:fs/promises';
import { bootTheiConfig } from '../config/boot';
import {
  BootDecided,
  bootResult,
  setBootInstall,
  setBootReady,
} from './result';
import { bootTheiLanguage } from '../language';
import { bootTheiDb } from '../db/boot';
import { bootAdminSessions } from '../admin-session/boot';
import { bootTheiAssets } from '../assets/boot';

export async function bootTheiServer() {
  THEI_SERVER.console.tag('Boot').log('Booting...');

  try {
    await trySwitchToInstall();
    await bootTheiConfig();
    await bootTheiDb();
    await bootTheiLanguage();
    await bootAdminSessions();
    bootTheiAssets();
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

    // This is a real error, not a boot decision so throw it.
    THEI_SERVER.console
      .tag('Boot')
      .error('Error was thrown during boot process!');
    throw decideOrError;
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

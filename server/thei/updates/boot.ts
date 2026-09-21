import { isManaged } from '#layers/thei/update/environment';
import { checkForUpdate } from '#layers/thei/update/remote';

const CHECK_DELAY_MS = 60 * 1000;
const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;

/**
 * Looks for a newer release in the background, so the dashboard can point at
 * it without anyone opening Updates. Only a supervised instance can update
 * itself, so only there is the answer worth a network round trip.
 */
export function bootUpdateChecks() {
  if (!isManaged()) return;
  setTimeout(runCheck, CHECK_DELAY_MS).unref();
  setInterval(runCheck, CHECK_INTERVAL_MS).unref();
}

async function runCheck() {
  try {
    await checkForUpdate(THEI_SERVER.projectPath());
  } catch (error) {
    THEI_SERVER.console.tag('Update').error('Background check failed', error);
  }
}

import { cleanupOrphanExternalLinks } from './repository';

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

export function bootExternalLinkCleanup() {
  void runCleanup();
  setInterval(runCleanup, CLEANUP_INTERVAL_MS).unref();
}

async function runCleanup() {
  try {
    await cleanupOrphanExternalLinks();
  } catch (error) {
    THEI_SERVER.console
      .tag('External links')
      .error('Failed to clean orphaned previews', error);
  }
}

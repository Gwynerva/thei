import { cleanupOgImages } from './cache';

const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Sweeps rendered cards nothing has asked for in a long time.
 *
 * Cards accumulate as titles and artwork change, and every old one is dead
 * weight: reproducible on demand and referenced by nothing.
 */
export function bootOgCleanup() {
  void run();
  setInterval(run, CLEANUP_INTERVAL_MS).unref();
}

async function run() {
  try {
    await cleanupOgImages();
  } catch (error) {
    THEI_SERVER.console.tag('OG').error('Failed to sweep cards', error);
  }
}

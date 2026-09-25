import { runExternalLinkSweep } from './repository';

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

/** Forgets links nothing points at any more: once at boot, then hourly. */
export function bootExternalLinkCleanup() {
  void runExternalLinkSweep();
  setInterval(() => void runExternalLinkSweep(), SWEEP_INTERVAL_MS).unref();
}

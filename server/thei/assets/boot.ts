import { runAssetCleanup } from './cleanup';
import { clearDraftDirectories } from './drafts';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_WEEK_MS = 7 * ONE_DAY_MS;

/**
 * Delay before the first sweep.
 *
 * The sweep walks the whole library, so running it the instant the process
 * comes up makes it compete with the requests that arrive right after a
 * restart. Nothing it reclaims is urgent: every candidate has already waited
 * out a 24 hour grace period.
 */
const FIRST_RUN_DELAY_MS = 60 * 1000;

export function bootTheiAssets() {
  // Drafts are held in memory, so whatever the last process left of them can
  // no longer be reached. Losing scratch is never a reason to fail a boot.
  clearDraftDirectories().catch(() =>
    THEI_SERVER.console
      .tag('Assets')
      .error('Failed to clear editor drafts left by the last run'),
  );

  // The full sweep walks `content/assets` and is the expensive half, so it
  // runs weekly while the cheap SQL phases keep their daily cadence.
  setTimeout(
    () => runAssetCleanup({ sweepFiles: true }),
    FIRST_RUN_DELAY_MS,
  ).unref();
  setInterval(() => runAssetCleanup({ sweepFiles: false }), ONE_DAY_MS).unref();
  setInterval(() => runAssetCleanup({ sweepFiles: true }), ONE_WEEK_MS).unref();
}

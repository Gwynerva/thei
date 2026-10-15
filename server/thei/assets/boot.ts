import { runAssetCleanup } from './cleanup';
import { sweepOAuth } from '../oauth/maintenance';
import { clearDraftDirectories } from './drafts';
import { runContentHistoryMaintenance } from '../content/history';
import { sweepUsage } from '../ai/model/usage';
import { maintainAiSessions } from '../ai/sessions/lifecycle';
import { recoverAiSessions } from '../ai/runner/queue';
import { startTemplateClock } from '../ai/templates/run';

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;
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

  // Versions of texts live two days; checking every hour keeps that close.
  // The files they let go are touched, so they still get their day of grace.
  setTimeout(maintainContentHistory, FIRST_RUN_DELAY_MS).unref();
  setInterval(maintainContentHistory, ONE_HOUR_MS).unref();
  // Sessions go to the archive and are purged in their time, and the record
  // of what the model spent is swept — whether AI is on or not, so nothing
  // outlives its time.
  setTimeout(maintainAiRecords, FIRST_RUN_DELAY_MS).unref();
  setInterval(maintainAiRecords, ONE_HOUR_MS).unref();
  // A session the last process was answering is idle again, an action it
  // was applying waits again.
  try {
    recoverAiSessions();
  } catch {
    THEI_SERVER.console
      .tag('MCP')
      .error('Failed to put back the sessions the last run had left');
  }
  // Templates run on their schedule; the clock stays quiet while AI is off.
  try {
    startTemplateClock();
  } catch {
    THEI_SERVER.console.tag('MCP').error('Failed to start the template clock');
  }
}

function maintainAiRecords() {
  maintainAiSessions();
  sweepOAuth();
  try {
    sweepUsage();
  } catch {
    THEI_SERVER.console
      .tag('MCP')
      .error('Failed to sweep the record of AI usage');
  }
}

function maintainContentHistory() {
  try {
    const { expired, abandoned } = runContentHistoryMaintenance();
    if (expired || abandoned)
      THEI_SERVER.console
        .tag('Content')
        .log(
          `Let go of ${expired} old version(s) and ${abandoned} abandoned draft(s)`,
        );
  } catch {
    THEI_SERVER.console
      .tag('Content')
      .error('Failed to maintain the history of texts');
  }
}

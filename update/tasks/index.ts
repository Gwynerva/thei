import videoPreviewFrames from './0.0.2-video-preview-frames';
import externalLinksRefresh from './0.0.2-external-links-refresh';
import svgPreviews from './0.0.2-svg-previews';
import svgUsePreviews from './0.0.4-svg-use-previews';
import audioWaveforms from './0.0.4-audio-waveforms';
import terminalPunctuation from './0.0.4-terminal-punctuation';
import type { TheiUpdateTask } from './types';

/**
 * Every update task Thei ships, oldest first.
 *
 * To add one: create `update/tasks/<version>-<slug>.ts` with
 * `defineUpdateTask({ id: '<version>/<order>-<slug>', ... })` and append it
 * here. On boot, every task the ledger has not recorded runs in this order,
 * after every migration.
 */
export const updateTaskRegistry: TheiUpdateTask[] = [
  videoPreviewFrames,
  externalLinksRefresh,
  svgPreviews,
  svgUsePreviews,
  audioWaveforms,
  terminalPunctuation,
];

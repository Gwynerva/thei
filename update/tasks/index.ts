import previewFrames from './0.0.2-preview-frames';
import type { TheiUpdateTask } from './types';

/**
 * Every update task Thei ships, oldest first.
 *
 * To add one: create `update/tasks/<version>-<slug>.ts` with
 * `defineUpdateTask({ id: '<version>/<order>-<slug>', ... })` and append it
 * here. On boot, every task the ledger has not recorded runs in this order,
 * after every migration.
 */
export const updateTaskRegistry: TheiUpdateTask[] = [previewFrames];

import type { TheiUpdatePhase } from './types';

/**
 * Every scripted update phase Thei ships, oldest first.
 *
 * To add one: create `update/phases/<version>-<slug>.ts` with
 * `defineUpdatePhase({ id: '<version>/<order>-<slug>', ... })` and append it
 * here. An update runs, in this order, every phase whose version is newer than
 * the installed one and not newer than the version being installed.
 */
export const updatePhaseRegistry: TheiUpdatePhase[] = [];

import type { TheiMigration } from './types';
import baseline from './0.0.1-baseline';
import accessLinks from './0.0.2-access-links';
import datePrecision from './0.0.2-date-precision';
import entityReminders from './0.0.2-entity-reminders';
import statusesOwner from './0.0.2-statuses-owner';
import tagAccent from './0.0.2-tag-accent';
import entityRelations from './0.0.2-entity-relations';
import diaryEntries from './0.0.2-diary-entries';
import assetRecipeCrops from './0.0.2-asset-recipes';
import externalLinkStatus from './0.0.2-external-link-status';
import tagNames from './0.0.2-tag-names';
import configShape from './0.0.2-config-shape';
import statusDates from './0.0.3-status-dates';
import contentHistory from './0.0.3-content-history';
import sharedLinkFavicons from './0.0.3-shared-link-favicons';
import externalLinkNotes from './0.0.3-external-link-notes';
import periodLabels from './0.0.4-period-labels';
import projectSections from './0.0.4-project-sections';
import audioExtensions from './0.0.4-audio-extensions';
import ai from './0.0.6-ai';
import aiConfig from './0.0.6-ai-config';
import entities from './0.0.6-entities';
import fileCaptions from './0.0.6-file-captions';
import aiContext from './0.0.7-ai';
import checkCoverageSession from './0.0.7-check-coverage-session';

/**
 * Every migration Thei has ever shipped, oldest first.
 *
 * Imports are static and the order is explicit on purpose: the list has to
 * survive bundling into `.output`, and the order is the upgrade path.
 *
 * To add one: create `update/migrations/<version>-<slug>.ts` with
 * `defineMigration({ id: '<version>/<order>-<slug>', ... })` and append it here.
 * Never reorder, never edit, and never remove an entry that has shipped.
 */
export const migrationRegistry: TheiMigration[] = [
  baseline,
  accessLinks,
  datePrecision,
  entityReminders,
  statusesOwner,
  tagAccent,
  entityRelations,
  diaryEntries,
  assetRecipeCrops,
  externalLinkStatus,
  tagNames,
  configShape,
  statusDates,
  contentHistory,
  sharedLinkFavicons,
  externalLinkNotes,
  periodLabels,
  projectSections,
  audioExtensions,
  ai,
  aiConfig,
  entities,
  fileCaptions,
  aiContext,
  checkCoverageSession,
];

export { baselineSql } from './0.0.1-baseline';

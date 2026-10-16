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
import apiTokens from './0.0.6-api-tokens';
import oauth from './0.0.6-oauth';
import aiConfig from './0.0.6-ai-config';
import ai from './0.0.6-ai';
import entitySynonyms from './0.0.6-entity-synonyms';
import aiTemplateOffers from './0.0.6-ai-template-offers';
import contentAnchors from './0.0.6-content-anchors';
import assetDescriptions from './0.0.6-asset-descriptions';
import aiTemplateCoverage from './0.0.6-ai-template-coverage';
import fileCaptions from './0.0.6-file-captions';

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
  apiTokens,
  oauth,
  aiConfig,
  ai,
  entitySynonyms,
  aiTemplateOffers,
  contentAnchors,
  assetDescriptions,
  aiTemplateCoverage,
  fileCaptions,
];

export { baselineSql } from './0.0.1-baseline';

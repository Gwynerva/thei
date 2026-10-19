import type {
  ContentBlockType,
  ContentSlot,
} from '#layers/thei/shared/content';

/**
 * Every text the owner writes, and what the search does with it: where it is
 * found (`found`, as the find calls the place), or why it is left out
 * (`skipped`). A new column, content slot, block type or inline markup is
 * listed here in the same change; `tests/server/search-sources.test.ts`
 * fails when one is neither. The documents that read them are in
 * `documents.ts` and `units.ts`; a stranger's are built with the page's own
 * builders, never wider than the page.
 */
export type SearchSource = { found: string } | { skipped: string };

const ID = { skipped: 'an id, a key or a hash, never words' };
const STATE = { skipped: 'a state or a setting, not words' };
const DAY = { skipped: 'a day: found by the query that names it' };
const REMINDER = {
  skipped: 'what the entity waits for: the owner sees it on its cards',
};
const ACCESS = { skipped: 'who may see it: it filters, it is not looked for' };
const FETCHED = {
  skipped: 'fetched from the linked page, not written by the owner',
};

/** Tables that hold nothing the owner writes to be read. */
export const SEARCH_SKIPPED_TABLES: Record<string, string> = {
  'profile-avatars': 'files of the avatar',
  'profile-pinned-pages': 'which pages the profile pins',
  'asset-usages': 'where files stand',
  backups: 'copies of the site',
  'content-history': 'drafts and past versions: the current text is searched',
  'content-anchors': 'anchors read off the texts themselves',
  'admin-sessions': 'sign-ins',
  'sign-in-links': 'sign-ins',
  'share-links': 'a label the owner gives a link they share, never shown',
  'tag-usages': 'which entities carry a tag',
  'api-tokens': 'access keys',
  'oauth-clients': 'apps signed in',
  'oauth-authorizations': 'apps signed in',
  'ai-usage': 'what the model spent',
  'ai-sessions': 'sessions with the model: searched in the AI page',
  'ai-messages': 'sessions with the model: searched in the AI page',
  'ai-actions': 'what the model proposed',
  'ai-session-entities': 'what a session is about',
  'ai-memory': 'what the model keeps: searched in its memory',
  'ai-terms': 'the dictionary of the model: searched in its own window',
  'ai-digests': 'digests the model reads instead of a whole entity',
  'ai-templates': 'ready-made requests',
  'ai-template-coverage': 'what a request has gone through',
  'ai-template-batches': 'what a request has gone through',
};

/** Each text column of the other tables, as `table.column`. */
export const SEARCH_COLUMNS: Record<string, SearchSource> = {
  'profiles.profileId': ID,
  'profiles.displayName': { found: 'title' },
  'profiles.slogan': { found: 'summary' },
  'profiles.nickname': { found: 'name' },
  'profiles.birthDate': { skipped: 'a day of birth: a fact, not a word' },
  'profiles.currentAvatarId': ID,
  'profiles.bannerAssetUuid': ID,
  'profiles.faviconAssetUuid': ID,
  'profiles.facts': { found: 'fact' },
  'profile-external-links.url': { skipped: 'an address' },
  'profile-external-links.name': { found: 'link' },
  'profile-external-links.note': { found: 'link' },
  'statuses.id': ID,
  'statuses.ownerType': ID,
  'statuses.ownerId': ID,
  'statuses.kind': STATE,
  'statuses.assetUuid': ID,
  'statuses.text': { found: 'status' },
  'statuses.date': DAY,
  'assets.assetUuid': ID,
  'assets.slug': ID,
  'assets.extension': STATE,
  'assets.familyUuid': ID,
  'assets.contentHash': ID,
  'assets.settingsKey': ID,
  'assets.settings': STATE,
  'assets.type': STATE,
  'assets.meta': STATE,
  'asset-descriptions.familyUuid': ID,
  'asset-descriptions.text': { found: 'file' },
  'content.contentUuid': ID,
  'content.ownerType': ID,
  'content.ownerId': ID,
  'content.slot': ID,
  'content.data': { found: 'text, by its slots and blocks below' },
  'events.eventUuid': ID,
  'events.title': { found: 'title' },
  'events.summary': { found: 'summary' },
  'events.access': ACCESS,
  'events.humanReadableSlug': { found: 'name' },
  'events.publicId': ID,
  'events.action': STATE,
  'events.reminder': REMINDER,
  'events.synonyms': { found: 'name, never shown' },
  'diary-entries.diaryUuid': ID,
  'diary-entries.date': DAY,
  'diary-entries.access': ACCESS,
  'diary-entries.reminder': REMINDER,
  'projects.projectUuid': ID,
  'projects.title': { found: 'title' },
  'projects.summary': { found: 'summary' },
  'projects.access': ACCESS,
  'projects.humanReadableSlug': { found: 'name' },
  'projects.publicId': ID,
  'projects.action': STATE,
  'projects.reminder': REMINDER,
  'projects.synonyms': { found: 'name, never shown' },
  'pages.pageUuid': ID,
  'pages.slug': { found: 'name' },
  'pages.title': { found: 'title' },
  'pages.summary': { found: 'summary' },
  'pages.access': ACCESS,
  'pages.reminder': REMINDER,
  'pages.synonyms': { found: 'name, never shown' },
  'project-content-sections.sectionUuid': ID,
  'project-content-sections.projectUuid': ID,
  'project-content-sections.title': { found: 'heading' },
  'project-content-sections.summary': { found: 'summary' },
  'project-content-sections.humanReadableSlug': ID,
  'project-content-sections.publicId': ID,
  'periods.ownerType': ID,
  'periods.ownerId': ID,
  'periods.startDate': DAY,
  'periods.endDate': DAY,
  'periods.precision': STATE,
  'periods.precisionNote': {
    skipped: 'how sure the owner is of a day: told in its hint',
  },
  'periods.label': { found: 'period' },
  'entity-relations.firstType': ID,
  'entity-relations.firstId': ID,
  'entity-relations.secondType': ID,
  'entity-relations.secondId': ID,
  'entity-relations.type': STATE,
  'entity-relations.note': { found: 'relation' },
  'tags.tagUuid': ID,
  'tags.title': { found: 'title, and on what carries it: tag' },
  'tags.normalizedTitle': ID,
  'tags.slug': ID,
  'tags.publicId': ID,
  'tags.description': { found: 'summary' },
  'tags.synonyms': { found: 'name, never shown' },
  'external-links.url': { skipped: 'an address' },
  'external-links.title': FETCHED,
  'external-links.description': FETCHED,
  'external-links.faviconKey': ID,
  'external-links.accent': STATE,
  'external-links.status': STATE,
  'project-external-links.projectUuid': ID,
  'project-external-links.url': { skipped: 'an address' },
  'project-external-links.note': { found: 'link' },
  'event-external-links.eventUuid': ID,
  'event-external-links.url': { skipped: 'an address' },
  'event-external-links.note': { found: 'link' },
};

/** Each slot of a text. */
export const SEARCH_CONTENT_SLOTS: Record<ContentSlot, SearchSource> = {
  'profile-about': { found: 'text, on the profile' },
  'project-description': { found: 'text' },
  'project-section-body': { found: 'text, at its section' },
  'event-body': { found: 'text' },
  'page-body': { found: 'text' },
  'diary-body': { found: 'text' },
  'project-notes': { found: 'notes, for the owner alone' },
  'event-notes': { found: 'notes, for the owner alone' },
  'page-notes': { found: 'notes, for the owner alone' },
  'diary-notes': { found: 'notes, for the owner alone' },
};

/** Each kind of block of a text. */
export const SEARCH_BLOCK_TYPES: Record<ContentBlockType, SearchSource> = {
  paragraph: { found: 'text' },
  header: { found: 'heading' },
  list: { found: 'text' },
  quote: { found: 'text, its caption too' },
  delimiter: { skipped: 'no words' },
  contentMedia: { found: 'caption; its file’s description as file' },
  contentGallery: { found: 'caption, the gallery’s title too' },
  contentAudio: { found: 'caption, its title too' },
  contentAttachment: { found: 'caption, its title too' },
  contentFileGroup: { found: 'caption, the group’s title too' },
  externalLink: { found: 'link, the owner’s note; the page’s own words not' },
  integration: { skipped: 'another site’s player: no words of the owner' },
  entityLink: { found: 'link, the owner’s note' },
  privateSectionBoundary: {
    skipped: 'an edge: the section’s words are read where it stands',
  },
};

/** Words the inline markup keeps out of the text it marks. */
export const SEARCH_INLINE_MARKUP: Record<string, SearchSource> = {
  'data-content-hint': { found: 'hint' },
  'data-content-note': { found: 'link' },
  'data-content-link': { skipped: 'which kind of link it is' },
  'data-entity-type': ID,
  'data-entity-id': ID,
  'data-entity-fragment': ID,
  href: { skipped: 'an address' },
};

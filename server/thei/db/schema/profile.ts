import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';
import type { ProfileFact } from '#layers/thei/shared/profile';
import { pages } from './pages';

export const profiles = sqliteTable('profiles', {
  profileId: text().primaryKey(),
  displayName: text().notNull(),
  slogan: text().notNull().default(''),
  nickname: text().notNull().default(''),
  birthDate: text().notNull().default(''),
  currentAvatarId: text(),
  bannerAssetUuid: text(),
  faviconAssetUuid: text(),
  facts: text({ mode: 'json' }).notNull().$type<ProfileFact[]>().default([]),
});
export const profileAvatars = sqliteTable(
  'profile-avatars',
  {
    id: text().primaryKey(),
    assetUuid: text().notNull(),
    createdAt: integer().notNull(),
  },
  (t) => [index('profile-avatars-date-idx').on(t.createdAt, t.id)],
);
export const profilePinnedPages = sqliteTable('profile-pinned-pages', {
  pageUuid: text()
    .primaryKey()
    .references(() => pages.pageUuid, { onDelete: 'cascade' }),
  sortOrder: integer().notNull(),
});
export const profileExternalLinks = sqliteTable('profile-external-links', {
  url: text().primaryKey(),
  name: text().notNull(),
  isPrivate: integer({ mode: 'boolean' }).notNull().default(false),
  sortOrder: integer().notNull(),
});

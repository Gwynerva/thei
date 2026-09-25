import type { ImageAccent } from '#layers/thei/shared/accent-color';
import type { ExternalLinkStatus } from '#layers/thei/shared/external-link';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const externalLinks = sqliteTable('external-links', {
  url: text().primaryKey(),
  title: text(),
  description: text(),
  faviconKey: text().notNull(),
  accent: text({ mode: 'json' }).$type<ImageAccent>(),
  /**
   * How the details were obtained. Shown to the admin so a link the site
   * never answered for can be refreshed by hand; visitors never see it.
   */
  status: text().$type<ExternalLinkStatus>().notNull().default('complete'),
  touchedAt: integer().notNull(),
});

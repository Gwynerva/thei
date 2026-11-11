import { formatAbsolutePublicDate } from '#layers/thei/shared/public-date-format';
import { ownerText } from './owner-text';

/**
 * What an entity is called in a text the server writes out — a Markdown
 * copy, an Open Graph card: a diary entry, which has no title and comes with
 * its `date`, by its day written out in the site's language; anything else
 * by its title, formatted as the owner's words are. The server's side of
 * `entityListName` (`app/composables/entity-type.ts`).
 *
 * Not for what a model reads over MCP: those texts name a day as stored.
 */
export function entityName(entity: { title?: string; date?: string }): string {
  return entity.date
    ? formatAbsolutePublicDate(entity.date, THEI_SERVER.language.code)
    : ownerText(entity.title);
}

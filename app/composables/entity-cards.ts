import type { Directive } from 'vue';
import type {
  ContentEntityParent,
  ContentEntityType,
} from '#layers/thei/shared/content-link';
import type { ExternalLinkPreview } from '#layers/thei/shared/external-link';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import { tagAccentCssColor } from '#layers/thei/shared/tag';
import {
  isPublicSecret,
  type PublicEntityLink,
  type PublicReferenceLink,
} from '#layers/thei/shared/api/public';

/**
 * The card of an entity named outside a text — by a chip, by a token on a
 * card, by a row of a list — shown as the card of a link in a text is
 * (`EntityCardPopup.vue`), from what the page already holds of it: nothing
 * is asked of the server, so the card never says more than the page was
 * given. One the reader may not open is its codename and the words every
 * secret is given.
 */
export type EntityCardData = {
  entityType: ContentEntityType;
  /** As stored: the card formats it. */
  title: string;
  summary: string;
  /** The day of a diary entry, which the card is titled by. */
  date?: string;
  iconMedia?: MediaDescriptor;
  /** The project a section belongs to; the parent of an excerpt. */
  parent?: Pick<ContentEntityParent, 'type' | 'title' | 'date'>;
  /** The owner's note on the link, as typed. */
  note?: string;
  /** The entity's own colour, as a tag has one. */
  accent?: string;
};

/** The card of a link to another site, named the same way. */
export type ExternalCardData = {
  external: ExternalLinkPreview;
  /** The owner's note on the link, as typed. */
  note?: string;
};

export type LinkCardData = EntityCardData | ExternalCardData;

/** Marks what has a card, for the popup and for `main.css`. */
export const ENTITY_CARD_ATTRIBUTE = 'data-entity-card';

const cards = new WeakMap<HTMLElement, LinkCardData>();

export function entityCardOf(element: HTMLElement) {
  return cards.get(element);
}

function bind(element: HTMLElement, data: LinkCardData | undefined) {
  if (data) {
    cards.set(element, data);
    element.setAttribute(ENTITY_CARD_ATTRIBUTE, '');
  } else {
    cards.delete(element);
    element.removeAttribute(ENTITY_CARD_ATTRIBUTE);
  }
}

/** `v-entity-card="data"`: the element shows the card; none without data. */
export const vEntityCard: Directive<HTMLElement, LinkCardData | undefined> = {
  mounted: (element, { value }) => bind(element, value),
  updated: (element, { value }) => bind(element, value),
  unmounted: (element) => bind(element, undefined),
};

/**
 * The card of an entity of a kind, from what a page holds of it under
 * whatever names: every builder of a card goes through here, so a card has
 * one shape — a part that is not there is left out, not kept empty. `date`
 * is given only for what is called by its day: the card is titled by it.
 */
export function entityCard(
  entityType: ContentEntityType,
  entity: {
    title: string;
    summary?: string;
    date?: string;
    iconMedia?: MediaDescriptor;
    note?: string;
  },
): EntityCardData {
  return {
    entityType,
    title: entity.title,
    summary: entity.summary ?? '',
    ...(entity.date ? { date: entity.date } : {}),
    ...(entity.iconMedia ? { iconMedia: entity.iconMedia } : {}),
    ...(entity.note ? { note: entity.note } : {}),
  };
}

/**
 * The card of an entity a page names among its relations. A secret that
 * does not say its kind is of the kind the list it stands in is of (`kind`).
 */
export function entityCardFromLink(
  link: PublicEntityLink,
  kind: ContentEntityType = 'project',
): EntityCardData {
  return entityCard(
    link.entityType ?? kind,
    isPublicSecret(link)
      ? { title: link.title, summary: link.summary, iconMedia: link.iconMedia }
      : link,
  );
}

/**
 * The card of what a link of a page's own list leads to — an entity, or
 * another site — with the owner's note on it.
 */
export function linkCardFromReference(link: PublicReferenceLink): LinkCardData {
  if (link.kind === 'external')
    return {
      external: {
        url: link.href,
        title: link.title,
        description: link.description,
        faviconMedia: link.iconMedia,
      },
      note: link.note,
    };
  return entityCard(link.kind, { ...link, summary: link.description });
}

/**
 * What an entity a page names is called: a diary entry by its day, a secret
 * by its codename.
 */
export function entityLinkName(
  link: PublicEntityLink,
  style: 'long' | 'abbreviated' = 'long',
): string {
  return entityListName(
    {
      title: link.title,
      ...(!isPublicSecret(link) && link.date ? { date: link.date } : {}),
    },
    style,
  );
}

/** The card of a tag, wherever it is named. */
export function entityCardFromTag(tag: {
  title: string;
  description?: string;
  iconMedia?: MediaDescriptor;
}): EntityCardData {
  return {
    ...entityCard('tag', { ...tag, summary: tag.description }),
    accent: tagAccentCssColor(tag),
  };
}

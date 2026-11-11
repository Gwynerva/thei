import { describe, expect, it } from 'vitest';
import type { DirectiveBinding } from 'vue';
import {
  ENTITY_CARD_ATTRIBUTE,
  entityCard,
  entityCardFromLink,
  entityCardFromTag,
  entityCardOf,
  linkCardFromReference,
  vEntityCard,
  type LinkCardData,
} from '../../../app/composables/entity-cards';
import {
  holdsAnchor,
  innermostFirst,
} from '../../../app/composables/press-hint-dom';
import type { MediaDescriptor } from '../../../shared/media';

/** As much of an element as the directive touches. */
function element() {
  const attributes = new Map<string, string>();
  return {
    attributes,
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    removeAttribute: (name: string) => attributes.delete(name),
  } as unknown as HTMLElement & { attributes: Map<string, string> };
}

const binding = (value: LinkCardData | undefined) =>
  ({ value }) as DirectiveBinding<LinkCardData | undefined>;

const hook = (name: 'mounted' | 'updated' | 'unmounted') =>
  (
    vEntityCard as Record<
      string,
      (element: HTMLElement, binding: DirectiveBinding) => void
    >
  )[name]!;

const media = { src: '/m/icon.webp' } as unknown as MediaDescriptor;

describe('v-entity-card', () => {
  it('marks the element and keeps its card while it has one', () => {
    const chip = element();
    const card = entityCard('project', { title: 'Kayak', summary: 'A boat' });
    hook('mounted')(chip, binding(card));
    expect(chip.attributes.get(ENTITY_CARD_ATTRIBUTE)).toBe('');
    expect(entityCardOf(chip)).toBe(card);

    const next = entityCard('event', { title: 'Launch' });
    hook('updated')(chip, binding(next));
    expect(entityCardOf(chip)).toBe(next);
    expect(chip.attributes.has(ENTITY_CARD_ATTRIBUTE)).toBe(true);
  });

  it('takes the mark away with the card: one is never there without the other', () => {
    const chip = element();
    hook('mounted')(chip, binding(entityCard('page', { title: 'About' })));
    hook('updated')(chip, binding(undefined));
    expect(chip.attributes.has(ENTITY_CARD_ATTRIBUTE)).toBe(false);
    expect(entityCardOf(chip)).toBeUndefined();

    hook('updated')(chip, binding(entityCard('page', { title: 'About' })));
    hook('unmounted')(chip, binding(undefined));
    expect(chip.attributes.has(ENTITY_CARD_ATTRIBUTE)).toBe(false);
    expect(entityCardOf(chip)).toBeUndefined();
  });

  it('marks nothing mounted without a card', () => {
    const chip = element();
    hook('mounted')(chip, binding(undefined));
    expect(chip.attributes.has(ENTITY_CARD_ATTRIBUTE)).toBe(false);
    expect(entityCardOf(chip)).toBeUndefined();
  });
});

describe('the card of an entity', () => {
  it('leaves out what is not there, and always has a summary', () => {
    expect(
      entityCard('project-section', {
        title: 'Hull',
        summary: undefined,
        date: undefined,
        iconMedia: undefined,
        note: '',
      }),
    ).toEqual({ entityType: 'project-section', title: 'Hull', summary: '' });
    expect(
      entityCard('diary-entry', {
        title: '',
        summary: 'Rain.',
        date: '2026-04-06',
        iconMedia: media,
        note: 'Why',
      }),
    ).toEqual({
      entityType: 'diary-entry',
      title: '',
      summary: 'Rain.',
      date: '2026-04-06',
      iconMedia: media,
      note: 'Why',
    });
  });

  it('is built of a related entity with its day and its note', () => {
    expect(
      entityCardFromLink({
        entityType: 'diary-entry',
        title: '',
        summary: 'Rain.',
        href: '/diary/2026-04-06/',
        date: '2026-04-06',
        note: 'That day',
        relationType: 'related',
      }),
    ).toEqual({
      entityType: 'diary-entry',
      title: '',
      summary: 'Rain.',
      date: '2026-04-06',
      note: 'That day',
    });
  });

  it('says of a secret its codename, its stock line and its kind alone', () => {
    const secret = {
      secret: true as const,
      key: 'k',
      title: 'Secret event Vega',
      summary: 'Hidden from visitors',
      iconMedia: media,
      // Never sent of a secret; never shown if it were.
      date: '2026-04-06',
      note: 'A note',
    };
    expect(entityCardFromLink(secret, 'event')).toEqual({
      entityType: 'event',
      title: 'Secret event Vega',
      summary: 'Hidden from visitors',
      iconMedia: media,
    });
    expect(entityCardFromLink(secret).entityType).toBe('project');
  });

  it('is built of a link of a page’s list: an entity, or another site', () => {
    expect(
      linkCardFromReference({
        kind: 'event',
        title: 'Launch',
        href: '/events/launch-1/',
        description: 'Into the water',
        note: 'See this',
      }),
    ).toEqual({
      entityType: 'event',
      title: 'Launch',
      summary: 'Into the water',
      note: 'See this',
    });
    expect(
      linkCardFromReference({
        kind: 'external',
        title: 'Example',
        href: 'https://example.org/',
        description: 'A site',
        iconMedia: media,
        note: 'See this',
      }),
    ).toEqual({
      external: {
        url: 'https://example.org/',
        title: 'Example',
        description: 'A site',
        faviconMedia: media,
      },
      note: 'See this',
    });
  });

  it('gives a tag its own colour', () => {
    const card = entityCardFromTag({ title: 'Boats', description: 'Afloat' });
    expect(card).toMatchObject({
      entityType: 'tag',
      title: 'Boats',
      summary: 'Afloat',
    });
    expect(card.accent).toEqual(expect.any(String));
    expect(entityCardFromTag({ title: 'Boats' }).summary).toBe('');
  });
});

describe('two hints of one element', () => {
  /** A node as the DOM has it: it holds itself too. */
  function node(parent?: { contains(other: unknown): boolean }) {
    const self = {
      parent,
      contains(other: unknown): boolean {
        for (
          let current = other as { parent?: unknown } | undefined;
          current;
          current = current.parent as { parent?: unknown } | undefined
        )
          if (current === self) return true;
        return false;
      },
    };
    return self as unknown as Node & { parent?: unknown };
  }

  it('holds what is inside an anchor, never the anchor itself', () => {
    const chip = node();
    const icon = node(chip);
    expect(chip.contains(chip)).toBe(true);
    expect(holdsAnchor(chip, chip)).toBe(false);
    expect(holdsAnchor(chip, icon)).toBe(true);
    expect(holdsAnchor(icon, chip)).toBe(false);
  });

  it('keeps the order they were found in, whichever came first', () => {
    const chip = node();
    const title = { provider: 'title', anchor: chip };
    const card = { provider: 'link-card', anchor: chip };
    const holds = (outer: typeof title, inner: typeof title) =>
      holdsAnchor(outer.anchor, inner.anchor);
    expect(innermostFirst([title, card], holds)).toEqual([title, card]);
    expect(innermostFirst([card, title], holds)).toEqual([card, title]);
  });

  it('still puts a hint inside the element before both of its own', () => {
    const chip = node();
    const icon = node(chip);
    const title = { provider: 'title', anchor: chip };
    const card = { provider: 'link-card', anchor: chip };
    const inner = { provider: 'title', anchor: icon };
    const holds = (outer: typeof title, other: typeof title) =>
      holdsAnchor(outer.anchor, other.anchor);
    expect(innermostFirst([title, card, inner], holds)).toEqual([
      inner,
      title,
      card,
    ]);
  });
});

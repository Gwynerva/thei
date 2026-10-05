import { describe, expect, it } from 'vitest';
import {
  CONTENT_LINK_FRAGMENT_LIMIT,
  contentInlineLinkSanitizeConfig,
  contentInlineLinksFromData,
  extractContentInlineLinks,
  linkFragment,
  normalizeContentInlineHtml,
  normalizeContentText,
  normalizeLinkFragment,
  stripHydratedContentInlineLinks,
  withLinkFragment,
} from '../../shared/content-link';

describe('content inline links', () => {
  it('normalizes whitespace across inline boundaries and br lines', () => {
    expect(normalizeContentText('\t one\u00a0\u2003 two  ')).toBe('one two');
    expect(
      normalizeContentInlineHtml('  A <b>  bold   text  </b>  <i> next </i> '),
    ).toBe('A <b>bold text</b> <i>next</i>');
    expect(normalizeContentInlineHtml(' A  <br> \u00a0 B ')).toBe('A<br>B');
    expect(normalizeContentInlineHtml('<b>one </b><i> two</i>')).toBe(
      '<b>one</b> <i>two</i>',
    );
  });
  it('extracts universal entity links and keeps their label', () => {
    expect(
      extractContentInlineLinks(
        '<a href="/projects/old-P1/" data-content-link="entity" data-entity-type="project" data-entity-id="p-1" target="_blank" rel="noopener noreferrer">My project</a>',
      ),
    ).toEqual([
      {
        kind: 'entity',
        entityType: 'project',
        entityId: 'p-1',
        href: '/projects/old-P1/',
        label: 'My project',
      },
    ]);
  });

  it('normalizes external URLs and rejects unsafe protocols', () => {
    expect(
      extractContentInlineLinks(
        '<a data-content-link="external" href="https://example.com/path">Example</a>',
      ),
    ).toEqual([
      {
        kind: 'external',
        url: 'https://example.com/path',
        label: 'Example',
      },
    ]);
    expect(
      extractContentInlineLinks(
        '<a data-content-link="external" href="javascript:alert(1)">Bad</a>',
      ),
    ).toEqual([]);
  });

  it('upgrades legacy HTTP anchors and removes unsafe runtime data', () => {
    expect(
      normalizeContentInlineHtml(
        '<a href="https://EXAMPLE.com/path" target="_self" rel="opener" style="color:red" data-content-link-state="broken">Example</a>',
      ),
    ).toBe(
      '<a href="https://example.com/path" data-content-link="external">Example</a>',
    );
    expect(
      normalizeContentInlineHtml(
        '<a href="javascript:alert(1)" onclick="alert(2)">Bad</a>',
      ),
    ).toBe('<a>Bad</a>');
    expect(
      normalizeContentInlineHtml('<a href="//evil.example/path">Bad</a>'),
    ).toBe('<a>Bad</a>');
    expect(
      normalizeContentInlineHtml('<a href="/projects/local-P1/">Local</a>'),
    ).toBe('<a href="/projects/local-P1/">Local</a>');
  });

  it('extracts event entities and nested list links once', () => {
    const data = {
      blocks: [
        {
          data: {
            items: [
              {
                content:
                  '<a data-content-link="external" href="https://example.com">chosen label</a>',
              },
            ],
            text: '<a data-content-link="entity" data-entity-type="event" data-entity-id="e-1">event</a>',
          },
        },
      ],
    };
    expect(contentInlineLinksFromData(data)).toEqual([
      {
        kind: 'external',
        url: 'https://example.com/',
        label: 'chosen label',
      },
      {
        kind: 'entity',
        entityType: 'event',
        entityId: 'e-1',
        href: undefined,
        label: 'event',
      },
    ]);
  });

  it('allows only the inline-link attributes needed by Editor.js', () => {
    expect(contentInlineLinkSanitizeConfig()).toEqual({
      href: true,
      target: '_blank',
      rel: 'noopener noreferrer',
      'data-content-link': true,
      'data-entity-type': true,
      'data-entity-id': true,
      'data-entity-fragment': true,
      'data-content-note': true,
    });
  });

  it('keeps a note on a link and drops an empty one', () => {
    expect(
      normalizeContentInlineHtml(
        '<a href="https://example.com/" data-content-link="external" data-content-note=" why ">x</a>',
      ),
    ).toBe(
      '<a href="https://example.com/" data-content-link="external" data-content-note="why">x</a>',
    );
    expect(
      normalizeContentInlineHtml(
        '<a href="https://example.com/" data-content-link="external" data-content-note="  ">x</a>',
      ),
    ).toBe('<a href="https://example.com/" data-content-link="external">x</a>');
  });

  it('stores only identity, URL, and replacement text', () => {
    const value = {
      text: '<a href="/projects/old-P1/" target="_blank" rel="noopener noreferrer" data-content-link="entity" data-entity-type="project" data-entity-id="p-1">Project label</a> <a href="https://example.com/" target="_blank" rel="noopener noreferrer" data-content-link="external" data-entity-id="unused">External label</a>',
    };
    expect(stripHydratedContentInlineLinks(value)).toEqual({
      text: '<a data-content-link="entity" data-entity-type="project" data-entity-id="p-1">Project label</a> <a href="https://example.com/" data-content-link="external">External label</a>',
    });
  });
});

describe('a place inside the target of an entity link', () => {
  const entity = (attributes: string) =>
    `<a data-content-link="entity" data-entity-type="event" data-entity-id="e-1"${attributes}>x</a>`;

  it('keeps it between the target and the note, written as an address carries it', () => {
    expect(
      normalizeContentInlineHtml(
        entity(' data-content-note="why" data-entity-fragment=" #gallery "'),
      ),
    ).toBe(entity(' data-entity-fragment="gallery" data-content-note="why"'));
    // Nothing is decoded, and what an address cannot carry is encoded.
    expect(
      normalizeContentInlineHtml(
        entity(
          ' data-entity-fragment=":~:text=two%20words&amp;x=&quot;y&quot;"',
        ),
      ),
    ).toBe(entity(' data-entity-fragment=":~:text=two%20words&amp;x=%22y%22"'));
    expect(
      normalizeContentInlineHtml(entity(' data-entity-fragment="глава 2"')),
    ).toBe(
      entity(' data-entity-fragment="%D0%B3%D0%BB%D0%B0%D0%B2%D0%B0%202"'),
    );
  });

  it('is stable, and leaves a link without one as it was', () => {
    const once = normalizeContentInlineHtml(
      entity(' data-entity-fragment=":~:text=a&amp;b"'),
    );
    expect(normalizeContentInlineHtml(once)).toBe(once);
    expect(normalizeContentInlineHtml(entity(''))).toBe(entity(''));
    expect(
      normalizeContentInlineHtml(entity(' data-entity-fragment=" # "')),
    ).toBe(entity(''));
    expect(
      normalizeContentInlineHtml(
        entity(
          ` data-entity-fragment="${'a'.repeat(CONTENT_LINK_FRAGMENT_LIMIT + 1)}"`,
        ),
      ),
    ).toBe(entity(''));
  });

  it('belongs to entity links only', () => {
    expect(
      normalizeContentInlineHtml(
        '<a href="https://example.com/#top" data-content-link="external" data-entity-fragment="top">x</a>',
      ),
    ).toBe(
      '<a href="https://example.com/#top" data-content-link="external">x</a>',
    );
  });

  it('is read from an address and written back onto one', () => {
    expect(linkFragment('https://site.test/events/e-E1/#gallery')).toBe(
      'gallery',
    );
    expect(linkFragment('/diary/2024-05-12/?x=1#:~:text=rain')).toBe(
      ':~:text=rain',
    );
    expect(linkFragment('https://site.test/events/e-E1/#')).toBeUndefined();
    expect(linkFragment('https://site.test/events/e-E1/')).toBeUndefined();
    expect(normalizeLinkFragment(42)).toBeUndefined();
    expect(withLinkFragment('/events/e-E1/', 'gallery')).toBe(
      '/events/e-E1/#gallery',
    );
    expect(withLinkFragment('/events/e-E1/')).toBe('/events/e-E1/');
  });
});

describe('inline markup: strikethrough and hints', () => {
  it('keeps strikethrough and folds the legacy tag into it', () => {
    expect(normalizeContentInlineHtml('<s>gone</s>')).toBe('<s>gone</s>');
    expect(normalizeContentInlineHtml('<strike>gone</strike>')).toBe(
      '<s>gone</s>',
    );
  });

  it('keeps a hint together with its note', () => {
    expect(
      normalizeContentInlineHtml('<abbr data-content-hint="a bay">Kara</abbr>'),
    ).toBe('<abbr data-content-hint="a bay">Kara</abbr>');
  });

  it('drops a hint that explains nothing, keeping its text', () => {
    expect(
      normalizeContentInlineHtml('<abbr data-content-hint="  ">Kara</abbr>'),
    ).toBe('Kara');
    expect(normalizeContentInlineHtml('<abbr>Kara</abbr>')).toBe('Kara');
  });

  it('drops any other attribute a hint arrives with', () => {
    expect(
      normalizeContentInlineHtml(
        '<abbr title="x" onclick="y" data-content-hint="note">t</abbr>',
      ),
    ).toBe('<abbr data-content-hint="note">t</abbr>');
  });
});

describe('inline link notes', () => {
  it('settle their ending, and leave the visible text as typed', () => {
    expect(
      normalizeContentInlineHtml(
        '<b>Кот.</b> <a href="https://example.com/" data-content-note="Мой профиль.">там</a>.',
      ),
    ).toBe(
      '<b>Кот.</b> <a href="https://example.com/" data-content-link="external" data-content-note="Мой профиль">там</a>.',
    );
  });
});

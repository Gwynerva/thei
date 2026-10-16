import { theiLinkUrl } from '../../shared/content-edit-markdown/links';
import { describe, expect, it } from 'vitest';
import type { ContentOutputData } from '../../shared/content';
import {
  contentLinkAt,
  locateContentEntityLinks,
  retargetContentLink,
} from '../../shared/content-link-locate';

const link = (id: string, words: string, extra = '') =>
  `<a data-content-link="entity" data-entity-type="project" data-entity-id="${id}"${extra}>${words}</a>`;

const text: ContentOutputData = {
  blocks: [
    {
      id: 'p1',
      type: 'paragraph',
      data: {
        text: `See ${link('a', 'the <b>harbour</b>', ' data-entity-fragment="goals" data-content-note="Why"')} and <a href="https://example.com" data-content-link="external">elsewhere</a> and ${link('b', 'the gate')}.`,
      },
    },
    {
      id: 's1',
      type: 'privateSectionBoundary',
      data: { sectionId: 'x', edge: 'start' },
    },
    {
      id: 'l1',
      type: 'list',
      data: {
        style: 'unordered',
        meta: {},
        items: [
          {
            content: 'One',
            meta: {},
            items: [
              { content: `Two ${link('c', 'lantern')}`, meta: {}, items: [] },
            ],
          },
        ],
      },
    },
    {
      id: 's2',
      type: 'privateSectionBoundary',
      data: { sectionId: 'x', edge: 'end' },
    },
    {
      id: 'c1',
      type: 'entityLink',
      data: { entityType: 'event', entityId: 'e', fragment: 'night' },
    },
  ],
};

describe('the links of a text to entities', () => {
  it('are found by a place that holds, with their words and targets', () => {
    const links = locateContentEntityLinks(text);
    expect(
      links.map((item) => [item.id, item.kind, item.words, item.private]),
    ).toEqual([
      ['p1/0/0', 'inline', 'the harbour', false],
      ['p1/0/1', 'inline', 'the gate', false],
      ['l1/1/0', 'inline', 'lantern', true],
      ['c1/card', 'card', '', false],
    ]);
    expect(links[0]).toMatchObject({ entityId: 'a', fragment: 'goals' });
    expect(theiLinkUrl(links[3]!)).toBe('thei:event/e#night');
  });

  it('is pointed elsewhere with its words and note kept, the rest untouched', () => {
    const changed = retargetContentLink(text, 'p1/0/0', {
      entityType: 'project-section',
      entityId: 's',
      fragment: 'results',
    })!;
    const paragraph = (changed.blocks[0]!.data as { text: string }).text;
    expect(paragraph).toContain(
      '<a data-content-link="entity" data-entity-type="project-section" data-entity-id="s" data-entity-fragment="results" data-content-note="Why">the <b>harbour</b></a>',
    );
    expect(paragraph).toContain(link('b', 'the gate'));
    expect(paragraph).toContain('https://example.com');
    // The text it was made from is as it was.
    expect(contentLinkAt(text, 'p1/0/0')?.entityId).toBe('a');
  });

  it('is taken off with its words kept, a card only pointed elsewhere', () => {
    const changed = retargetContentLink(text, 'l1/1/0', null)!;
    expect(
      locateContentEntityLinks(changed).map((item) => item.id),
    ).not.toContain('l1/1/0');
    expect(JSON.stringify(changed.blocks[2])).toContain('Two lantern');
    expect(retargetContentLink(text, 'c1/card', null)).toBeUndefined();
    const card = retargetContentLink(text, 'c1/card', {
      entityType: 'event',
      entityId: 'f',
    })!;
    expect(card.blocks[4]!.data).toEqual({
      entityType: 'event',
      entityId: 'f',
    });
    expect(retargetContentLink(text, 'p1/0/5', null)).toBeUndefined();
  });
});

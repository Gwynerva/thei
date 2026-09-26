import { describe, expect, it } from 'vitest';
import {
  contentToMarkdown,
  inlineToMarkdown,
} from '../../shared/content-markdown';

const options = {
  absolute: (path: string) => `https://example.com${path}`,
  privateSectionLabel: 'Hidden from visitors',
};

describe('inlineToMarkdown', () => {
  it('translates the inline subset of the editor', () => {
    expect(
      inlineToMarkdown('<b>bold</b> and <i>italic</i><br>next', options),
    ).toBe('**bold** and _italic_\nnext');
  });

  it('keeps links, making site paths absolute', () => {
    expect(
      inlineToMarkdown('see <a href="/pages/cv/">the CV</a>', options),
    ).toBe('see [the CV](https://example.com/pages/cv/)');
    expect(
      inlineToMarkdown('<a href="https://other.test/x">other</a>', options),
    ).toBe('[other](https://other.test/x)');
  });

  it('drops entity link markup but keeps its words', () => {
    expect(
      inlineToMarkdown(
        '<a data-content-link="entity" data-entity-type="project" data-entity-id="p1">Project</a>',
        options,
      ),
    ).toBe('Project');
  });
});

describe('contentToMarkdown', () => {
  it('counts an ordered list from where it starts, nested ones from one', () => {
    const markdown = contentToMarkdown(
      {
        blocks: [
          {
            type: 'list',
            data: {
              style: 'ordered',
              meta: { start: 4, counterType: 'upper-roman' },
              items: [
                { content: 'four', items: [{ content: 'inner' }] },
                { content: 'five' },
              ],
            },
          },
        ],
      } as never,
      options,
    );
    expect(markdown).toBe('4. four\n  1. inner\n5. five');
  });

  it('keeps a line broken inside a list item under that item', () => {
    const markdown = contentToMarkdown(
      {
        blocks: [
          {
            type: 'list',
            data: {
              style: 'checklist',
              items: [
                { content: 'first<br>second', meta: { checked: true } },
                { content: 'next' },
              ],
            },
          },
        ],
      } as never,
      options,
    );
    expect(markdown).toBe('- [x] first\n      second\n- [ ] next');
  });

  it('renders blocks a reader can act on', () => {
    const markdown = contentToMarkdown(
      {
        blocks: [
          { type: 'header', data: { text: 'Title', level: 2 } },
          { type: 'paragraph', data: { text: 'Hello <b>world</b>' } },
          {
            type: 'list',
            data: {
              style: 'unordered',
              items: [{ content: 'one' }, { content: 'two' }],
            },
          },
          { type: 'quote', data: { text: 'Quoted', caption: 'Someone' } },
          { type: 'delimiter', data: {} },
          {
            type: 'contentMedia',
            data: {
              asset: { media: { src: '/projects/a-1/content/x.webp' } },
              caption: 'A picture',
            },
          },
        ],
      } as never,
      options,
    );
    expect(markdown).toBe(
      [
        '## Title',
        'Hello **world**',
        '- one\n- two',
        '> Quoted\n>\n> — Someone',
        '---',
        '![A picture](https://example.com/projects/a-1/content/x.webp)',
      ].join('\n\n'),
    );
  });

  it('marks where a private section was, without describing it', () => {
    const markdown = contentToMarkdown(
      {
        blocks: [
          { type: 'privateSectionPlaceholder', data: { blockCount: 4 } },
          {
            type: 'privateSectionBoundary',
            data: { sectionId: 's', edge: 'start' },
          },
        ],
      } as never,
      options,
    );
    expect(markdown).toBe('*Hidden from visitors*');
    expect(markdown).not.toContain('4');
  });
});

describe('inline markdown for the newer markup', () => {
  it('writes strikethrough as a Markdown strike', () => {
    expect(
      contentToMarkdown(
        { blocks: [{ type: 'paragraph', data: { text: 'a <s>b</s> c' } }] },
        { absolute: (value) => value },
      ),
    ).toBe('a ~~b~~ c');
  });

  it('spells a hint out, since Markdown has nothing to hover', () => {
    expect(
      contentToMarkdown(
        {
          blocks: [
            {
              type: 'paragraph',
              data: {
                text: 'the <abbr data-content-hint="a bay">Kara</abbr> sea',
              },
            },
          ],
        },
        { absolute: (value) => value },
      ),
    ).toBe('the Kara (a bay) sea');
  });
});

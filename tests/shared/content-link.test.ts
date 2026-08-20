import { describe, expect, it } from 'vitest';
import {
  contentInlineLinkSanitizeConfig,
  contentInlineLinksFromData,
  extractContentInlineLinks,
  normalizeContentInlineHtml,
  normalizeContentText,
  stripHydratedContentInlineLinks,
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

  it('ignores unknown entity types and extracts nested list links once', () => {
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
    });
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

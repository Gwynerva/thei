import { afterEach, describe, expect, it } from 'vitest';
import { withEntityAddresses } from '../../server/thei/markdown/render';
import { contentToMarkdown } from '../../shared/content-markdown';
import { ProjectEventAccessLevel } from '../../shared/access-level';

const pages: Record<string, object> = {
  open: {
    pageUuid: 'open',
    slug: 'cv',
    title: 'CV',
    summary: '',
    access: ProjectEventAccessLevel.Public,
  },
  hidden: {
    pageUuid: 'hidden',
    slug: 'plans',
    title: 'Plans',
    summary: '',
    access: ProjectEventAccessLevel.Private,
  },
};

describe('entity addresses in the Markdown copy', () => {
  afterEach(() => {
    delete (globalThis as any).THEI_SERVER;
  });

  it('leads a link to the place inside its target it names', async () => {
    (globalThis as any).THEI_SERVER = {
      pages: { findByUuid: async (uuid: string) => pages[uuid] },
    };
    const anchor = (id: string) =>
      `<a data-content-link="entity" data-entity-type="page" data-entity-id="${id}" ` +
      `data-entity-fragment=":~:text=a&amp;b" data-content-note="why">${id}</a>`;
    const content = await withEntityAddresses({
      blocks: [
        {
          type: 'paragraph',
          data: { text: `${anchor('open')} ${anchor('hidden')}` },
        },
        {
          type: 'entityLink',
          data: { entityType: 'page', entityId: 'open', fragment: 'skills' },
        },
        {
          type: 'entityLink',
          data: { entityType: 'page', entityId: 'open' },
        },
      ],
    } as never);

    expect(
      contentToMarkdown(content, {
        absolute: (path) => `https://example.com${path}`,
        privateSectionLabel: 'Hidden',
      }),
    ).toBe(
      [
        '[open](https://example.com/pages/cv/#:~:text=a&b "why") hidden',
        '[CV](https://example.com/pages/cv/#skills)',
        '[CV](https://example.com/pages/cv/)',
      ].join('\n\n'),
    );
  });
});

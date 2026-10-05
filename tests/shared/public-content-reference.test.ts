import { describe, expect, it } from 'vitest';
import {
  contentEntityMentions,
  extractContentReferenceCandidates,
} from '../../shared/public-content-reference';

describe('public content reference extraction', () => {
  const content = {
    blocks: [
      {
        id: 'external-block',
        type: 'externalLink',
        data: { url: 'https://example.com/reference' },
      },
      {
        id: 'inline-links',
        type: 'list',
        data: {
          style: 'unordered',
          items: [
            {
              content:
                '<a href="https://example.com/reference" data-content-link="external">Duplicate</a> <a href="https://other.example/" data-content-link="external">Other</a>',
              items: [
                {
                  content:
                    '<a data-content-link="entity" data-entity-type="project" data-entity-id="project-one">Project</a>',
                  items: [],
                },
              ],
            },
          ],
        },
      },
      {
        id: 'project-block',
        type: 'entityLink',
        data: { entityType: 'project', entityId: 'project-one' },
      },
      {
        id: 'event-block',
        type: 'entityLink',
        data: { entityType: 'event', entityId: 'event-one' },
      },
      {
        id: 'page-block',
        type: 'entityLink',
        data: { entityType: 'page', entityId: 'page-one' },
      },
      {
        id: 'attachment',
        type: 'contentAttachment',
        data: {
          asset: {
            assetUuid: 'document',
            assetUrl: '/content/document.pdf',
            extension: 'pdf',
            size: 42,
          },
          title: 'Document',
          caption: 'Reference document',
        },
      },
      {
        id: 'attachment-duplicate',
        type: 'contentAttachment',
        data: {
          asset: {
            assetUuid: 'document',
            assetUrl: '/content/document.pdf',
            extension: 'pdf',
          },
        },
      },
      {
        id: 'media',
        type: 'contentMedia',
        data: { asset: { assetUuid: 'image' }, layout: 'stretch' },
      },
      {
        id: 'gallery',
        type: 'contentGallery',
        data: { items: [{ id: 'image', asset: { assetUuid: 'gallery' } }] },
      },
      {
        type: 'privateSectionBoundary',
        data: { sectionId: 'private-links', edge: 'start' },
      },
      {
        id: 'private',
        type: 'externalLink',
        data: { url: 'https://private.example/' },
      },
      {
        type: 'privateSectionBoundary',
        data: { sectionId: 'private-links', edge: 'end' },
      },
    ],
  } as any;

  it('collects ordered unique public links and attachments only', () => {
    const before = structuredClone(content);
    const result = extractContentReferenceCandidates(content);

    expect(result.links).toEqual([
      { kind: 'external', url: 'https://example.com/reference' },
      { kind: 'external', url: 'https://other.example/' },
      { kind: 'entity', entityType: 'project', entityId: 'project-one' },
      { kind: 'entity', entityType: 'event', entityId: 'event-one' },
      { kind: 'entity', entityType: 'page', entityId: 'page-one' },
    ]);
    expect(result.files).toEqual([
      {
        asset: {
          assetUuid: 'document',
          assetUrl: '/content/document.pdf',
          extension: 'pdf',
          size: 42,
        },
        title: 'Document',
        caption: 'Reference document',
      },
    ]);
    expect(content).toEqual(before);
  });

  it('lists a recording among the files, once, whichever block shows it', () => {
    const recording = {
      assetUuid: 'song',
      assetUrl: '/content/song.weba',
      extension: 'weba',
    };
    expect(
      extractContentReferenceCandidates({
        blocks: [
          {
            type: 'contentAudio',
            data: { asset: recording, title: 'Song', caption: 'Live' },
          },
          { type: 'contentAttachment', data: { asset: recording } },
        ],
      } as any).files,
    ).toEqual([{ asset: recording, title: 'Song', caption: 'Live' }]);
  });

  it('can include references from private sections for an administrator', () => {
    expect(
      extractContentReferenceCandidates(content, true).links,
    ).toContainEqual({ kind: 'external', url: 'https://private.example/' });
  });

  it('does not expose links or files from private sections to visitors', () => {
    const sectionContent = {
      blocks: [
        {
          type: 'privateSectionBoundary',
          data: { sectionId: 'section', edge: 'start' },
        },
        {
          type: 'externalLink',
          data: { url: 'https://section-secret.example/' },
        },
        {
          type: 'contentAttachment',
          data: {
            asset: { assetUuid: 'section-file', assetUrl: '/secret.pdf' },
          },
        },
        {
          type: 'privateSectionBoundary',
          data: { sectionId: 'section', edge: 'end' },
        },
      ],
    } as any;

    expect(extractContentReferenceCandidates(sectionContent)).toEqual({
      links: [],
      files: [],
    });
    expect(
      extractContentReferenceCandidates(sectionContent, true),
    ).toMatchObject({
      links: [{ kind: 'external', url: 'https://section-secret.example/' }],
      files: [{ asset: { assetUuid: 'section-file' } }],
    });
  });

  it('reads the notes of link blocks, and the first note written wins', () => {
    const noted = {
      blocks: [
        { type: 'externalLink', data: { url: 'https://a.example/' } },
        {
          type: 'paragraph',
          data: {
            text: '<a href="https://a.example/" data-content-link="external" data-content-note="Why a">A</a>',
          },
        },
        {
          type: 'externalLink',
          data: { url: 'https://a.example/', note: 'Not this one' },
        },
        {
          type: 'entityLink',
          data: {
            entityType: 'project',
            entityId: 'project-one',
            note: '  Where   it began ',
          },
        },
        {
          type: 'paragraph',
          data: {
            text: '<a data-content-link="entity" data-entity-type="project" data-entity-id="project-one" data-content-note="Later">P</a>',
          },
        },
      ],
    } as any;

    expect(extractContentReferenceCandidates(noted).links).toEqual([
      { kind: 'external', url: 'https://a.example/', note: 'Why a' },
      {
        kind: 'entity',
        entityType: 'project',
        entityId: 'project-one',
        note: 'Where it began',
      },
    ]);
  });
});

describe('contentEntityMentions', () => {
  const entityLink = (type: string, id: string) =>
    `<a data-content-link="entity" data-entity-type="${type}" data-entity-id="${id}">${id}</a>`;

  it('lists the entities a text links to, once each, in the order it names them', () => {
    const content = {
      blocks: [
        {
          id: 'first',
          type: 'paragraph',
          data: {
            text: `Met at ${entityLink('event', 'meet')}, for ${entityLink('project', 'harbor')} and <a href="https://example.com/" data-content-link="external">a site</a>.`,
          },
        },
        {
          id: 'card',
          type: 'entityLink',
          data: { entityType: 'diary-entry', entityId: 'day', note: 'Why' },
        },
        {
          id: 'again',
          type: 'paragraph',
          data: { text: `Back to ${entityLink('event', 'meet')}.` },
        },
        {
          type: 'privateSectionBoundary',
          data: { sectionId: 'mine', edge: 'start' },
        },
        {
          id: 'private',
          type: 'paragraph',
          data: { text: `Only mine: ${entityLink('page', 'notes')}` },
        },
        {
          type: 'privateSectionBoundary',
          data: { sectionId: 'mine', edge: 'end' },
        },
      ],
    } as any;

    expect(contentEntityMentions(content)).toEqual([
      { kind: 'entity', entityType: 'event', entityId: 'meet' },
      { kind: 'entity', entityType: 'project', entityId: 'harbor' },
      { kind: 'entity', entityType: 'diary-entry', entityId: 'day' },
      { kind: 'entity', entityType: 'page', entityId: 'notes' },
    ]);
  });

  it('is empty for no text', () => {
    expect(contentEntityMentions(null)).toEqual([]);
    expect(contentEntityMentions({ blocks: [] } as any)).toEqual([]);
  });
});

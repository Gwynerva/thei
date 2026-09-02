import { describe, expect, it } from 'vitest';
import { extractContentReferenceCandidates } from '../../shared/public-content-reference';

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
        id: 'private',
        type: 'externalLink',
        data: { url: 'https://private.example/' },
        tunes: { privateAccess: { isPrivate: true } },
      },
    ],
  } as any;

  it('collects ordered unique public links and attachments only', () => {
    const before = structuredClone(content);
    const result = extractContentReferenceCandidates(content);

    expect(result.links).toEqual([
      { kind: 'external', url: 'https://example.com/reference' },
      { kind: 'external', url: 'https://other.example/' },
      { kind: 'project', projectUuid: 'project-one' },
      { kind: 'event', eventUuid: 'event-one' },
      { kind: 'page', pageUuid: 'page-one' },
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

  it('can include references from private blocks for an administrator', () => {
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
});

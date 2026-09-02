import { afterEach, describe, expect, it } from 'vitest';
import { AssetType } from '../../shared/asset';
import { ProjectEventAccessLevel } from '../../shared/access-level';
import {
  buildPublicContentData,
  buildPublicContentPreviewMedia,
  selectPublicContentMediaAssetUuids,
} from '../../server/thei/public/content';
import {
  buildPublicContentReferenceGroup,
  buildPublicManualEventReferenceGroup,
  buildPublicProjectSectionSummary,
  buildPublicProjectStageSummary,
} from '../../server/thei/public/entities';

afterEach(() => {
  delete (globalThis as any).THEI_SERVER;
});

describe('public content media previews', () => {
  it('skips private blocks and preserves the first public media order', () => {
    expect(
      selectPublicContentMediaAssetUuids({
        blocks: [
          { type: 'paragraph', data: { text: 'Rich text is irrelevant' } },
          {
            type: 'contentMedia',
            data: { asset: { assetUuid: 'private-media' }, layout: 'stretch' },
            tunes: { privateAccess: { isPrivate: true } },
          },
          {
            type: 'contentGallery',
            data: {
              items: [
                { id: 'one', asset: { assetUuid: 'gallery-first' } },
                { id: 'two', asset: { assetUuid: 'gallery-second' } },
              ],
            },
          },
          {
            type: 'contentMedia',
            data: { asset: { assetUuid: 'media-last' }, layout: 'centered' },
          },
        ],
      }),
    ).toEqual(['gallery-first', 'gallery-second', 'media-last']);
  });

  it('can include private media for an administrator and removes duplicates', () => {
    expect(
      selectPublicContentMediaAssetUuids(
        {
          blocks: [
            {
              type: 'contentMedia',
              data: { asset: { assetUuid: 'same' }, layout: 'stretch' },
              tunes: { privateAccess: { isPrivate: true } },
            },
            {
              type: 'contentGallery',
              data: { items: [{ id: 'one', asset: { assetUuid: 'same' } }] },
            },
          ],
        },
        true,
      ),
    ).toEqual(['same']);
  });

  it('ignores text and attachment blocks when there is no visual media', () => {
    expect(
      selectPublicContentMediaAssetUuids({
        blocks: [
          { type: 'header', data: { text: 'Title', level: 2 } },
          {
            type: 'contentAttachment',
            data: { asset: { assetUuid: 'document' }, title: 'Document' },
          },
        ],
      }),
    ).toEqual([]);
  });

  it('returns the accent hue of a single public content image', async () => {
    const image = {
      assetUuid: 'content-image',
      familyUuid: 'family-image',
      contentHash: 'hash-image',
      slug: 'content-image',
      extension: 'webp',
      settingsKey: 'original',
      settingsVersion: 1,
      settings: null,
      type: AssetType.Image,
      size: 1,
      meta: { width: 1200, height: 800, accentHue: 42 },
    };
    (globalThis as any).THEI_SERVER = {
      content: {
        findByOwner: async () => ({
          contentUuid: 'content-event',
          data: {
            blocks: [
              {
                type: 'contentMedia',
                data: {
                  asset: { assetUuid: image.assetUuid },
                  layout: 'stretch',
                },
              },
            ],
          },
        }),
      },
      assets: {
        findByUuid: async () => image,
        usages: {
          findOne: async () => ({
            meta: { role: 'content', refs: [{ isPrivate: false }] },
          }),
          findByContainer: async () => [],
        },
      },
    };

    await expect(
      buildPublicContentPreviewMedia('event', 'event-uuid', 'event-body', {
        type: 'event',
        humanReadableSlug: 'event',
        publicId: 'public-id',
      }),
    ).resolves.toMatchObject({
      kind: AssetType.Image,
      accentHue: 42,
      src: '/events/event-public-id/content/content-image.webp',
    });
  });

  it('returns the accent hue of the first valid public gallery media', async () => {
    const assets = new Map<string, any>([
      [
        'document',
        {
          assetUuid: 'document',
          familyUuid: 'family-document',
          contentHash: 'hash-document',
          slug: 'document',
          extension: 'pdf',
          settingsKey: 'original',
          settingsVersion: 1,
          settings: null,
          type: AssetType.Other,
          size: 1,
          meta: null,
        },
      ],
      [
        'gallery-video',
        {
          assetUuid: 'gallery-video',
          familyUuid: 'family-video',
          contentHash: 'hash-video',
          slug: 'gallery-video',
          extension: 'mp4',
          settingsKey: 'original',
          settingsVersion: 1,
          settings: null,
          type: AssetType.Video,
          size: 1,
          meta: {
            width: 1920,
            height: 1080,
            audio: 'keep',
            accentHue: 214,
          },
        },
      ],
      [
        'later-image',
        {
          assetUuid: 'later-image',
          familyUuid: 'family-image',
          contentHash: 'hash-image',
          slug: 'later-image',
          extension: 'webp',
          settingsKey: 'original',
          settingsVersion: 1,
          settings: null,
          type: AssetType.Image,
          size: 1,
          meta: { width: 1000, height: 700, accentHue: 32 },
        },
      ],
    ]);
    (globalThis as any).THEI_SERVER = {
      content: {
        findByOwner: async () => ({
          contentUuid: 'content-event',
          data: {
            blocks: [
              {
                type: 'contentMedia',
                data: {
                  asset: { assetUuid: 'private-image' },
                  layout: 'stretch',
                },
                tunes: { privateAccess: { isPrivate: true } },
              },
              {
                type: 'contentMedia',
                data: {
                  asset: { assetUuid: 'missing-image' },
                  layout: 'stretch',
                },
              },
              {
                type: 'contentMedia',
                data: {
                  asset: { assetUuid: 'document' },
                  layout: 'stretch',
                },
              },
              {
                type: 'contentGallery',
                data: {
                  items: [
                    { id: 'video', asset: { assetUuid: 'gallery-video' } },
                    { id: 'image', asset: { assetUuid: 'later-image' } },
                  ],
                },
              },
            ],
          },
        }),
      },
      assets: {
        findByUuid: async (assetUuid: string) => assets.get(assetUuid),
        usages: {
          findOne: async () => ({
            meta: { role: 'content', refs: [{ isPrivate: false }] },
          }),
          findByContainer: async () => [],
        },
      },
    };

    await expect(
      buildPublicContentPreviewMedia('event', 'event-uuid', 'event-body', {
        type: 'event',
        humanReadableSlug: 'event',
        publicId: 'public-id',
      }),
    ).resolves.toMatchObject({
      kind: AssetType.Video,
      accentHue: 214,
      src: '/events/event-public-id/content/gallery-video.mp4',
    });
  });

  it('returns no media or accent when the content has no valid visual asset', async () => {
    (globalThis as any).THEI_SERVER = {
      content: {
        findByOwner: async () => ({
          contentUuid: 'content-event',
          data: {
            blocks: [
              { type: 'paragraph', data: { text: 'Only text' } },
              {
                type: 'contentMedia',
                data: {
                  asset: { assetUuid: 'missing-image' },
                  layout: 'stretch',
                },
              },
            ],
          },
        }),
      },
      assets: {
        findByUuid: async () => undefined,
        usages: {
          findOne: async () => ({
            meta: { role: 'content', refs: [{ isPrivate: false }] },
          }),
          findByContainer: async () => [],
        },
      },
    };

    await expect(
      buildPublicContentPreviewMedia('event', 'event-uuid', 'event-body', {
        type: 'event',
        humanReadableSlug: 'event',
        publicId: 'public-id',
      }),
    ).resolves.toBeUndefined();
  });

  it('hydrates project media and galleries with the public content route', async () => {
    const assets = new Map<string, any>([
      [
        'project-image',
        {
          assetUuid: 'project-image',
          familyUuid: 'project-image-family',
          contentHash: 'project-image-hash',
          slug: 'project-image',
          extension: 'webp',
          settingsKey: 'original',
          settingsVersion: 1,
          settings: null,
          type: AssetType.Image,
          size: 1,
          meta: { width: 1200, height: 800, accentHue: 42 },
        },
      ],
      [
        'project-video',
        {
          assetUuid: 'project-video',
          familyUuid: 'project-video-family',
          contentHash: 'project-video-hash',
          slug: 'project-video',
          extension: 'mp4',
          settingsKey: 'original',
          settingsVersion: 1,
          settings: null,
          type: AssetType.Video,
          size: 1,
          meta: { width: 1920, height: 1080, audio: 'keep', accentHue: 214 },
        },
      ],
    ]);
    (globalThis as any).THEI_SERVER = {
      content: {
        findByOwner: async () => ({
          contentUuid: 'project-content',
          data: {
            blocks: [
              {
                type: 'contentMedia',
                data: {
                  asset: { assetUuid: 'project-image' },
                  layout: 'stretch',
                },
              },
              {
                type: 'contentGallery',
                data: {
                  items: [
                    { id: 'video', asset: { assetUuid: 'project-video' } },
                  ],
                },
              },
            ],
          },
        }),
      },
      assets: {
        findByUuid: async (assetUuid: string) => assets.get(assetUuid),
        usages: {
          findOne: async () => ({
            meta: { role: 'content', refs: [{ isPrivate: false }] },
          }),
          findByContainer: async () => [],
        },
      },
    };

    const result = await buildPublicContentData(
      'project',
      'project-uuid',
      'project-description',
      {
        type: 'project',
        humanReadableSlug: 'project',
        publicId: 'Project',
      },
    );

    expect((result?.blocks[0]?.data as any).asset).toMatchObject({
      assetUrl: '/projects/project-Project/content/project-image.webp',
      media: {
        src: '/projects/project-Project/content/project-image.webp',
        previewSrc:
          '/projects/project-Project/content/project-image.webp?preview=1',
      },
    });
    expect((result?.blocks[1]?.data as any).items[0].asset).toMatchObject({
      assetUrl: '/projects/project-Project/content/project-video.mp4',
      media: {
        src: '/projects/project-Project/content/project-video.mp4',
        previewSrc:
          '/projects/project-Project/content/project-video.mp4?preview=1',
      },
    });
  });

  it('replaces private sections with stats without leaking their payload', async () => {
    const secretAsset = {
      assetUuid: 'secret-asset-uuid',
      familyUuid: 'secret-family',
      contentHash: 'secret-hash',
      slug: 'secret-file',
      extension: 'pdf',
      settingsKey: 'original',
      settingsVersion: 1,
      settings: null,
      type: AssetType.Other,
      size: 42,
      meta: null,
    };
    (globalThis as any).THEI_SERVER = {
      content: {
        findByOwner: async () => ({
          contentUuid: 'section-content',
          data: {
            blocks: [
              { type: 'paragraph', data: { text: 'Public text' } },
              {
                id: 'private-start-id',
                type: 'privateSectionBoundary',
                data: { sectionId: 'private-section-id', edge: 'start' },
              },
              {
                id: 'secret-text-id',
                type: 'paragraph',
                data: { text: 'Highly secret words' },
              },
              {
                id: 'secret-file-id',
                type: 'contentAttachment',
                data: {
                  asset: { assetUuid: secretAsset.assetUuid },
                  title: 'Private document',
                },
              },
              {
                id: 'private-end-id',
                type: 'privateSectionBoundary',
                data: { sectionId: 'private-section-id', edge: 'end' },
              },
            ],
          },
        }),
      },
      assets: {
        findByUuid: async (assetUuid: string) =>
          assetUuid === secretAsset.assetUuid ? secretAsset : undefined,
        usages: {
          findOne: async () => ({
            meta: { role: 'content', refs: [{ isPrivate: true }] },
          }),
          findByContainer: async () => [],
        },
      },
    };
    const entity = {
      type: 'project' as const,
      humanReadableSlug: 'project',
      publicId: 'Project',
    };

    const visitor = await buildPublicContentData(
      'project',
      'project-uuid',
      'project-description',
      entity,
    );
    expect(visitor).toEqual({
      version: undefined,
      blocks: [
        { type: 'paragraph', data: { text: 'Public text' } },
        {
          type: 'privateSectionPlaceholder',
          data: {
            blockCount: 2,
            wordCount: 5,
            assetCount: 1,
            assetTotalSize: 42,
          },
        },
      ],
    });
    expect(JSON.stringify(visitor)).not.toMatch(
      /secret|private-section-id|asset-uuid|document|contentAttachment/i,
    );

    const administrator = await buildPublicContentData(
      'project',
      'project-uuid',
      'project-description',
      entity,
      true,
    );
    expect(administrator?.blocks[1]).toMatchObject({
      type: 'privateSectionExpanded',
      data: {
        summary: { blockCount: 2, wordCount: 5, assetCount: 1 },
        blocks: [
          { type: 'paragraph', data: { text: 'Highly secret words' } },
          {
            type: 'contentAttachment',
            data: {
              asset: {
                assetUuid: 'secret-file',
                assetUrl: '/projects/project-Project/content/secret-file.pdf',
              },
            },
          },
        ],
      },
    });
    expect(JSON.stringify(administrator)).not.toContain('private-section-id');
  });

  it('does not emit a placeholder for an empty normalized section', async () => {
    (globalThis as any).THEI_SERVER = {
      content: {
        findByOwner: async () => ({
          contentUuid: 'empty-section-content',
          data: {
            blocks: [
              {
                type: 'privateSectionBoundary',
                data: { sectionId: 'empty', edge: 'start' },
              },
              { type: 'paragraph', data: { text: '' } },
              {
                type: 'privateSectionBoundary',
                data: { sectionId: 'empty', edge: 'end' },
              },
            ],
          },
        }),
      },
      assets: { findByUuid: async () => undefined },
    };

    await expect(
      buildPublicContentData('event', 'event-uuid', 'event-body', {
        type: 'event',
        humanReadableSlug: 'event',
        publicId: 'Event',
      }),
    ).resolves.toEqual({ version: undefined, blocks: [] });
  });

  it('fails closed when persisted private section boundaries are malformed', async () => {
    (globalThis as any).THEI_SERVER = {
      content: {
        findByOwner: async () => ({
          contentUuid: 'broken-section-content',
          data: {
            blocks: [
              { type: 'paragraph', data: { text: 'Must not leak' } },
              {
                type: 'privateSectionBoundary',
                data: { sectionId: 'orphan', edge: 'start' },
              },
              { type: 'paragraph', data: { text: 'Secret tail' } },
            ],
          },
        }),
      },
    };

    await expect(
      buildPublicContentData('event', 'event-uuid', 'event-body', {
        type: 'event',
        humanReadableSlug: 'event',
        publicId: 'Event',
      }),
    ).resolves.toEqual({ blocks: [] });
  });

  it('builds a project stage card with its covering period and first media', async () => {
    const image = {
      assetUuid: 'stage-image',
      familyUuid: 'stage-family',
      contentHash: 'stage-hash',
      slug: 'stage-image',
      extension: 'webp',
      settingsKey: 'original',
      settingsVersion: 1,
      settings: null,
      type: AssetType.Image,
      size: 1,
      meta: { width: 1200, height: 800, accentHue: 28 },
    };
    (globalThis as any).THEI_SERVER = {
      content: {
        findByOwner: async () => ({
          contentUuid: 'stage-content',
          data: {
            blocks: [
              {
                type: 'contentMedia',
                data: {
                  asset: { assetUuid: image.assetUuid },
                  layout: 'stretch',
                },
              },
            ],
          },
        }),
      },
      assets: {
        findByUuid: async () => image,
        usages: {
          findOne: async () => ({
            meta: { role: 'content', refs: [{ isPrivate: false }] },
          }),
          findByContainer: async () => [],
        },
      },
    };

    const result = await buildPublicProjectStageSummary(
      { humanReadableSlug: 'project', publicId: 'Project' } as any,
      {
        stageUuid: 'stage-uuid',
        title: 'Research',
        summary: 'Stage summary',
        humanReadableSlug: 'research',
        publicId: 'Research',
        periods: [
          { startDate: '2027-03-10', endDate: '2027-03-14' },
          { startDate: '2026-11-02', endDate: '2026-11-08' },
        ],
      } as any,
    );

    expect(result).toMatchObject({
      date: '2027-03-14',
      period: { startDate: '2026-11-02', endDate: '2027-03-14' },
      media: {
        accentHue: 28,
        src: '/projects/project-Project/content/stage-image.webp',
      },
    });
    expect(result).not.toHaveProperty('projects');
  });

  it('only exposes a private section preview to an administrator', async () => {
    const image = {
      assetUuid: 'section-image',
      familyUuid: 'section-family',
      contentHash: 'section-hash',
      slug: 'section-image',
      extension: 'webp',
      settingsKey: 'original',
      settingsVersion: 1,
      settings: null,
      type: AssetType.Image,
      size: 1,
      meta: { width: 900, height: 600, accentHue: 310 },
    };
    (globalThis as any).THEI_SERVER = {
      content: {
        findByOwner: async () => ({
          contentUuid: 'section-content',
          data: {
            blocks: [
              {
                type: 'contentMedia',
                data: {
                  asset: { assetUuid: image.assetUuid },
                  layout: 'stretch',
                },
                tunes: { privateAccess: { isPrivate: true } },
              },
            ],
          },
        }),
      },
      assets: {
        findByUuid: async () => image,
        usages: {
          findOne: async () => ({
            meta: { role: 'content', refs: [{ isPrivate: true }] },
          }),
          findByContainer: async () => [],
        },
      },
    };
    const project = {
      humanReadableSlug: 'project',
      publicId: 'Project',
    } as any;
    const section = {
      sectionUuid: 'section-uuid',
      title: 'Details',
      summary: 'Section summary',
      humanReadableSlug: 'details',
      publicId: 'Details',
      createdAt: Date.UTC(2027, 3, 6),
    } as any;

    await expect(
      buildPublicProjectSectionSummary(project, section),
    ).resolves.toMatchObject({ date: '2027-04-06', media: undefined });
    await expect(
      buildPublicProjectSectionSummary(project, section, true),
    ).resolves.toMatchObject({
      date: '2027-04-06',
      media: {
        accentHue: 310,
        src: '/projects/project-Project/content/section-image.webp',
      },
    });
  });
});

describe('public content reference groups', () => {
  it('resolves accessible projects and attachments after privacy filtering', async () => {
    const projects = new Map([
      [
        'public-project',
        {
          projectUuid: 'public-project',
          title: 'Public project',
          summary: 'Available reference',
          access: ProjectEventAccessLevel.Public,
          humanReadableSlug: 'public-project',
          publicId: 'PublicProject',
        },
      ],
      [
        'private-project',
        {
          projectUuid: 'private-project',
          title: 'Private project',
          summary: 'Hidden reference',
          access: ProjectEventAccessLevel.Private,
          humanReadableSlug: 'private-project',
          publicId: 'PrivateProject',
        },
      ],
    ]);
    (globalThis as any).THEI_SERVER = {
      projects: {
        findByUuid: async (projectUuid: string) => projects.get(projectUuid),
      },
      assets: { usages: { findByContainer: async () => [] } },
    };
    const content = {
      blocks: [
        {
          type: 'entityLink',
          data: { entityType: 'project', entityId: 'public-project' },
        },
        {
          type: 'entityLink',
          data: { entityType: 'project', entityId: 'private-project' },
        },
        {
          type: 'entityLink',
          data: { entityType: 'project', entityId: 'missing-project' },
        },
        {
          type: 'contentAttachment',
          data: {
            asset: {
              assetUuid: 'guide',
              assetUrl: '/projects/project/content/guide.pdf',
              extension: 'pdf',
              size: 120,
            },
            title: 'Guide',
          },
        },
        {
          type: 'contentAttachment',
          data: {
            asset: {
              assetUuid: 'private-guide',
              assetUrl: '/projects/project/content/private.pdf',
              extension: 'pdf',
            },
          },
          tunes: { privateAccess: { isPrivate: true } },
        },
      ],
    } as any;

    const visitor = await buildPublicContentReferenceGroup(content, false);
    expect(visitor.links).toHaveLength(1);
    expect(visitor.links[0]).toMatchObject({
      kind: 'project',
      title: 'Public project',
      href: '/projects/public-project-PublicProject/',
    });
    expect(visitor.files).toEqual([
      {
        key: 'guide',
        title: 'Guide',
        description: undefined,
        href: '/projects/project/content/guide.pdf',
        extension: 'pdf',
        size: 120,
        media: undefined,
        archivedOriginal: undefined,
      },
    ]);

    const administrator = await buildPublicContentReferenceGroup(content, true);
    expect(administrator.links.map((link) => link.title)).toEqual([
      'Public project',
      'Private project',
    ]);
    expect(administrator.files).toHaveLength(2);
  });

  it('keeps manual event links separate and respects their privacy', () => {
    const iconMedia = {
      kind: 'image' as const,
      src: '/favicon.webp',
      previewSrc: '/favicon.webp',
      width: 48,
      height: 48,
    };
    const links = [
      {
        name: 'Documentation',
        isPrivate: false,
        url: 'https://example.com/',
        title: 'Example',
        description: 'Public manual link',
        faviconMedia: iconMedia,
        touchedAt: 0,
      },
      {
        name: 'Private notes',
        isPrivate: true,
        url: 'https://private.example/',
        title: 'Private',
        description: undefined,
        faviconMedia: iconMedia,
        touchedAt: 0,
      },
    ] as any;
    const files = [
      {
        title: 'Manual file',
        href: '/events/event/other-asset/file.pdf',
        extension: 'pdf',
        size: 10,
      },
    ];

    expect(buildPublicManualEventReferenceGroup(links, files, false)).toEqual({
      links: [
        {
          kind: 'external',
          title: 'Documentation',
          href: 'https://example.com/',
          description: 'Public manual link',
          iconMedia,
        },
      ],
      files,
    });
    expect(
      buildPublicManualEventReferenceGroup(links, files, true).links,
    ).toHaveLength(2);
  });
});

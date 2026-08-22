import { describe, expect, it } from 'vitest';
import { ProjectEventAccessLevel } from '../../../shared/access-level';
import { validateEventData } from '../../../shared/admin/event';
import type { EventEditData } from '../../../shared/event';

function eventData(overrides: Partial<EventEditData> = {}): EventEditData {
  return {
    title: '  Open Studio  ',
    summary: '  A practical gathering.  ',
    access: ProjectEventAccessLevel.Public,
    humanReadableSlug: 'open-studio',
    publicId: 'OpenStudio42',
    periods: [{ startDate: '2026-08-21', endDate: '2026-08-21' }],
    content: {
      data: { blocks: [{ type: 'paragraph', data: { text: 'Programme' } }] },
    },
    ...overrides,
  };
}

describe('validateEventData', () => {
  it('requires title, summary, dates, non-empty content and public ID', () => {
    expect(validateEventData(eventData({ title: ' ' }))).toBe(
      'Title cannot be empty',
    );
    expect(validateEventData(eventData({ summary: ' ' }))).toBe(
      'Summary cannot be empty',
    );
    expect(validateEventData(eventData({ periods: [] }))).toBe(
      'Stage period is required',
    );
    expect(
      validateEventData(eventData({ content: { data: { blocks: [] } } })),
    ).toBe('Event content is required');
    expect(validateEventData(eventData({ publicId: '' }))).toBe(
      'Public ID cannot be empty',
    );
  });

  it('sorts and merges overlapping periods without mutating the input', () => {
    const periods = [
      { startDate: '2026-08-24', endDate: '2026-08-26' },
      { startDate: '2026-08-20', endDate: '2026-08-22' },
      { startDate: '2026-08-21', endDate: '2026-08-25' },
      { startDate: '2026-09-01', endDate: '2026-09-01' },
    ];
    const result = validateEventData(eventData({ periods }));
    expect(typeof result === 'string' ? result : result.periods).toEqual([
      { startDate: '2026-08-20', endDate: '2026-08-26' },
      { startDate: '2026-09-01', endDate: '2026-09-01' },
    ]);
    expect(periods).toHaveLength(4);
  });

  it('normalizes ordered files, links, tags, relations and content links', () => {
    const result = validateEventData(
      eventData({
        otherAssets: [
          {
            assetUuid: 'a-file',
            title: '  Programme  ',
            caption: '  PDF notes  ',
            isPrivate: true,
          },
        ],
        externalLinks: [
          {
            url: 'https://example.com/path',
            name: '  Details  ',
            isPrivate: false,
          },
        ],
        relations: [{ projectUuid: 'p-one', note: '  Partner  ' }],
        tags: [{ title: '  Research  ' }, { title: 'Community' }],
        content: {
          data: {
            blocks: [
              {
                type: 'entityLink',
                data: {
                  entityType: 'event',
                  entityId: '  e-related  ',
                  title: 'must not be persisted',
                },
              },
            ],
          },
        },
      }),
    );
    expect(result).not.toBeTypeOf('string');
    if (typeof result === 'string') return;
    expect(result.otherAssets).toEqual([
      {
        assetUuid: 'a-file',
        title: 'Programme',
        caption: 'PDF notes',
        isPrivate: true,
      },
    ]);
    expect(result.externalLinks?.[0]).toMatchObject({
      url: 'https://example.com/path',
      name: 'Details',
      isPrivate: false,
    });
    expect(result.relations).toEqual([
      { projectUuid: 'p-one', note: 'Partner' },
    ]);
    expect(result.tags).toEqual([
      { title: 'Research' },
      { title: 'Community' },
    ]);
    expect(result.content.data?.blocks[0]?.data).toEqual({
      entityType: 'event',
      entityId: 'e-related',
    });
  });

  it('rejects duplicate files, links, projects and tags', () => {
    expect(
      validateEventData(
        eventData({
          otherAssets: [
            { assetUuid: 'a-1', title: 'One', isPrivate: false },
            { assetUuid: 'a-1', title: 'Two', isPrivate: false },
          ],
        }),
      ),
    ).toBe('Duplicate event file');
    expect(
      validateEventData(
        eventData({
          externalLinks: [
            { url: 'https://example.com', name: 'One', isPrivate: false },
            { url: 'https://example.com/', name: 'Two', isPrivate: false },
          ],
        }),
      ),
    ).toBe('Duplicate external link');
    expect(
      validateEventData(
        eventData({
          relations: [{ projectUuid: 'p-1' }, { projectUuid: 'p-1' }],
        }),
      ),
    ).toBe('Duplicate related project');
    expect(
      validateEventData(
        eventData({ tags: [{ title: 'Tag' }, { title: ' tag ' }] }),
      ),
    ).toBe('Duplicate tag');
  });

  it('rejects invalid access, public IDs and file privacy', () => {
    expect(validateEventData(eventData({ access: '' }))).toBe(
      'Invalid access level',
    );
    expect(validateEventData(eventData({ publicId: 'not-valid!' }))).toBe(
      'Invalid public ID',
    );
    expect(
      validateEventData(
        eventData({
          otherAssets: [
            {
              assetUuid: 'a-1',
              title: 'File',
              isPrivate: undefined as unknown as boolean,
            },
          ],
        }),
      ),
    ).toBe('Invalid file privacy');
  });
});

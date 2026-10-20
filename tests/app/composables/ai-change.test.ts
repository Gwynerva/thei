import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiActionItem } from '../../../shared/ai';
import enModule from '../../../shared/language/list/en';
import { fieldChange, updateFields } from '../../../app/composables/ai-change';
import {
  fieldName,
  fieldSaid,
  fieldValueWords,
} from '../../../app/composables/ai-format';

/**
 * A change of an entity's form, as its card says it: the fields by the
 * names a change gives them — never as the form keeps them, `externalLinks`
 * — and every value in words, a list of files, links or relations item by
 * item. The owner's words are formatted; an address is said as typed.
 */
beforeEach(() => {
  vi.stubGlobal('phrase', { value: enModule.phrases });
  // Formatting marked, to tell the owner's words from what is said as typed.
  vi.stubGlobal('publicText', (text: string | null | undefined) =>
    (text ?? '').toUpperCase(),
  );
  vi.stubGlobal('fieldSaid', fieldSaid);
  vi.stubGlobal('fieldValueWords', fieldValueWords);
  // Named as the lists name an entity: its title formatted.
  vi.stubGlobal(
    'entityListName',
    (entity: { title?: string; date?: string }) =>
      entity.date ?? (entity.title ?? '').toUpperCase(),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const text = (words: string) => ({
  data: { blocks: [{ type: 'paragraph', data: { text: words } }] },
});

const update = (fields: string[], more: Partial<AiActionItem> = {}) =>
  ({
    kind: 'update',
    payload: { changes: {} },
    base: { fields, before: {}, after: {} },
    refs: {},
    ...more,
  }) as unknown as AiActionItem;

describe('an update of a form', () => {
  it('names its fields as a change does, in the owner’s words', () => {
    const fields = updateFields(
      update(['humanReadableSlug', 'externalLinks', 'otherAssets', 'title'], {
        fieldNames: {
          humanReadableSlug: 'slug',
          externalLinks: 'links',
          otherAssets: 'files',
          title: 'title',
        },
      }),
    );
    expect(fields.map(({ field }) => fieldName(field))).toEqual([
      'Address',
      'Links',
      'Files',
      'Title',
    ]);
    // Without what it was made against, by the fields its change names.
    expect(
      updateFields({
        ...update([]),
        base: null,
        payload: { changes: { summary: 'Shorter' } },
      }).map(({ field }) => field),
    ).toEqual(['summary']);
  });

  it('says links and files item by item, the untitled files counted', () => {
    expect(
      fieldChange(
        'links',
        [{ url: 'https://a.example', note: 'Home', isPrivate: false }],
        [
          { url: 'https://a.example', note: 'Home', isPrivate: false },
          { url: 'https://b.example', note: '', isPrivate: false },
        ],
      ),
    ).toEqual({
      type: 'items',
      items: [
        { kind: 'same', text: 'HOME' },
        { kind: 'added', text: 'https://b.example' },
      ],
    });
    expect(
      fieldChange(
        'files',
        [{ assetUuid: 'a-1', title: 'Map', isPrivate: false }],
        [
          { assetUuid: 'a-1', title: 'Map', isPrivate: false },
          { assetUuid: 'a-2', title: '', isPrivate: false },
        ],
      ),
    ).toEqual({
      type: 'items',
      items: [
        { kind: 'same', text: 'MAP' },
        { kind: 'added', text: '1 file' },
      ],
    });
  });

  it('says a relation by the entity it leads to', () => {
    const change = fieldChange(
      'relations',
      [
        {
          entityType: 'event',
          entityId: 'e-1',
          type: 'related',
          title: 'Walk',
        },
      ],
      [
        { entityType: 'event', entityId: 'e-1', type: 'related' },
        { entityType: 'event', entityId: 'e-2', type: 'related' },
      ],
      {
        refs: {
          'event:e-1': {
            ref: 'event:e-1',
            type: 'event',
            id: 'e-1',
            title: 'Walk',
          },
          'event:e-2': {
            ref: 'event:e-2',
            type: 'event',
            id: 'e-2',
            title: 'Lake',
          },
        } as never,
      },
    );
    expect(change).toEqual({
      type: 'items',
      items: [
        { kind: 'same', text: 'WALK' },
        { kind: 'added', text: 'LAKE' },
      ],
    });
  });

  it('says a text by its words, an address as typed', () => {
    const change = fieldChange(
      'description',
      text('Old words here'),
      text('Old words here and more'),
    );
    expect(change.type).toBe('words');
    expect(change.type === 'words' && change.pieces.at(-1)).toMatchObject({
      kind: 'added',
      text: expect.stringContaining('AND MORE'),
    });
    expect(fieldChange('slug', 'ice-walk', 'ice-walk-2')).toMatchObject({
      type: 'words',
    });
    expect(JSON.stringify(fieldChange('slug', 'ice-walk', 'lake'))).not.toMatch(
      /[A-Z]/,
    );
    // A value of no words on either side says nothing.
    expect(fieldChange('sectionOrder', {}, {})).toEqual({ type: 'none' });
  });
});

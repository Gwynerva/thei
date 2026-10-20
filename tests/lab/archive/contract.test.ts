// The lab's archive keeps up with Thei: every block, every inline markup and
// every layout Thei stores can be written in Lab Markdown and is written in
// the conformance archive, and every field of Thei's forms has its place in
// the format. A new block type or field fails here until the format and the
// adapter (tests/lab/archive/) know it.
import { describe, expect, it } from 'vitest';
import {
  CONTENT_BLOCK_TYPES,
  CONTENT_MEDIA_LAYOUTS,
  type ContentOutputBlock,
} from '#layers/thei/shared/content';
import { CONTENT_INLINE_MARKUP_SELECTOR } from '#layers/thei/shared/content-link';
import { FORM_FIELDS } from '#layers/thei/server/thei/ai/forms/changes';
import { convertText } from './dialect';
import { FIELD_MAP, NOT_IN_FORMAT } from './fields';
import { readArchive } from './read';
import { archiveTexts } from './texts';
import { archiveSource } from './source';

function convertedConformance(): ContentOutputBlock[] {
  const { archive } = readArchive(archiveSource('conformance').dir);
  const fileKinds = new Map(archive.files.map((file) => [file.id, file.kind]));
  return archiveTexts(archive).flatMap((text) => {
    const { data, problems } = convertText(text.markdown, {
      owner: text.owner,
      slot: text.slot,
      file: (id) => {
        const kind = fileKinds.get(id);
        return kind ? { assetUuid: `asset-${id}`, kind } : undefined;
      },
      entity: (ref) => ({ uuid: `uuid-${ref.replace(/[^a-z0-9]+/gi, '-')}` }),
      anchor: () => 'heading',
    });
    expect(problems, `${text.file} (${text.slot})`).toEqual([]);
    return data.blocks;
  });
}

describe('the conformance archive covers what Thei stores', () => {
  const blocks = convertedConformance();
  const html = JSON.stringify(blocks);

  it('holds every block type', () => {
    const types = new Set(blocks.map((block) => block.type));
    for (const type of CONTENT_BLOCK_TYPES) expect(types, type).toContain(type);
  });

  it('holds every media layout', () => {
    const layouts = new Set(
      blocks
        .filter((block) => block.type === 'contentMedia')
        .map((block) => (block.data as { layout: string }).layout),
    );
    for (const layout of CONTENT_MEDIA_LAYOUTS)
      expect(layouts, layout).toContain(layout);
  });

  it('holds every inline markup, each link kind and a line break', () => {
    const stored: Record<string, string> = {
      strong: 'b',
      em: 'i',
      strike: 's',
    };
    for (const tag of CONTENT_INLINE_MARKUP_SELECTOR.split(',').map((item) =>
      item.trim(),
    ))
      expect(html, tag).toContain(`<${stored[tag] ?? tag}`);
    expect(html).toContain('data-content-link=\\"external\\"');
    expect(html).toContain('data-content-link=\\"entity\\"');
    expect(html).toContain('data-entity-fragment');
    expect(html).toContain('data-content-note');
    expect(html).toContain('<a href=\\"/');
    expect(html).toContain('<br>');
  });

  it('holds every list style, another counter, a centred quote and a spoiler', () => {
    const lists = blocks
      .filter((block) => block.type === 'list')
      .map((block) => block.data as Record<string, any>);
    for (const style of ['unordered', 'ordered', 'checklist'])
      expect(
        lists.map((list) => list.style),
        style,
      ).toContain(style);
    expect(
      lists.some(
        (list) => list.meta?.counterType && list.meta.counterType !== 'numeric',
      ),
    ).toBe(true);
    expect(lists.some((list) => list.meta?.start > 1)).toBe(true);
    expect(
      blocks.some(
        (block) =>
          block.type === 'quote' && (block.data as any).alignment === 'center',
      ),
    ).toBe(true);
    expect(blocks.some((block) => block.tunes?.spoiler === true)).toBe(true);
  });
});

describe('every field of the forms has its place in the format', () => {
  for (const [kind, fields] of Object.entries(FORM_FIELDS))
    it(kind, () => {
      const known = { ...FIELD_MAP[kind], ...NOT_IN_FORMAT[kind] };
      for (const field of fields)
        expect(Object.keys(known), `${kind}.${field}`).toContain(field);
    });
});

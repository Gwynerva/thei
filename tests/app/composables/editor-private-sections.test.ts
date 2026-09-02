import { describe, expect, it } from 'vitest';
import { createEditorPrivateSections } from '../../../app/composables/editor-private-sections';

function createHolder(section?: {
  sectionId: string;
  edge: 'start' | 'end';
  createPair?: boolean;
}) {
  let createPair = section?.createPair === true;
  const boundary = section
    ? {
        dataset: {
          privateSectionId: section.sectionId,
          privateSectionEdge: section.edge,
          privateSectionStartLabel: 'Start',
          privateSectionEndLabel: 'End',
        },
        removeAttribute(name: string) {
          if (name === 'data-private-section-create-pair') createPair = false;
        },
        querySelector: () => undefined,
      }
    : undefined;
  return {
    dataset: {} as Record<string, string>,
    removeAttribute(name: string) {
      const key = name
        .replace(/^data-/, '')
        .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      delete this.dataset[key];
    },
    querySelector(selector: string) {
      if (selector === '[data-private-section-id]') return boundary;
      if (selector === '[data-private-section-create-pair="true"]')
        return createPair ? boundary : undefined;
      return undefined;
    },
  };
}

describe('Editor.js private section creation', () => {
  it('inserts and focuses an empty paragraph between the boundaries', () => {
    const start = {
      id: 'start',
      type: 'privateSectionBoundary',
      holder: createHolder({
        sectionId: 'section',
        edge: 'start',
        createPair: true,
      }),
    };
    const blocks = [start] as Array<{
      id: string;
      type: string;
      holder: ReturnType<typeof createHolder>;
    }>;
    const insertions: Array<{
      type?: string;
      index?: number;
      needToFocus?: boolean;
    }> = [];
    let nextId = 0;
    const editor = {
      caret: { setToBlock: () => true },
      blocks: {
        getBlocksCount: () => blocks.length,
        getBlockByIndex: (index: number) => blocks[index],
        getBlockIndex: (id: string) =>
          blocks.findIndex((block) => block.id === id),
        insert(
          type?: string,
          data?: { sectionId?: string; edge?: 'start' | 'end' },
          _config?: unknown,
          index = blocks.length,
          needToFocus?: boolean,
        ) {
          const block = {
            id: `inserted-${++nextId}`,
            type: type ?? 'paragraph',
            holder: createHolder(
              type === 'privateSectionBoundary' && data?.sectionId
                ? {
                    sectionId: data.sectionId,
                    edge: data.edge === 'end' ? 'end' : 'start',
                  }
                : undefined,
            ),
          };
          blocks.splice(index, 0, block);
          insertions.push({ type, index, needToFocus });
          return block;
        },
        delete: (index: number) => blocks.splice(index, 1),
      },
    };
    const privateSections = createEditorPrivateSections(editor as never);
    const added = (target: (typeof blocks)[number]) =>
      ({ type: 'block-added', detail: { target } }) as never;

    expect(privateSections.handleChange(added(start))).toBe(true);
    expect(blocks.map((block) => block.type)).toEqual([
      'privateSectionBoundary',
      'paragraph',
      'privateSectionBoundary',
    ]);
    expect(insertions).toEqual([
      {
        type: 'privateSectionBoundary',
        index: 1,
        needToFocus: undefined,
      },
      { type: 'paragraph', index: 1, needToFocus: true },
    ]);
    expect(blocks[1]?.holder.dataset.privateSectionMember).toBe('true');
    expect(
      privateSections.handleChange([added(blocks[1]!), added(blocks[2]!)]),
    ).toBe(false);
  });
});

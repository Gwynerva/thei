import { describe, expect, it } from 'vitest';
import { createEditorPrivateSections } from '../../../app/composables/editor-private-sections';

interface SectionEdge {
  sectionId: string;
  edge: 'start' | 'end';
  createPair?: boolean;
}

function createHolder(section?: SectionEdge) {
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

interface MockBlock {
  id: string;
  type: string;
  holder: ReturnType<typeof createHolder>;
}

function block(id: string, section?: SectionEdge): MockBlock {
  return {
    id,
    type: section ? 'privateSectionBoundary' : 'paragraph',
    holder: createHolder(section),
  };
}

/** Before, [one: Inside one], Between, [two: Inside two]. */
function twoSections() {
  return [
    block('p0'),
    block('s1', { sectionId: 'one', edge: 'start' }),
    block('p1'),
    block('e1', { sectionId: 'one', edge: 'end' }),
    block('p2'),
    block('s2', { sectionId: 'two', edge: 'start' }),
    block('p3'),
    block('e2', { sectionId: 'two', edge: 'end' }),
  ];
}

function createEditor(initial: MockBlock[] = []) {
  const blocks = [...initial];
  const insertions: Array<{
    type?: string;
    index?: number;
    needToFocus?: boolean;
  }> = [];
  const moves: Array<[toIndex: number, fromIndex: number]> = [];
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
        data?: Partial<SectionEdge>,
        _config?: unknown,
        index = blocks.length,
        needToFocus?: boolean,
      ) {
        const inserted = block(
          `inserted-${++nextId}`,
          type === 'privateSectionBoundary' && data?.sectionId
            ? {
                sectionId: data.sectionId,
                edge: data.edge === 'end' ? 'end' : 'start',
                createPair: data.createPair,
              }
            : undefined,
        );
        blocks.splice(index, 0, inserted);
        insertions.push({ type, index, needToFocus });
        return inserted;
      },
      delete: (index: number) => blocks.splice(index, 1),
      // Editor.js's own order: where to, then which.
      move(toIndex: number, fromIndex: number) {
        moves.push([toIndex, fromIndex]);
        const [moved] = blocks.splice(fromIndex, 1);
        blocks.splice(toIndex, 0, moved!);
      },
    },
  };
  return {
    editor,
    blocks,
    insertions,
    moves,
    order: () => blocks.map((block) => block.id),
  };
}

const added = (target: MockBlock) =>
  ({ type: 'block-added', detail: { target } }) as never;
const removed = (target: MockBlock) =>
  ({ type: 'block-removed', detail: { target } }) as never;
const moved = (target: MockBlock, fromIndex: number, toIndex: number) =>
  ({ type: 'block-moved', detail: { target, fromIndex, toIndex } }) as never;

describe('Editor.js private section creation', () => {
  it('inserts and focuses an empty paragraph between the boundaries', () => {
    const start = block('start', {
      sectionId: 'section',
      edge: 'start',
      createPair: true,
    });
    const { editor, blocks, insertions } = createEditor([start]);
    const privateSections = createEditorPrivateSections(editor as never);

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

  it('keeps a section added while another is being removed in the same batch', () => {
    const { editor, blocks, order } = createEditor([
      block('p0'),
      block('s1', { sectionId: 'one', edge: 'start' }),
      block('p1'),
      block('e1', { sectionId: 'one', edge: 'end' }),
    ]);
    const privateSections = createEditorPrivateSections(editor as never);
    // The start of one section is deleted and a new section goes in after
    // the first paragraph; Editor.js reports the addition first.
    const [start] = editor.blocks.delete(1);
    const created = editor.blocks.insert(
      'privateSectionBoundary',
      { sectionId: 'new', edge: 'start', createPair: true },
      undefined,
      1,
    );

    expect(
      privateSections.handleChange([added(created), removed(start!)]),
    ).toBe(true);
    expect(order()).toEqual([
      'p0',
      created.id,
      blocks[2]!.id,
      blocks[3]!.id,
      'p1',
    ]);
    expect(blocks.slice(1, 4).map((block) => block.type)).toEqual([
      'privateSectionBoundary',
      'paragraph',
      'privateSectionBoundary',
    ]);
  });
});

describe('Editor.js private section moves', () => {
  it('keeps a move that stays clear of other sections and puts back one that crosses them', () => {
    const { editor, blocks, moves, order } = createEditor(twoSections());
    const privateSections = createEditorPrivateSections(editor as never);

    editor.blocks.move(2, 4);
    moves.length = 0;
    expect(privateSections.handleChange(moved(blocks[2]!, 4, 2))).toBe(true);
    expect(moves).toEqual([]);

    // The start of the first section, dropped inside the second.
    const s1 = blocks[1]!;
    editor.blocks.move(6, 1);
    moves.length = 0;
    expect(privateSections.handleChange(moved(s1, 1, 6))).toBe(false);
    expect(order()).toEqual(['p0', 's1', 'p2', 'p1', 'e1', 's2', 'p3', 'e2']);
    // Putting it back reports a move of its own in the next batch.
    expect(privateSections.handleChange(moved(s1, 6, 1))).toBe(false);
    expect(moves).toHaveLength(1);
  });

  it('judges a move by the sections it left, not by one added later in the same batch', () => {
    const { editor, blocks, moves, order } = createEditor(twoSections());
    const privateSections = createEditorPrivateSections(editor as never);
    // The paragraph between the sections moves into the first; before
    // Editor.js reports it, a new section goes in after the first paragraph,
    // its end still to come.
    const p2 = blocks[4]!;
    editor.blocks.move(2, 4);
    const created = editor.blocks.insert(
      'privateSectionBoundary',
      { sectionId: 'new', edge: 'start', createPair: true },
      undefined,
      1,
    );
    moves.length = 0;

    expect(
      privateSections.handleChange([moved(p2, 4, 2), added(created)]),
    ).toBe(true);
    expect(moves).toEqual([]);
    expect(order().slice(4)).toEqual([
      's1',
      'p2',
      'p1',
      'e1',
      's2',
      'p3',
      'e2',
    ]);
    expect(blocks.slice(0, 4).map((block) => block.type)).toEqual([
      'paragraph',
      'privateSectionBoundary',
      'paragraph',
      'privateSectionBoundary',
    ]);
  });

  it('puts a boundary moved several times in one batch back where it stood', () => {
    const { editor, blocks, order } = createEditor(twoSections());
    const privateSections = createEditorPrivateSections(editor as never);
    // "Move up" three times on the start of the second section. Editor.js
    // keeps only the latest move of a block in a batch.
    const s2 = blocks[5]!;
    editor.blocks.move(4, 5);
    editor.blocks.move(3, 4);
    editor.blocks.move(2, 3);

    expect(privateSections.handleChange(moved(s2, 3, 2))).toBe(false);
    expect(order()).toEqual(['p0', 's1', 'p1', 'e1', 'p2', 's2', 'p3', 'e2']);
  });
});

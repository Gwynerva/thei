import { describe, expect, it } from 'vitest';
import {
  editorEnterAction,
  editorSelectedBlocksTakeEnter,
  type EditorEnterContext,
} from '../../../app/composables/editor-current-block';

const enter = (context: Partial<EditorEnterContext>) =>
  editorEnterAction({
    place: 'block',
    object: true,
    composing: false,
    modified: false,
    handled: false,
    menuOpen: false,
    blocksSelected: false,
    collapsed: true,
    pointerFocused: false,
    ...context,
  });

describe('Enter in the editor', () => {
  describe('text Editor.js lays out itself', () => {
    it('leaves the text of a paragraph, a heading or a list to Editor.js', () => {
      expect(enter({ object: false, place: 'text' })).toBe('pass');
      expect(enter({ object: false, place: 'text', modified: true })).toBe(
        'pass',
      );
      expect(enter({ object: false, place: 'text', menuOpen: true })).toBe(
        'pass',
      );
    });

    it('keeps Enter from text while a block is still selected, its settings open', () => {
      // Editor.js would split the selected block, which holds no caret.
      for (const place of ['text', 'line'] as const)
        expect(
          enter({ object: false, place, blocksSelected: true, menuOpen: true }),
        ).toBe('swallow');
    });

    it('takes a quote caption as one line, with Shift+Enter for a break', () => {
      expect(enter({ object: false, place: 'line' })).toBe('insert-after');
      expect(enter({ object: false, place: 'line', modified: true })).toBe(
        'pass',
      );
      expect(enter({ object: false, place: 'line', collapsed: false })).toBe(
        'swallow',
      );
      expect(enter({ object: false, place: 'line', menuOpen: true })).toBe(
        'swallow',
      );
      expect(enter({ object: false, place: 'line', handled: true })).toBe(
        'pass',
      );
    });
  });

  describe('a block without text of its own', () => {
    it('adds a paragraph after the block itself, a picture or a video', () => {
      expect(enter({ place: 'block' })).toBe('insert-after');
    });

    it('adds a paragraph after a caption, from any place of its caret', () => {
      expect(enter({ place: 'line' })).toBe('insert-after');
    });

    it('leaves a caption as it is when text is selected in it', () => {
      expect(enter({ place: 'line', collapsed: false })).toBe('swallow');
    });

    it('lets a button or a tile reached with the keyboard do what it does', () => {
      expect(enter({ place: 'control' })).toBe('hide');
    });

    it('moves on from a button or a tile that was just clicked or tapped', () => {
      expect(enter({ place: 'control', pointerFocused: true })).toBe(
        'insert-after',
      );
    });

    it('leaves a field of several lines to itself', () => {
      expect(enter({ place: 'field' })).toBe('hide');
    });

    it('never lets Editor.js split the block', () => {
      for (const place of ['block', 'line', 'field', 'control'] as const) {
        for (const context of [
          { modified: true },
          { handled: true },
          { menuOpen: true },
        ])
          expect(enter({ place, ...context })).toBe('hide');
      }
    });

    it('treats a block it cannot tell as one without text', () => {
      // The caller reports an unknown block as `object`; nothing here asks
      // Editor.js, which would split it.
      expect(enter({ object: true, place: 'block' })).not.toBe('pass');
    });
  });

  it('leaves Enter that commits a composition alone', () => {
    for (const place of ['text', 'line', 'field', 'control', 'block'] as const)
      expect(enter({ place, composing: true })).toBe('pass');
  });

  it('leaves keys typed outside every block alone', () => {
    expect(enter({ place: 'outside' })).toBe('pass');
    expect(enter({ place: 'outside', object: false })).toBe('pass');
  });
});

describe('Enter over selected blocks', () => {
  const selected = (
    context: Partial<Parameters<typeof editorSelectedBlocksTakeEnter>[0]>,
  ) =>
    editorSelectedBlocksTakeEnter({
      composing: false,
      handled: false,
      menuOpen: false,
      selectedBlocks: 1,
      textSelected: false,
      ...context,
    });

  it('adds a paragraph after them instead of removing them', () => {
    // Editor.js would take Enter as a key typed over the blocks.
    expect(selected({})).toBe(true);
    expect(selected({ selectedBlocks: 3 })).toBe(true);
  });

  it('has nothing to do with no block selected', () => {
    expect(selected({ selectedBlocks: 0 })).toBe(false);
  });

  it('keeps out of block settings, which select the block they are for', () => {
    expect(selected({ menuOpen: true })).toBe(false);
  });

  it('keeps out while text is selected or a composition ends', () => {
    expect(selected({ textSelected: true })).toBe(false);
    expect(selected({ composing: true })).toBe(false);
    expect(selected({ handled: true })).toBe(false);
  });
});

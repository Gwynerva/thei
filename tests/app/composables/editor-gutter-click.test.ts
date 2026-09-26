import { describe, expect, it } from 'vitest';
import {
  fallbackCaretEdge,
  gutterCaretTarget,
} from '../../../app/composables/editor-gutter-click';

const line = (top: number, bottom: number) => ({
  top,
  bottom,
  left: 100,
  right: 300,
});

describe('Editor.js gutter click helpers', () => {
  it('reads a click in the left margin as the start of its own line', () => {
    const target = gutterCaretTarget([line(0, 20), line(20, 40)], {
      x: 60,
      y: 30,
    });

    expect(target).toEqual({ index: 1, x: 101, y: 30 });
  });

  it('reads a click in the right margin as the end of its own line', () => {
    const target = gutterCaretTarget([line(0, 20), line(20, 40)], {
      x: 340,
      y: 10,
    });

    expect(target).toEqual({ index: 0, x: 299, y: 10 });
  });

  it('keeps a click inside a field where it is', () => {
    expect(gutterCaretTarget([line(0, 20)], { x: 150, y: 10 })).toEqual({
      index: 0,
      x: 150,
      y: 10,
    });
  });

  it('picks the nearest field for a click between or beyond them', () => {
    const fields = [line(0, 20), line(30, 50)];

    expect(gutterCaretTarget(fields, { x: 60, y: 27 })).toEqual({
      index: 1,
      x: 101,
      y: 31,
    });
    expect(gutterCaretTarget(fields, { x: 60, y: 22 })).toEqual({
      index: 0,
      x: 101,
      y: 19,
    });
    expect(gutterCaretTarget(fields, { x: 60, y: 90 })).toEqual({
      index: 1,
      x: 101,
      y: 49,
    });
  });

  it('has nothing to say about a block without fields', () => {
    expect(gutterCaretTarget([], { x: 0, y: 0 })).toBeUndefined();
  });

  it('falls back to the end the click is closer to', () => {
    expect(fallbackCaretEdge(120, line(0, 20))).toBe('start');
    expect(fallbackCaretEdge(280, line(0, 20))).toBe('end');
  });
});

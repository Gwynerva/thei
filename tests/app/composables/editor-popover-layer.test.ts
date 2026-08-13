import { describe, expect, it } from 'vitest';
import {
  isRootEditorPopover,
  viewportShift,
} from '../../../app/composables/editor-popover-layer';

function popover(...classes: string[]) {
  return {
    classList: { contains: (value: string) => classes.includes(value) },
  } as unknown as Element;
}

describe('editor popover layer', () => {
  it('layers only root popovers', () => {
    expect(isRootEditorPopover(popover('ce-popover'))).toBe(true);
    expect(
      isRootEditorPopover(popover('ce-popover', 'ce-popover--nested')),
    ).toBe(false);
  });

  it('keeps a complete popover tree inside the viewport', () => {
    expect(
      viewportShift(
        { left: 900, top: 650, right: 1100, bottom: 850 },
        1024,
        768,
        4,
      ),
    ).toEqual({ x: -80, y: -86 });
  });

  it('does not move bounds that already fit', () => {
    expect(
      viewportShift(
        { left: 100, top: 100, right: 300, bottom: 300 },
        1024,
        768,
        4,
      ),
    ).toEqual({ x: 0, y: 0 });
  });
});

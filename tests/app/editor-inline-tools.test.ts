import { describe, expect, it, vi } from 'vitest';
import {
  inlineLinkPopupAnchorRect,
  translateInlineLinkRect,
} from '../../app/components/content/editor-inline-selection';

describe('translateInlineLinkRect', () => {
  it('anchors the popup at the inline toolbar top-left corner', () => {
    expect(
      inlineLinkPopupAnchorRect({
        left: 400,
        top: 300,
        right: 580,
        bottom: 340,
        width: 180,
        height: 40,
        x: 400,
        y: 300,
      }),
    ).toEqual({
      left: 400,
      top: 300,
      right: 400,
      bottom: 300,
      width: 0,
      height: 0,
      x: 400,
      y: 300,
    });
  });

  it('keeps the inline tool button offset when its editor moves', () => {
    vi.stubGlobal('DOMRect', {
      fromRect: ({ x = 0, y = 0, width = 0, height = 0 }: DOMRectInit) => ({
        left: x,
        top: y,
        right: x + width,
        bottom: y + height,
        width,
        height,
        x,
        y,
      }),
    });

    expect(
      translateInlineLinkRect(
        {
          left: 400,
          top: 300,
          right: 428,
          bottom: 328,
          width: 28,
          height: 28,
          x: 400,
          y: 300,
        },
        { left: 250, top: 200 },
        { left: 230, top: 150 },
      ),
    ).toMatchObject({
      left: 380,
      top: 250,
      right: 408,
      bottom: 278,
    });

    vi.unstubAllGlobals();
  });
});

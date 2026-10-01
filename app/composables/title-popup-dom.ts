import {
  readTitlePopup,
  type TitlePopupContentLine,
} from './title-popup-content';

/**
 * Whether any part of an anchor marked `data-title-popup-clip` is cut short —
 * by an ellipsis on one line, or by a clamp of several.
 */
function isClipped(el: HTMLElement) {
  return Array.from(
    el.querySelectorAll<HTMLElement>('[data-title-popup-clip]'),
  ).some(
    (part) =>
      part.scrollWidth > part.clientWidth + 1 ||
      part.scrollHeight > part.clientHeight + 1,
  );
}

/** What an anchor's popup would show now, or `null` when it shows nothing. */
export function getTitlePopup(
  el: HTMLElement,
): { lines: TitlePopupContentLine[]; popupClass: string } | null {
  // A control whose own label is on screen needs no hint repeating it: the
  // label may only be shown at some widths, and the hint covers the others.
  const label = el.querySelector<HTMLElement>('[data-title-popup-label]');
  if (label?.getClientRects().length) return null;
  // A popup that repeats the text on screen (`data-title-popup-clipped`) is
  // only worth showing when some of that text is cut.
  if (el.dataset.titlePopupClipped !== undefined && !isClipped(el)) return null;
  const lines = readTitlePopup(
    el.dataset.titlePopup,
    el.dataset.titlePopupRich,
  );
  if (!lines?.length) return null;
  const popupClass = el.dataset.titlePopupClass ?? '';
  return { lines, popupClass };
}

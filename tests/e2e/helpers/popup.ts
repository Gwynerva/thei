import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Whether a popup can be used where it opened, as a person would find it:
 * wholly on the screen, on top of everything at its centre and its four
 * inner corners, inside the open `<dialog>` when one is open — a modal is a
 * dialog in the top layer, and a popup left in the body opens beneath it —
 * with its first control there to press, and, by an element, showing it is
 * open and pointing at it.
 */
export async function expectPopupUsable(page: Page, popup: Locator) {
  await expect(popup).toBeVisible();
  // Measured once it has grown or slid into place.
  await popup.evaluate((element) =>
    Promise.all(
      (element.closest('[data-floating-popup]') ?? element)
        .getAnimations({ subtree: true })
        .filter((animation) =>
          Number.isFinite(animation.effect?.getComputedTiming().endTime),
        )
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
  const box = await popup.boundingBox();
  expect(box, 'the popup has no box').not.toBeNull();
  const viewport = page.viewportSize()!;
  const offscreen = [
    box!.x < -0.5 && `left ${box!.x}`,
    box!.y < -0.5 && `top ${box!.y}`,
    box!.x + box!.width > viewport.width + 0.5 &&
      `right ${box!.x + box!.width} > ${viewport.width}`,
    box!.y + box!.height > viewport.height + 0.5 &&
      `bottom ${box!.y + box!.height} > ${viewport.height}`,
  ].filter(Boolean);
  expect(offscreen, 'the popup leaves the screen').toEqual([]);

  const layering = await popup.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const inset = Math.min(6, rect.width / 4, rect.height / 4);
    const points: [string, number, number][] = [
      ['centre', rect.left + rect.width / 2, rect.top + rect.height / 2],
      ['top left', rect.left + inset, rect.top + inset],
      ['top right', rect.right - inset, rect.top + inset],
      ['bottom left', rect.left + inset, rect.bottom - inset],
      ['bottom right', rect.right - inset, rect.bottom - inset],
    ];
    const covered = points
      .filter(([, x, y]) => {
        const hit = document.elementFromPoint(x, y);
        return !hit || !element.contains(hit);
      })
      .map(([name, x, y]) => {
        const hit = document.elementFromPoint(x, y);
        const popupOf = hit?.closest<HTMLElement>('[data-floating-popup]')
          ?.dataset.floatingPopup;
        const what = hit
          ? `${hit.tagName.toLowerCase()}${hit.className ? `.${String(hit.className).split(' ').join('.')}` : ''}${popupOf ? ` in popup ${popupOf}` : ''}`
          : 'nothing';
        return `${name} under ${what}`;
      });
    const dialog = document.querySelector('dialog[open]');
    return {
      covered,
      outsideDialog: Boolean(dialog && !dialog.contains(element)),
    };
  });
  expect(layering.covered, 'parts of the popup are covered').toEqual([]);
  expect(layering.outsideDialog, 'the popup is outside the open dialog').toBe(
    false,
  );

  const pointing = await popup.evaluate((element) => {
    const surface = element.closest<HTMLElement>('[data-floating-popup]');
    const side = surface?.dataset.popupSide;
    // A sheet points at nothing; a hint or a menu of Editor.js's own is
    // placed by the same core, and checked where it is tested.
    if (!surface || !side || side === 'sheet') return [];
    const id = surface.dataset.floatingPopup!;
    const anchor = document.querySelector(
      `[data-popup-open="${CSS.escape(id)}"]`,
    );
    // Words or a caret: nothing to mark, and nothing to measure against.
    if (!anchor) return [];
    const arrow = surface.querySelector<HTMLElement>(
      ':scope > [data-popup-arrow]',
    );
    if (!arrow || getComputedStyle(arrow).visibility === 'hidden') return [];
    const at = anchor.getBoundingClientRect();
    const tip = arrow.getBoundingClientRect();
    const vertical = side === 'top' || side === 'bottom';
    const centre = vertical
      ? tip.left + tip.width / 2
      : tip.top + tip.height / 2;
    const problems: string[] = [];
    if (
      vertical
        ? centre < at.left || centre > at.right
        : centre < at.top || centre > at.bottom
    )
      problems.push(`the arrow at ${centre} points past its anchor`);
    const gap = {
      bottom: tip.top - at.bottom,
      top: at.top - tip.bottom,
      right: tip.left - at.right,
      left: at.left - tip.right,
    }[side as 'top' | 'right' | 'bottom' | 'left'];
    if (gap < -1 || gap > 8)
      problems.push(`the arrow's tip is ${gap}px from its anchor`);
    return problems;
  });
  expect(pointing, 'the popup does not point at its anchor').toEqual([]);

  const control = popup
    .locator('button, a[href], input, [role="option"]')
    .filter({ visible: true })
    .first();
  if (await control.count()) await control.click({ trial: true });
}

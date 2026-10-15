import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Whether a popup can be used where it opened, as a person would find it:
 * wholly on the screen, on top of everything at its centre and its four
 * inner corners, inside the open `<dialog>` when one is open — a modal is a
 * dialog in the top layer, and a popup left in the body opens beneath it —
 * and with its first control there to press.
 */
export async function expectPopupUsable(page: Page, popup: Locator) {
  await expect(popup).toBeVisible();
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
        const what = hit
          ? `${hit.tagName.toLowerCase()}${hit.className ? `.${String(hit.className).split(' ')[0]}` : ''}`
          : 'nothing';
        return `${name} under ${what}`;
      });
    const dialog = document.querySelector('dialog[open]');
    return { covered, outsideDialog: Boolean(dialog && !dialog.contains(element)) };
  });
  expect(layering.covered, 'parts of the popup are covered').toEqual([]);
  expect(layering.outsideDialog, 'the popup is outside the open dialog').toBe(
    false,
  );

  const control = popup
    .locator('button, a[href], input, [role="option"]')
    .filter({ visible: true })
    .first();
  if (await control.count()) await control.click({ trial: true });
}

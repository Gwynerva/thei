import type { Page } from '@playwright/test';

/**
 * The modal on top of the dialog. A modal replaced by the next step stays
 * beneath it, `aria-hidden`, until that one has faded in, so for a moment
 * the dialog holds both; a CSS locator must look in the top one alone.
 */
export function topModal(page: Page) {
  return page.locator(
    'dialog[open] > [data-modal-layer]:not([aria-hidden="true"])',
  );
}

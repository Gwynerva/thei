import type { Page } from '@playwright/test';
import { topModal } from './modal';

/**
 * The file editor goes one screen at a time: how to take the file, what that
 * way needs, and last the file's description. These are its controls, found
 * in the modal on top.
 */
export const uploadControls = (page: Page) => {
  const modal = topModal(page);
  return {
    /** «A new variant»: opens the settings of one. */
    newVariant: modal.locator('[data-upload-new]'),
    /** «A saved variant»: opens the list of the stored ones. */
    savedVariants: modal.locator('[data-upload-saved]'),
    /** «Another file»: back to the picker. */
    otherFile: modal.locator('[data-upload-other]'),
    /** The foot's one button: «Next», or making a video or an archive. */
    next: modal.locator('[data-upload-next]'),
    back: modal.locator('[data-upload-back]'),
    cancel: modal.locator('[data-upload-cancel]'),
    description: modal.locator('[data-file-description-input]'),
    done: modal.locator('[data-upload-done]'),
    skipDescription: modal.locator('[data-upload-skip-description]'),
  };
};

/** The last step left without a description, on purpose. */
export async function skipDescription(page: Page, timeout = 30_000) {
  await uploadControls(page).skipDescription.click({ timeout });
}

/** The last step with a description written. */
export async function describeFile(page: Page, text: string) {
  const controls = uploadControls(page);
  await controls.description.fill(text, { timeout: 30_000 });
  await controls.done.click();
}

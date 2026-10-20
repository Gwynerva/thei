import { expect, type APIRequestContext, type Page } from '@playwright/test';
import sharp from 'sharp';
import { buildUploadHeaders } from '../../../shared/api/asset-upload-headers';
import { createOriginalAssetSettings } from '../../../shared/asset-upload-settings';
import { topModal } from './modal';

/**
 * The file editor goes one screen at a time: how to take the file, what that
 * way needs, and last, for a file new to the library, its description. These
 * are its controls, found in the modal on top.
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
    /**
     * The foot's one button: «Next», making a video or an archive, or «Done»
     * for a file already stored.
     */
    next: modal.locator('[data-upload-next]'),
    back: modal.locator('[data-upload-back]'),
    cancel: modal.locator('[data-upload-cancel]'),
    description: modal.locator('[data-file-description-input]'),
    done: modal.locator('[data-upload-done]'),
    skipDescription: modal.locator('[data-upload-skip-description]'),
  };
};

/**
 * The last step left without a description, on purpose: chosen under the
 * field, which only lets «Done» go on.
 */
export async function skipDescription(page: Page, timeout = 30_000) {
  const controls = uploadControls(page);
  await controls.skipDescription.click({ timeout });
  await expect(controls.skipDescription).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await controls.done.click();
}

/** The last step with a description written. */
export async function describeFile(page: Page, text: string) {
  const controls = uploadControls(page);
  await controls.description.fill(text, { timeout: 30_000 });
  await controls.done.click();
}

/**
 * A file put in the library through the API, as the admin's uploads are:
 * its bytes as the body, what it is in the headers, kept whole.
 */
export async function uploadFile<T = { assetUuid: string; slug: string }>(
  api: APIRequestContext,
  extension: string,
  bytes: Uint8Array,
): Promise<T> {
  const response = await api.post('/api/admin/assets', {
    headers: buildUploadHeaders({
      settings: createOriginalAssetSettings(),
      extension,
    }),
    data: Buffer.from(bytes),
  });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as T;
}

/**
 * A picture of a colour of its own — a random one unless given — so each run
 * stores new bytes rather than finding the last run's file.
 */
export async function uploadPicture<T = { assetUuid: string; slug: string }>(
  api: APIRequestContext,
  {
    color,
    width = 64,
    height = 48,
  }: { color?: string; width?: number; height?: number } = {},
): Promise<{ asset: T; buffer: Buffer }> {
  const background = color ?? {
    r: Math.floor(Math.random() * 256),
    g: Math.floor(Math.random() * 256),
    b: Math.floor(Math.random() * 256),
  };
  const buffer = await sharp({
    create: { width, height, channels: 3, background },
  })
    .png()
    .toBuffer();
  return { asset: await uploadFile<T>(api, 'png', buffer), buffer };
}

/** A text file of these words. */
export function uploadText(api: APIRequestContext, words: string) {
  return uploadFile(api, 'txt', new TextEncoder().encode(words));
}

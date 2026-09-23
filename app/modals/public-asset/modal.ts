import type { PublicAssetDescriptor } from '#layers/thei/shared/api/public';

export const publicAssetModal = defineModal(
  'public-asset',
  () => import('./PublicAssetModal.vue'),
);

/**
 * What the file viewer is opened with: the file, and the files it belongs
 * with — the rest of a gallery, of a showcase, of a list of files — so the
 * viewer can step through them without being opened again.
 */
export type PublicAssetModalData = {
  items: PublicAssetDescriptor[];
  /** The file to show first; the first one when absent or not found. */
  startKey?: string;
};

export function openPublicAssets(
  items: PublicAssetDescriptor[],
  start?: PublicAssetDescriptor,
) {
  if (!items.length) return;
  void openModal(publicAssetModal, { items, startKey: start?.key });
}

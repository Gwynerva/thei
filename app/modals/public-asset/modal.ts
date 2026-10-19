import type { PublicAssetDescriptor } from '#layers/thei/shared/api/public';
import { assetFormatLabel } from '#layers/thei/app/composables/asset-library-labels';

export const publicAssetModal = defineModal(
  'public-asset',
  () => import('./PublicAssetModal.vue'),
  {
    kind: 'file',
    title: (data) => {
      const start = data.items[data.start ?? 0] ?? data.items[0];
      if (!start) return phrase.value.asset;
      return (
        publicText(start.title) ||
        assetFormatLabel(start.extension, start.archivedOriginal)
      );
    },
  },
);

/**
 * What the file viewer is opened with: the file, and the files it belongs
 * with — the rest of a gallery, of a showcase, of a list of files — so the
 * viewer can step through them without being opened again.
 */
export type PublicAssetModalData = {
  items: PublicAssetDescriptor[];
  /**
   * Where the file to show first stands; the first one when absent. A place
   * rather than a key, since one file may stand twice in a gallery.
   */
  start?: number;
};

export function openPublicAssets(
  items: PublicAssetDescriptor[],
  start?: PublicAssetDescriptor,
) {
  if (!items.length) return;
  const index = start ? items.indexOf(start) : -1;
  void openModal(publicAssetModal, {
    items,
    start: index < 0 ? undefined : index,
  });
}

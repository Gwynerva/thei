import type { PublicAssetDescriptor } from '#layers/thei/shared/api/public';
import type { LandingPlace } from '#layers/thei/shared/landing';
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
  /**
   * Where each file stands on the page (`shared/landing.ts`), so the
   * window's address names it open there; one with none has no address.
   */
  places?: (LandingPlace | undefined)[];
};

export function openPublicAssets(
  items: PublicAssetDescriptor[],
  start?: PublicAssetDescriptor,
  places?: (LandingPlace | undefined)[],
) {
  if (!items.length) return;
  const index = start ? items.indexOf(start) : -1;
  void openModal(publicAssetModal, {
    items,
    start: index < 0 ? undefined : index,
    ...(places ? { places } : {}),
  });
}

import type { ShallowRef } from 'vue';
import type { AssetLibraryAvailability } from '#layers/thei/shared/asset-library';
import type { AssetUploadLimitPolicy } from '#layers/thei/shared/asset-upload-limits';

/**
 * What the library holds that a field could take: unknown while it is asked
 * (`undefined`), `null` when it could not be told.
 */
export type ReuseAvailability = Readonly<
  ShallowRef<AssetLibraryAvailability | null | undefined>
>;

/**
 * Asks the library what it could offer, once for a whole flow: a wizard starts
 * this along with the picker's code, so the picker opens knowing whether
 * "Reuse" is worth showing, and keeps knowing it each time it comes back.
 */
export function fetchReuseAvailability(options: {
  acceptedExtensions?: string[] | '*';
  sizeLimitPolicy?: AssetUploadLimitPolicy;
  imageOnly?: boolean;
}): ReuseAvailability {
  const availability = shallowRef<AssetLibraryAvailability | null>();
  $fetch<AssetLibraryAvailability>('/api/admin/assets/availability', {
    query: {
      acceptedExtensions:
        options.acceptedExtensions === '*'
          ? '*'
          : options.acceptedExtensions
            ? JSON.stringify(options.acceptedExtensions)
            : undefined,
      sizeLimitPolicy: options.sizeLimitPolicy,
      imageOnly: options.imageOnly || undefined,
    },
  }).then(
    (value) => (availability.value = value),
    () => (availability.value = null),
  );
  return availability;
}

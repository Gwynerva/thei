import { afterEach, describe, expect, it } from 'vitest';
import { AssetType } from '../../../shared/asset';
import { DEFAULT_PROJECT_ACTION } from '../../../shared/project-action';
import { validateProjectAssets } from '../../../server/thei/projects/validate-assets';
import { validateEventAssets } from '../../../server/thei/events/validate-assets';

afterEach(() => delete (globalThis as any).THEI_SERVER);

describe.each([
  ['project', validateProjectAssets],
  ['event', validateEventAssets],
] as const)('%s action file validation', (_kind, validate) => {
  it.each([AssetType.Other, AssetType.Audio, AssetType.Image, AssetType.Video])(
    'accepts %s files with the auto color',
    async (type) => {
      (globalThis as any).THEI_SERVER = {
        assets: { findByUuid: async () => ({ type, size: 20, meta: null }) },
      };
      expect(
        await validate({
          action: {
            ...DEFAULT_PROJECT_ACTION,
            enabled: true,
            text: 'Download',
            target: 'file',
            fileAssetUuid: 'file',
            backgroundMode: 'auto-gradient',
          },
        } as any),
      ).toBeUndefined();
    },
  );

  it('rejects files over the size limit', async () => {
    (globalThis as any).THEI_SERVER = {
      assets: {
        findByUuid: async () => ({
          type: AssetType.Other,
          size: Number.MAX_SAFE_INTEGER,
          meta: null,
        }),
      },
    };
    expect(
      await validate({
        action: {
          ...DEFAULT_PROJECT_ACTION,
          enabled: true,
          text: 'Download',
          target: 'file',
          fileAssetUuid: 'file',
        },
      } as any),
    ).toMatch(/size limit|maximum allowed size/);
  });
});

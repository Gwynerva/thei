import { afterEach, describe, expect, it } from 'vitest';
import { AssetType } from '../../../shared/asset';
import { DEFAULT_PROJECT_ACTION } from '../../../shared/project-action';
import { validateProjectAssets } from '../../../server/thei/projects/validate-assets';
import { validateEventAssets } from '../../../server/thei/events/validate-assets';

afterEach(() => delete (globalThis as any).THEI_SERVER);

describe.each([
  ['project', validateProjectAssets],
  ['event', validateEventAssets],
] as const)('%s action file color validation', (_kind, validate) => {
  it.each([AssetType.Other, AssetType.Audio])(
    'rejects color from %s files',
    async (type) => {
      (globalThis as any).THEI_SERVER = {
        assets: { findByUuid: async () => ({ type, size: 20, meta: null }) },
      };
      const data = {
        action: {
          ...DEFAULT_PROJECT_ACTION,
          target: 'file',
          fileAssetUuid: 'file',
          backgroundMode: 'file-gradient',
        },
      } as any;
      expect(await validate(data)).toMatch(/image or video/);
      data.action.backgroundMode = 'standard-gradient';
      expect(await validate(data)).toBeUndefined();
    },
  );

  it.each([AssetType.Image, AssetType.Video])(
    'accepts color from %s files',
    async (type) => {
      (globalThis as any).THEI_SERVER = {
        assets: {
          findByUuid: async () => ({ type, size: 20, meta: { accentHue: 0 } }),
        },
      };
      expect(
        await validate({
          action: {
            ...DEFAULT_PROJECT_ACTION,
            target: 'file',
            fileAssetUuid: 'file',
            backgroundMode: 'file-gradient',
          },
        } as any),
      ).toBeUndefined();
    },
  );
});

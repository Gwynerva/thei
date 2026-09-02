import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetType } from '../../shared/asset';
import { DEFAULT_PROJECT_ACTION } from '../../shared/project-action';
import { buildPublicAction } from '../../server/thei/public/entities';
import { findExternalLink } from '../../server/thei/external-links/repository';

vi.mock('../../server/thei/external-links/repository', () => ({
  findExternalLink: vi.fn(),
}));

beforeEach(() => {
  (globalThis as any).THEI_SERVER = {
    assets: { usages: { findByContainer: async () => [] } },
  };
  vi.mocked(findExternalLink).mockReset();
});
afterEach(() => delete (globalThis as any).THEI_SERVER);

const usage = (
  role: string,
  type = AssetType.Image,
  accentHue: number | undefined = 0,
) => ({
  role,
  asset: {
    assetUuid: role,
    slug: role,
    extension:
      type === AssetType.Video
        ? 'mp4'
        : type === AssetType.Other
          ? 'txt'
          : 'webp',
    type,
    meta: { accentHue },
  },
});

describe.each(['event', 'project'])('public %s action', (kind) => {
  function entity(patch: Record<string, unknown> = {}) {
    return {
      [kind === 'project' ? 'projectUuid' : 'eventUuid']: 'entity',
      humanReadableSlug: 'example',
      publicId: 'Example',
      action: {
        ...DEFAULT_PROJECT_ACTION,
        enabled: true,
        text: 'Open',
        externalUrl: 'https://example.com/',
        ...patch,
      },
    } as any;
  }

  it.each([AssetType.Image, AssetType.Video])(
    'preserves the %s file color with public URLs',
    async (type) => {
      const result = await buildPublicAction(
        entity({ target: 'file', backgroundMode: 'file-gradient' }),
        [usage('action-file', type)] as any,
        false,
      );
      expect(result?.fileMedia).toMatchObject({ kind: type, accentHue: 0 });
      expect(result?.fileMedia?.src).toBe(result?.href);
      expect(result?.fileMedia?.src).not.toContain('/api/admin/');
    },
  );

  it('serves a non-media download without constructing a media descriptor', async () => {
    const result = await buildPublicAction(
      entity({ target: 'file' }),
      [usage('action-file', AssetType.Other)] as any,
      false,
    );
    expect(result?.href).toMatch(/action-file\.txt$/);
    expect(result?.fileMedia).toBeUndefined();
  });

  it.each(['fallback', 'favicon'])(
    'passes link color independently of %s icon mode',
    async (iconMode) => {
      const faviconMedia = {
        kind: 'image' as const,
        src: '/media/favicon.webp',
        previewSrc: '/media/favicon.webp',
        accentHue: 210,
      };
      vi.mocked(findExternalLink).mockResolvedValue({
        url: 'https://example.com/',
        faviconMedia,
        touchedAt: 0,
      });
      const result = await buildPublicAction(
        entity({ iconMode, backgroundMode: 'link-gradient' }),
        [],
        false,
      );
      expect(result).toMatchObject({
        faviconMedia,
        useFavicon: iconMode === 'favicon',
      });
    },
  );

  it('preserves icon color and background media', async () => {
    const result = await buildPublicAction(
      entity({ iconMode: 'asset', backgroundMode: 'icon-gradient' }),
      [usage('action-icon'), usage('action-background')] as any,
      false,
    );
    expect(result?.iconMedia?.accentHue).toBe(0);
    expect(result?.backgroundMedia?.accentHue).toBe(0);
  });

  it('does not expose private actions or query their sources for visitors', async () => {
    expect(
      await buildPublicAction(entity({ isPrivate: true }), [], false),
    ).toBeUndefined();
    expect(findExternalLink).not.toHaveBeenCalled();
    expect(
      await buildPublicAction(entity({ isPrivate: true }), [], true),
    ).toBeDefined();
  });
});

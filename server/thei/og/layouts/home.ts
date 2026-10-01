import { frame, label, place } from '../blocks';
import { OG_HEIGHT, ROW, SAFE, TYPE } from '../geometry';
import { ogIcon, OG_META_ICONS } from '../icons';
import { pictureBox } from '../picture';
import { el } from '../render';
import { textColumn, type OgLayout } from './common';

const AVATAR = 340;
const RING = 10;

/**
 * H: the site as the person it belongs to — the avatar in a ring of its
 * colour, the name, the slogan, and what the archive holds. The address,
 * when the site has one, is the signature: the name is already the title.
 */
export const home: OgLayout = async (input) => {
  const { content, palette, picture } = input;
  const inner = AVATAR - RING * 2 - 12;
  const avatar = picture
    ? await pictureBox(picture, {
        width: inner,
        height: inner,
        field: palette.surface,
        backdrop: 'field',
        inset: 0,
        crop: 'loose',
        radius: inner / 2,
      })
    : el(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: inner,
            height: inner,
            borderRadius: inner / 2,
            background: palette.plate.background,
          },
        },
        ogIcon(OG_META_ICONS.person, palette.plate.text, inner * 0.5),
      );
  const top = (OG_HEIGHT - AVATAR) / 2;
  const left = SAFE.left + AVATAR + 64;
  const domain = content.site.domain;
  const text = await textColumn(
    input,
    {
      left,
      top: SAFE.top,
      width: SAFE.right - left,
      height: domain ? SAFE.height - ROW.signature - 28 : SAFE.height,
    },
    { sizes: [84, 76, 68, 60, 52, 46, 40], maxLines: 2, signature: false },
  );
  return {
    node: frame(
      palette,
      { x: SAFE.left + AVATAR / 2, y: OG_HEIGHT / 2 },
      el(
        'div',
        {
          key: 'art',
          style: {
            ...place({ left: SAFE.left, top, width: AVATAR, height: AVATAR }),
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: AVATAR / 2,
            background: palette.ring,
          },
        },
        el(
          'div',
          {
            style: {
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: AVATAR - RING * 2,
              height: AVATAR - RING * 2,
              borderRadius: (AVATAR - RING * 2) / 2,
              background: palette.stops[0],
            },
          },
          avatar,
        ),
      ),
      ...text.nodes,
      ...(domain
        ? [
            el(
              'div',
              {
                key: 'essential:signature',
                style: {
                  ...place({
                    left,
                    top: SAFE.bottom - ROW.signature,
                    width: SAFE.right - left,
                    height: ROW.signature,
                  }),
                  alignItems: 'center',
                  gap: 12,
                  color: palette.muted,
                  fontSize: TYPE.signature,
                  whiteSpace: 'nowrap',
                },
              },
              ogIcon(OG_META_ICONS.domain, palette.accent, 30),
              label(domain),
            ),
          ]
        : []),
    ),
    stacks: { text: text.fitted },
  };
};

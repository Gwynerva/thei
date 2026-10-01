import { fillsBox, pictureDataUri, type OgArtworkAnalysis } from './artwork';
import type { OgPicture } from './model';
import { el, type OgNode } from './render';

export interface OgShownPicture {
  picture: OgPicture;
  analysis: OgArtworkAnalysis;
}

export interface OgPictureBoxOptions {
  width: number;
  height: number;
  /** Colour behind the picture: shows through transparency and padding. */
  field: string;
  radius?: number;
  /**
   * How a picture that cannot fill the box is shown whole: on its own
   * picture, blurred to fill the box, or on the plain field.
   */
  backdrop?: 'blur' | 'field';
  /** Room left around a picture shown whole, as a share of the box. */
  inset?: number;
  /**
   * How much of a photograph may be cut away to fill the box: a little, as
   * a card shows its subject, or as much as it takes, as a collage does.
   * An icon is never cropped either way.
   */
  crop?: 'strict' | 'loose';
  /** Position, rotation, border, shadow: whatever the layout adds. */
  style?: Record<string, unknown>;
  key?: string;
}

/**
 * A picture in a box of the layout's choosing.
 *
 * A photograph close enough to the box's shape fills it; anything else — an
 * icon, a logo, a panorama in a square — is shown whole, centred, with room
 * around it, on a blurred copy of itself or on a field of its colour. A
 * square icon in a square box fills it: that is the one crop that loses
 * nothing.
 */
export async function pictureBox(
  shown: OgShownPicture,
  options: OgPictureBoxOptions,
): Promise<OgNode> {
  const { width, height } = options;
  const alpha = shown.analysis.transparent > 0;
  const fills =
    options.crop === 'loose'
      ? !shown.analysis.iconLike || fillsBox(shown.analysis, width, height)
      : fillsBox(shown.analysis, width, height);
  // Satori does not clip a picture to its box's rounded corners, so every
  // picture filling the box is rounded itself.
  const rounded = options.radius ? { borderRadius: options.radius } : {};
  const layers: OgNode[] = [];

  if (fills) {
    const src = await pictureDataUri(shown.picture, width, height, {
      fit: 'cover',
      alpha,
    });
    if (src) layers.push(el('img', { src, width, height, style: rounded }));
  } else {
    if (options.backdrop === 'blur' && !alpha) {
      const backdrop = await pictureDataUri(
        shown.picture,
        width / 4,
        height / 4,
        { fit: 'cover', blur: 6 },
      );
      if (backdrop)
        layers.push(
          el('img', {
            src: backdrop,
            width,
            height,
            style: { position: 'absolute', left: 0, top: 0, ...rounded },
          }),
          el('div', {
            style: {
              display: 'flex',
              position: 'absolute',
              left: 0,
              top: 0,
              width,
              height,
              background: options.field,
              opacity: 0.35,
              ...rounded,
            },
          }),
        );
    }
    const inset = options.inset ?? 0.12;
    const innerWidth = Math.round(width * (1 - inset * 2));
    const innerHeight = Math.round(height * (1 - inset * 2));
    // The picture is scaled into the inner box keeping its shape; the data
    // URI is made at the size it ends up, so nothing is scaled twice.
    const scale = Math.min(
      innerWidth / shown.analysis.width,
      innerHeight / shown.analysis.height,
    );
    const drawnWidth = Math.max(1, Math.round(shown.analysis.width * scale));
    const drawnHeight = Math.max(1, Math.round(shown.analysis.height * scale));
    const src = await pictureDataUri(shown.picture, drawnWidth, drawnHeight, {
      fit: 'contain',
    });
    if (src)
      layers.push(
        el('img', {
          src,
          width: drawnWidth,
          height: drawnHeight,
          style: {
            position: 'absolute',
            left: Math.round((width - drawnWidth) / 2),
            top: Math.round((height - drawnHeight) / 2),
            // An opaque picture shown whole gets rounded corners of its own,
            // like the tiles the site shows it in.
            ...(alpha
              ? {}
              : {
                  borderRadius: Math.round(
                    Math.min(drawnWidth, drawnHeight) * 0.08,
                  ),
                }),
          },
        }),
      );
  }

  return el(
    'div',
    {
      key: options.key,
      style: {
        display: 'flex',
        position: 'relative',
        width,
        height,
        overflow: 'hidden',
        background: options.field,
        ...(options.radius ? { borderRadius: options.radius } : {}),
        ...options.style,
      },
    },
    ...layers,
  );
}

/**
 * An icon as the site shows one: the picture itself, rounded, with nothing
 * around it — no plate, no frame, and a see-through one stays see-through.
 * A square icon fills its square, any other shape fits inside it.
 *
 * An uploaded icon is never drawn larger than twice its own pixels, where a
 * small file starts to blur: it is drawn smaller, centred in its square,
 * instead. The site's drawn icons are vectors and take any size.
 */
export async function iconImage(
  shown: OgShownPicture,
  size: number,
  options: { shadow?: boolean; key?: string } = {},
): Promise<OgNode | undefined> {
  const { analysis, picture } = shown;
  const longSide = Math.max(analysis.width, analysis.height);
  const box = Math.min(
    size,
    picture.type === 'generated' ? size : longSide * 2,
  );
  const width = Math.max(1, Math.round((analysis.width / longSide) * box));
  const height = Math.max(1, Math.round((analysis.height / longSide) * box));
  const alpha = analysis.transparent > 0;
  const src = await pictureDataUri(picture, width, height, {
    fit: 'contain',
    alpha,
  });
  if (!src) return undefined;
  const radius = alpha ? 0 : Math.round(Math.min(width, height) * 0.22);
  return el(
    'div',
    {
      key: options.key,
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        flexShrink: 0,
      },
    },
    el('img', {
      src,
      width,
      height,
      style: {
        borderRadius: radius,
        // A shadow follows the box, so only an opaque icon casts one.
        ...(options.shadow && !alpha
          ? { boxShadow: '0 24px 60px rgba(0, 0, 0, 0.32)' }
          : {}),
      },
    }),
  );
}

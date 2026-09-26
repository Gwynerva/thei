import { encode } from 'uqr';

/** A QR code as a picture: one to show, the same bytes to copy. */
export interface QrImage {
  src: string;
  blob: Blob;
}

/** Pixels per module: enough to stay sharp wherever the picture is pasted. */
const MODULE_PX = 10;
/**
 * The blank margin a reader needs around the code, in modules. It is part of
 * the picture, so a copy pasted onto a dark chat still scans.
 */
const QUIET_ZONE = 4;

/**
 * Draws `text` as a PNG, in `ink` on white. A picture rather than markup, so
 * the browser offers to copy or save it like any other image.
 */
export async function renderQrImage(
  text: string,
  ink: string,
): Promise<QrImage> {
  const { data, size } = encode(text, { ecc: 'M', border: QUIET_ZONE });
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size * MODULE_PX;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is not available');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = ink;
  data.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark)
        context.fillRect(x * MODULE_PX, y * MODULE_PX, MODULE_PX, MODULE_PX);
    }),
  );
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (result) =>
        result ? resolve(result) : reject(new Error('QR code not drawn')),
      'image/png',
    ),
  );
  return { src: canvas.toDataURL('image/png'), blob };
}

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32 } from 'node:zlib';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import sharp from 'sharp';
import { AssetType } from '../../../shared/asset';
import { stripAssetMetadata } from '../../../server/thei/assets/strip-metadata';

let directory = '';
const outputs: string[] = [];

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'thei-strip-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
  await Promise.all(outputs.splice(0).map((path) => rm(path, { force: true })));
});

async function write(name: string, bytes: Buffer) {
  const path = join(directory, name);
  await writeFile(path, bytes);
  return path;
}

async function strip(path: string, extension: string, type = AssetType.Image) {
  const output = await stripAssetMetadata(path, extension, type);
  if (output) outputs.push(output);
  return output;
}

function pixels(input: Buffer | string) {
  return sharp(input).raw().toBuffer();
}

const image = () =>
  sharp({
    create: {
      width: 8,
      height: 4,
      channels: 3,
      background: { r: 200, g: 40, b: 90 },
    },
  });

describe('stripAssetMetadata', () => {
  it('removes JPEG EXIF, XMP and appended data but keeps orientation and pixels', async () => {
    const tagged = await image()
      .jpeg()
      .withMetadata({ orientation: 6 })
      .withExif({
        IFD0: { Artist: 'Secret Person' },
        IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '55/1 45/1 0/1' },
      })
      .withXmp('<x:xmpmeta xmlns:x="adobe:ns:meta/">Secret XMP</x:xmpmeta>')
      .toBuffer();
    const source = await write(
      'photo.jpg',
      Buffer.concat([tagged, Buffer.from('trailing motion photo')]),
    );

    const output = await strip(source, 'jpg');
    expect(output).toBeDefined();
    const cleaned = await readFile(output!);
    const metadata = await sharp(cleaned).metadata();

    expect(metadata.orientation).toBe(6);
    expect(metadata.xmp).toBeUndefined();
    expect(cleaned.includes('Secret')).toBe(false);
    expect(cleaned.includes('trailing')).toBe(false);
    expect(cleaned.subarray(-2)).toEqual(Buffer.from([0xff, 0xd9]));
    expect(await pixels(cleaned)).toEqual(await pixels(tagged));
  });

  it('leaves a JPEG without metadata untouched', async () => {
    const plain = await image().jpeg().toBuffer();
    const source = await write('plain.jpg', plain);
    expect(await strip(source, 'jpeg')).toBeUndefined();
  });

  it('removes PNG text chunks and keeps the image data', async () => {
    const plain = await image().png().toBuffer();
    const chunk = pngChunk('tEXt', Buffer.from('Author\0Secret Person'));
    const tagged = Buffer.concat([
      plain.subarray(0, 33),
      chunk,
      plain.subarray(33),
    ]);
    const source = await write('image.png', tagged);

    const output = await strip(source, 'png');
    expect(output).toBeDefined();
    const cleaned = await readFile(output!);
    expect(cleaned).toEqual(plain);
    expect(await strip(await write('plain.png', plain), 'png')).toBeUndefined();
  });

  it('removes WebP EXIF and XMP chunks and clears their flags', async () => {
    const tagged = await image()
      .webp({ lossless: true })
      .withExif({ IFD0: { Artist: 'Secret Person' } })
      .withXmp('<x:xmpmeta xmlns:x="adobe:ns:meta/">Secret XMP</x:xmpmeta>')
      .toBuffer();
    const source = await write('image.webp', tagged);

    const output = await strip(source, 'webp');
    expect(output).toBeDefined();
    const cleaned = await readFile(output!);
    const metadata = await sharp(cleaned).metadata();

    expect(cleaned.includes('Secret')).toBe(false);
    expect(metadata.exif).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
    expect(cleaned.readUInt32LE(4)).toBe(cleaned.length - 8);
    expect(await pixels(cleaned)).toEqual(await pixels(tagged));
  });

  it('removes GIF comments', async () => {
    const plain = await image().gif().toBuffer();
    const comment = Buffer.concat([
      Buffer.from([0x21, 0xfe, 13]),
      Buffer.from('Secret Person'),
      Buffer.from([0]),
    ]);
    const tagged = Buffer.concat([
      plain.subarray(0, -1),
      comment,
      plain.subarray(-1),
    ]);
    const source = await write('image.gif', tagged);

    const output = await strip(source, 'gif');
    expect(output).toBeDefined();
    expect(await readFile(output!)).toEqual(plain);
  });

  it('does not touch formats it cannot clean losslessly', async () => {
    const source = await write('document.pdf', Buffer.from('%PDF-1.7'));
    expect(await strip(source, 'pdf', AssetType.Other)).toBeUndefined();
  });

  it('rejects a file that is not the image its extension claims', async () => {
    const source = await write('fake.jpg', Buffer.from('not a jpeg'));
    await expect(strip(source, 'jpg')).rejects.toThrow('Invalid image file');
  });

  it('remuxes video without container metadata', async () => {
    const tagged = join(directory, 'tagged.mp4');
    await ffmpeg([
      '-i',
      join(process.cwd(), 'tests/e2e/fixture/public/regression-video.mp4'),
      '-c',
      'copy',
      '-metadata',
      'title=Secret Title',
      '-metadata',
      'location=+55.7500+037.6167/',
      tagged,
    ]);
    expect((await readFile(tagged)).includes('Secret Title')).toBe(true);

    const output = await strip(tagged, 'mp4', AssetType.Video);
    const cleaned = await readFile(output!);
    expect(cleaned.includes('Secret Title')).toBe(false);
    expect(cleaned.includes('+55.7500')).toBe(false);
    expect(await sharp(await videoFrame(output!)).metadata()).toMatchObject({
      width: expect.any(Number),
    });
  }, 30_000);
});

function pngChunk(type: string, data: Buffer) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length, 0);
  header.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([header.subarray(4), data])), 0);
  return Buffer.concat([header, data, crc]);
}

async function ffmpeg(args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      ffmpegInstaller.path,
      ['-y', '-loglevel', 'error', ...args],
      { windowsHide: true, stdio: 'ignore' },
    );
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)),
    );
  });
}

async function videoFrame(path: string) {
  const frame = join(directory, 'frame.png');
  await ffmpeg(['-i', path, '-frames:v', '1', frame]);
  return frame;
}

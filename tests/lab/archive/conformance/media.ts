// The files of the conformance archive, made here rather than kept in git:
// pictures by sharp, recordings and videos by the ffmpeg Thei itself ships,
// a PDF, texts and a zip by hand. The same bytes on every run, so a seeded
// site finds them in its library instead of uploading them again.
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpeg from '@ffmpeg-installer/ffmpeg';
import { zipSync, strToU8 } from 'fflate';
import sharp from 'sharp';

/** Bumped when what this file makes changes, so old files are made again. */
const GENERATION = 2;

const video = fileURLToPath(
  new URL('../../../e2e/fixture/media/regression-video.mp4', import.meta.url),
);

/** A picture of its own colours, sizes and a label, as an SVG to render. */
function picture(
  width: number,
  height: number,
  hue: number,
  label: string,
): Buffer {
  const stripes = Array.from({ length: 12 }, (_, index) => {
    const y = (index * height) / 12;
    return `<rect y="${y}" width="${width}" height="${height / 24}" fill="hsl(${(hue + index * 9) % 360} 45% ${30 + index * 4}%)" opacity="0.55"/>`;
  }).join('');
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<rect width="${width}" height="${height}" fill="hsl(${hue} 50% 62%)"/>${stripes}` +
      `<circle cx="${width * 0.68}" cy="${height * 0.42}" r="${Math.min(width, height) * 0.22}" fill="hsl(${(hue + 180) % 360} 60% 85%)"/>` +
      `<text x="${width * 0.06}" y="${height * 0.9}" font-family="sans-serif" font-size="${Math.round(height / 12)}" fill="#1b1b1b">${label}</text></svg>`,
  );
}

/** One and a half seconds of a tone, 16-bit mono PCM. */
function wav(frequency: number): Buffer {
  const rate = 22_050;
  const samples = Math.round(rate * 1.5);
  const data = Buffer.alloc(samples * 2);
  for (let index = 0; index < samples; index++) {
    const fade = Math.min(1, index / 2000, (samples - index) / 2000);
    data.writeInt16LE(
      Math.round(
        Math.sin((2 * Math.PI * frequency * index) / rate) * 12_000 * fade,
      ),
      index * 2,
    );
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** A one-page PDF with a line of text, its offsets counted. */
function pdf(text: string): Buffer {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${44 + text.length} >>\nstream\nBT /F1 24 Tf 72 760 Td (${text}) Tj ET\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets)
    body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

function transcode(input: string, output: string, args: string[]) {
  execFileSync(
    ffmpeg.path,
    [
      '-y',
      '-loglevel',
      'error',
      '-i',
      input,
      ...args,
      '-map_metadata',
      '-1',
      '-fflags',
      '+bitexact',
      output,
    ],
    {
      stdio: ['ignore', 'ignore', 'pipe'],
    },
  );
}

/**
 * Makes every file of the conformance archive in `dir`, unless this
 * generation of them is there already. Returns `dir`.
 */
export async function makeConformanceMedia(dir: string): Promise<string> {
  const marker = join(dir, '.generation');
  if (existsSync(marker) && readFileSync(marker, 'utf8') === String(GENERATION))
    return dir;
  const work = `${dir}.tmp-${process.pid}`;
  mkdirSync(work, { recursive: true });
  const out = (name: string) => join(work, name);

  const pictures: [
    string,
    number,
    number,
    number,
    string,
    'jpeg' | 'png' | 'webp' | 'avif' | 'gif',
  ][] = [
    ['photo-a.jpg', 1600, 1067, 210, 'Лампа', 'jpeg'],
    ['photo-b.png', 2400, 800, 30, 'Мастерская', 'png'],
    ['photo-c.webp', 900, 1200, 120, 'Принтер', 'webp'],
    ['photo-d.avif', 1200, 1200, 290, 'Отлив', 'avif'],
    ['anim.gif', 480, 360, 50, 'Мигает', 'gif'],
    ['avatar-old.png', 512, 512, 160, 'М', 'png'],
    ['avatar.jpg', 512, 512, 340, 'М', 'jpeg'],
    ['icon-square.png', 256, 256, 80, 'Л', 'png'],
    ['banner-wide.jpg', 1920, 1080, 250, 'Мира', 'jpeg'],
  ];
  for (const [name, width, height, hue, label, format] of pictures)
    await sharp(picture(width, height, hue, label))
      [format]()
      .toFile(out(name));
  writeFileSync(
    out('drawing.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120"><rect x="20" y="20" width="70" height="80" rx="8" fill="none" stroke="#333" stroke-width="3"/><path d="M90 40 q30 0 30 25 t-30 25" fill="none" stroke="#333" stroke-width="3"/><circle cx="160" cy="60" r="30" fill="none" stroke="#333" stroke-width="3"/></svg>\n',
  );

  copyFileSync(video, out('clip.mp4'));
  transcode(video, out('clip-webm.webm'), [
    '-c:v',
    'libvpx',
    '-b:v',
    '200k',
    '-an',
  ]);
  transcode(video, out('clip-mov.mov'), ['-c:v', 'mpeg4', '-q:v', '5', '-an']);

  writeFileSync(out('tone-wav.wav'), wav(440));
  const tone = out('tone-source.wav');
  writeFileSync(tone, wav(523.25));
  transcode(tone, out('tone-mp3.mp3'), ['-c:a', 'libmp3lame', '-b:a', '64k']);
  transcode(tone, out('tone-ogg.ogg'), ['-c:a', 'libvorbis', '-q:a', '2']);
  transcode(tone, out('tone-flac.flac'), ['-c:a', 'flac']);
  transcode(tone, out('tone-m4a.m4a'), ['-c:a', 'aac', '-b:a', '64k']);
  rmSync(tone);

  writeFileSync(out('manual.pdf'), pdf('Lamp assembly: print on A4.'));
  writeFileSync(
    out('notes-txt.txt'),
    'Заметки к курсу.\nВторник — глазурь, четверг — обжиг.\n',
  );
  writeFileSync(
    out('budget.csv'),
    'статья;сумма\nпластик;1200\nпроводка;450\nлампочка;180\n',
  );
  writeFileSync(
    out('data-json.json'),
    `${JSON.stringify({ sensor: 'kiln', readings: [812, 940, 1003] }, null, 2)}\n`,
  );
  writeFileSync(
    out('sources.zip'),
    zipSync(
      {
        'lamp/model.txt': strToU8('solid moon\nendsolid\n'),
        'lamp/readme.txt': strToU8('Печатать с поддержками.\n'),
      },
      { mtime: new Date('2024-01-01T00:00:00Z') },
    ),
  );

  writeFileSync(join(work, '.generation'), String(GENERATION));
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  renameSync(work, dir);
  return dir;
}

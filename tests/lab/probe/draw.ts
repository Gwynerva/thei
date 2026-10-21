// The probe's pictures, drawn over a screenshot with sharp — never in the
// page, where a mark would sit under the top layer and be measured itself.
//
// - `drawMarked`: the whole screenshot with a numbered frame per finding,
//   coloured by rule, and the pointer's way: a faint ring where it was, a
//   ring where it went, a dashed line between.
// - `drawCrops`: one close-up per finding, its boxes and 24 px around them,
//   enlarged with `nearest` so pixels stay pixels, with guide lines and the
//   difference measured for near-miss and uneven-gap.
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import type { Box, ProbeFinding, ProbeResult, ProbeRule } from '../types';

export const RULE_COLOURS: Record<ProbeRule, string> = {
  overlap: '#ff3b30',
  'covered-control': '#ff2d92',
  'clipped-text': '#ff9500',
  'page-overflow': '#e8004c',
  'leaves-viewport': '#bf5af2',
  'near-miss': '#00c7be',
  'uneven-gap': '#ffd60a',
  'small-target': '#0a84ff',
  'broken-image': '#b4002d',
};
const POINTER = '#30d158';
/** What the person only looked at. */
const LOOK = '#ffb000';

export interface PointerPath {
  from: [number, number];
  to: [number, number];
}

type Shot = string | Buffer;
type Drawn = Pick<ProbeResult, 'viewport' | 'findings'>;

interface Frame {
  /** CSS px of the viewport at the image's top left. */
  x: number;
  y: number;
  /** Image px per CSS px. */
  scale: number;
}

const escape = (text: string) =>
  text.replace(
    /[<>&"]/g,
    (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[ch]!,
  );

function frameRect(box: Box, frame: Frame, colour: string, width: number) {
  const x = (box.x - frame.x) * frame.scale;
  const y = (box.y - frame.y) * frame.scale;
  const w = Math.max(1, box.width * frame.scale);
  const h = Math.max(1, box.height * frame.scale);
  return (
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${colour}" fill-opacity="0.08" stroke="#000" stroke-opacity="0.55" stroke-width="${width + 2}"/>` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${colour}" stroke-width="${width}"/>`
  );
}

function label(
  text: string,
  x: number,
  y: number,
  colour: string,
  size: number,
  limits: { width: number; height: number },
) {
  const w = Math.ceil(size * 0.62 * text.length + size * 0.8);
  const h = Math.ceil(size * 1.35);
  const left = Math.min(Math.max(0, x), Math.max(0, limits.width - w));
  const top = Math.min(Math.max(0, y), Math.max(0, limits.height - h));
  return (
    `<rect x="${left}" y="${top}" width="${w}" height="${h}" rx="${size * 0.3}" fill="${colour}" stroke="#000" stroke-opacity="0.6"/>` +
    `<text x="${left + w / 2}" y="${top + h * 0.72}" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${size}" text-anchor="middle" fill="#000">${escape(text)}</text>`
  );
}

async function scaled(shot: Shot, viewportWidth: number, scale?: number) {
  const image = sharp(shot);
  const meta = await image.metadata();
  const own = (meta.width ?? viewportWidth) / viewportWidth;
  if (!scale || Math.abs(scale - own) < 0.01)
    return { image, scale: own, width: meta.width!, height: meta.height! };
  const width = Math.round(viewportWidth * scale);
  const height = Math.round((meta.height! / own) * scale);
  const buffer = await image
    .resize(width, height, { kernel: scale < own ? 'lanczos3' : 'nearest' })
    .png()
    .toBuffer();
  return { image: sharp(buffer), scale, width, height };
}

/**
 * The screenshot with every finding framed and numbered (1 is the first of
 * `findings`), and the pointer's way when given. `scale` is image px per CSS
 * px — 1 for a phone shot a reviewer reads whole; the shot's own by default.
 * `look` is something the person only looked at, framed in dashed amber.
 * `origin` is where the viewport stands in a full-page shot.
 */
export async function drawMarked(input: {
  shot: Shot;
  result: Drawn;
  out: string;
  pointer?: PointerPath;
  look?: Box;
  scale?: number;
  origin?: { x: number; y: number };
}): Promise<string> {
  const { image, scale, width, height } = await scaled(
    input.shot,
    input.result.viewport.width,
    input.scale,
  );
  const frame: Frame = {
    x: -(input.origin?.x ?? 0),
    y: -(input.origin?.y ?? 0),
    scale,
  };
  const stroke = Math.max(2, Math.round(scale * 1.5));
  const size = Math.max(12, Math.round(12 * scale));
  const parts: string[] = [];
  input.result.findings.forEach((finding, index) => {
    const colour = RULE_COLOURS[finding.rule];
    for (const box of finding.boxes)
      parts.push(frameRect(box, frame, colour, stroke));
    const first = finding.boxes[0];
    if (first)
      parts.push(
        label(
          String(index + 1),
          (first.x - frame.x) * scale - stroke,
          (first.y - frame.y) * scale - size * 1.35 - stroke,
          colour,
          size,
          { width, height },
        ),
      );
  });
  if (input.look) {
    const pad = 4;
    const x = (input.look.x - frame.x - pad) * scale;
    const y = (input.look.y - frame.y - pad) * scale;
    const w = (input.look.width + pad * 2) * scale;
    const h = (input.look.height + pad * 2) * scale;
    const dash = `${8 * scale} ${5 * scale}`;
    parts.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${4 * scale}" fill="none" stroke="#000" stroke-opacity="0.55" stroke-width="${stroke + 2}" stroke-dasharray="${dash}"/>`,
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${4 * scale}" fill="none" stroke="${LOOK}" stroke-width="${stroke}" stroke-dasharray="${dash}"/>`,
    );
  }
  if (input.pointer) {
    const [fx, fy] = input.pointer.from.map(
      (v, i) => (v - (i ? frame.y : frame.x)) * scale,
    ) as [number, number];
    const [tx, ty] = input.pointer.to.map(
      (v, i) => (v - (i ? frame.y : frame.x)) * scale,
    ) as [number, number];
    const ring = 11 * scale;
    parts.push(
      `<line x1="${fx}" y1="${fy}" x2="${tx}" y2="${ty}" stroke="#000" stroke-opacity="0.5" stroke-width="${stroke + 2}" stroke-dasharray="${6 * scale} ${4 * scale}"/>`,
      `<line x1="${fx}" y1="${fy}" x2="${tx}" y2="${ty}" stroke="${POINTER}" stroke-width="${stroke}" stroke-dasharray="${6 * scale} ${4 * scale}"/>`,
      `<circle cx="${fx}" cy="${fy}" r="${ring * 0.8}" fill="none" stroke="${POINTER}" stroke-opacity="0.45" stroke-width="${stroke}"/>`,
      `<circle cx="${tx}" cy="${ty}" r="${ring}" fill="none" stroke="#000" stroke-opacity="0.6" stroke-width="${stroke + 2}"/>`,
      `<circle cx="${tx}" cy="${ty}" r="${ring}" fill="${POINTER}" fill-opacity="0.15" stroke="${POINTER}" stroke-width="${stroke + 1}"/>`,
    );
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${parts.join('')}</svg>`;
  await mkdir(dirname(input.out), { recursive: true });
  await image
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toFile(input.out);
  return input.out;
}

function guides(
  finding: ProbeFinding,
  frame: Frame,
  crop: { width: number; height: number },
  size: number,
  stroke: number,
) {
  const m = finding.measure;
  const colour = RULE_COLOURS[finding.rule];
  const parts: string[] = [];
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#000" stroke-opacity="0.6" stroke-width="${stroke + 2}"/>` +
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${colour}" stroke-width="${stroke}" stroke-dasharray="${stroke * 6} ${stroke * 3}"/>`;
  const at = (v: number, axis: 'x' | 'y') => (v - frame[axis]) * frame.scale;
  let delta: number | undefined;
  if (finding.rule === 'near-miss') {
    delta = m.deltaPx;
    if (m.lineX1 !== undefined && m.lineX2 !== undefined)
      for (const x of [m.lineX1, m.lineX2])
        parts.push(line(at(x, 'x'), 0, at(x, 'x'), crop.height));
    if (m.lineY1 !== undefined && m.lineY2 !== undefined)
      for (const y of [m.lineY1, m.lineY2])
        parts.push(line(0, at(y, 'y'), crop.width, at(y, 'y')));
  }
  if (
    finding.rule === 'uneven-gap' &&
    m.from !== undefined &&
    m.to !== undefined
  ) {
    delta = m.deltaPx;
    const vertical = m.vertical === 1;
    const [a, b] = [
      at(m.from, vertical ? 'y' : 'x'),
      at(m.to, vertical ? 'y' : 'x'),
    ];
    parts.push(
      vertical
        ? `<rect x="0" y="${a}" width="${crop.width}" height="${Math.max(1, b - a)}" fill="${colour}" fill-opacity="0.3"/>`
        : `<rect x="${a}" y="0" width="${Math.max(1, b - a)}" height="${crop.height}" fill="${colour}" fill-opacity="0.3"/>`,
      vertical
        ? line(0, a, crop.width, a) + line(0, b, crop.width, b)
        : line(a, 0, a, crop.height) + line(b, 0, b, crop.height),
    );
  }
  if (delta !== undefined) {
    const words =
      finding.rule === 'uneven-gap'
        ? `Δ ${delta} px (${m.gapPx} vs ${m.modePx})`
        : `Δ ${delta} px`;
    parts.push(
      label(words, 4, crop.height - size * 1.35 - 4, colour, size, crop),
    );
  }
  return parts.join('');
}

/**
 * One close-up per finding, `NN-<rule>.png` in `dir`. `factor` enlarges the
 * screenshot's own pixels — 3 by default, less when the close-up's long
 * side would pass 1600 px.
 */
export async function drawCrops(input: {
  shot: Shot;
  result: Drawn;
  dir: string;
  factor?: number;
  margin?: number;
  origin?: { x: number; y: number };
}): Promise<string[]> {
  const source = sharp(input.shot);
  const meta = await source.metadata();
  const imageWidth = meta.width!;
  const imageHeight = meta.height!;
  const own = imageWidth / input.result.viewport.width;
  const margin = input.margin ?? 24;
  const ox = input.origin?.x ?? 0;
  const oy = input.origin?.y ?? 0;
  await mkdir(input.dir, { recursive: true });
  const written: string[] = [];
  for (const [index, finding] of input.result.findings.entries()) {
    if (!finding.boxes.length) continue;
    const x1 = Math.min(...finding.boxes.map((b) => b.x)) - margin + ox;
    const y1 = Math.min(...finding.boxes.map((b) => b.y)) - margin + oy;
    const x2 =
      Math.max(...finding.boxes.map((b) => b.x + b.width)) + margin + ox;
    const y2 =
      Math.max(...finding.boxes.map((b) => b.y + b.height)) + margin + oy;
    const left = Math.max(0, Math.floor(x1 * own));
    const top = Math.max(0, Math.floor(y1 * own));
    const right = Math.min(imageWidth, Math.ceil(x2 * own));
    const bottom = Math.min(imageHeight, Math.ceil(y2 * own));
    if (right - left < 1 || bottom - top < 1) continue;
    const long = Math.max(right - left, bottom - top);
    const factor = Math.max(
      1,
      Math.min(input.factor ?? 3, Math.floor(1600 / long)),
    );
    const width = (right - left) * factor;
    const height = (bottom - top) * factor;
    const frame: Frame = {
      x: left / own - ox,
      y: top / own - oy,
      scale: own * factor,
    };
    const size = Math.max(14, Math.round(5 * frame.scale));
    const stroke = Math.max(1, Math.round(frame.scale / 3));
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      finding.boxes
        .map((box) =>
          frameRect(box, frame, RULE_COLOURS[finding.rule], stroke + 1),
        )
        .join('') +
      guides(finding, frame, { width, height }, size, stroke) +
      label(String(index + 1), 4, 4, RULE_COLOURS[finding.rule], size, {
        width,
        height,
      }) +
      `</svg>`;
    const out = join(
      input.dir,
      `${String(index + 1).padStart(2, '0')}-${finding.rule}.png`,
    );
    await sharp(input.shot)
      .extract({ left, top, width: right - left, height: bottom - top })
      .resize(width, height, { kernel: 'nearest' })
      .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
      .png()
      .toFile(out);
    written.push(out);
  }
  return written;
}

// The step's screenshot with what happened drawn over it, made afterwards
// with sharp — never in the page, where it would sit under a modal and in
// the probe's way. The probe draws its findings and the pointer
// (`../probe/draw.ts`); without a probe result this draws the pointer alone.
import { copyFileSync, existsSync, renameSync, rmSync } from 'node:fs';
import { basename, join } from 'node:path';
import { cropName } from '../review/crops';
import type { Page } from '@playwright/test';
import sharp from 'sharp';
import type { Box, ProbeResult } from '../types';

export interface MarkInput {
  shot: string;
  out: string;
  dpr: number;
  pointer?: { from: [number, number]; to: [number, number] };
  look?: Box;
  result?: ProbeResult;
  cropsDir: string;
  step: number;
}

interface ProbeModule {
  probePage?: (page: Page, options: { theme: string }) => Promise<ProbeResult>;
}
interface DrawModule {
  drawMarked?: (input: {
    shot: string;
    result: Pick<ProbeResult, 'viewport' | 'findings'>;
    out: string;
    pointer?: { from: [number, number]; to: [number, number] };
    look?: Box;
  }) => Promise<string>;
  drawCrops?: (input: {
    shot: string;
    result: Pick<ProbeResult, 'viewport' | 'findings'>;
    dir: string;
  }) => Promise<string[]>;
}

const probeDir = new URL('../probe/', import.meta.url);
let probeModule: ProbeModule | null | undefined;
let drawModule: DrawModule | null | undefined;

async function optional<T>(name: string): Promise<T | null> {
  const file = new URL(name, probeDir);
  if (!existsSync(file)) return null;
  return (await import(file.href)) as T;
}

/** The probe's findings for the page as it is, or none while there is no probe. */
export async function probe(
  page: Page,
  theme: string,
): Promise<ProbeResult | undefined> {
  if (probeModule === undefined)
    probeModule = await optional<ProbeModule>('index.ts');
  return probeModule?.probePage
    ? probeModule.probePage(page, { theme })
    : undefined;
}

function overlay(
  width: number,
  height: number,
  input: MarkInput,
  withPointer: boolean,
) {
  const scale = input.dpr;
  const parts: string[] = [];
  if (withPointer && input.pointer) {
    const [fx, fy] = input.pointer.from.map((value) => value * scale) as [
      number,
      number,
    ];
    const [tx, ty] = input.pointer.to.map((value) => value * scale) as [
      number,
      number,
    ];
    parts.push(
      `<line x1="${fx}" y1="${fy}" x2="${tx}" y2="${ty}" stroke="#e11d48" stroke-width="${2 * scale}" stroke-dasharray="${6 * scale} ${4 * scale}" opacity="0.8"/>`,
      `<circle cx="${fx}" cy="${fy}" r="${7 * scale}" fill="none" stroke="#e11d48" stroke-width="${2 * scale}" opacity="0.45"/>`,
      `<circle cx="${tx}" cy="${ty}" r="${13 * scale}" fill="#e11d48" fill-opacity="0.18" stroke="#e11d48" stroke-width="${3 * scale}"/>`,
    );
  }
  if (input.look) {
    const box = input.look;
    parts.push(
      `<rect x="${box.x * scale}" y="${box.y * scale}" width="${box.width * scale}" height="${box.height * scale}" fill="none" stroke="#f59e0b" stroke-width="${3 * scale}" stroke-dasharray="${8 * scale} ${5 * scale}"/>`,
    );
  }
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${parts.join('')}</svg>`,
  );
}

/** The marked screenshot and the close-ups of the probe's findings. */
export async function drawStep(input: MarkInput): Promise<string[]> {
  if (drawModule === undefined)
    drawModule = await optional<DrawModule>('draw.ts');
  if (input.result && drawModule?.drawMarked) {
    await drawModule.drawMarked({
      shot: input.shot,
      result: input.result,
      out: input.out,
      ...(input.pointer ? { pointer: input.pointer } : {}),
      ...(input.look ? { look: input.look } : {}),
    });
    if (input.look) {
      // What was only looked at, framed over the probe's drawing.
      const meta = await sharp(input.out).metadata();
      const framed = await sharp(input.out)
        .composite([
          {
            input: overlay(meta.width!, meta.height!, input, false),
            top: 0,
            left: 0,
          },
        ])
        .png()
        .toBuffer();
      await sharp(framed).toFile(input.out);
    }
    if (!drawModule.drawCrops || !input.result.findings.length) return [];
    // Each step's close-ups are drawn apart, then named for the step and the
    // finding's fingerprint: `crops/<step>-<fp8>.png`, as the reviews read them.
    const scratch = join(input.cropsDir, `.step-${input.step}`);
    rmSync(scratch, { recursive: true, force: true });
    const drawn = await drawModule.drawCrops({
      shot: input.shot,
      result: input.result,
      dir: scratch,
    });
    // `NN-<rule>.png`: NN is the finding's place in the result, counted from
    // one; a finding with no boxes has no close-up, so the order alone lies.
    const named = drawn.map((path) => {
      const number = Number(/^(\d+)-/.exec(basename(path))?.[1]);
      const finding = number ? input.result!.findings[number - 1] : undefined;
      const target = join(
        input.cropsDir,
        finding
          ? cropName(input.step, finding.fp)
          : `${String(input.step).padStart(2, '0')}-${basename(path)}`,
      );
      renameSync(path, target);
      return target;
    });
    rmSync(scratch, { recursive: true, force: true });
    return named;
  }
  if (!input.pointer && !input.look) {
    copyFileSync(input.shot, input.out);
    return [];
  }
  const meta = await sharp(input.shot).metadata();
  await sharp(input.shot)
    .composite([
      {
        input: overlay(meta.width!, meta.height!, input, true),
        top: 0,
        left: 0,
      },
    ])
    .png()
    .toFile(input.out);
  return [];
}

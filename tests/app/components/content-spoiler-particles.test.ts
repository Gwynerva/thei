import { describe, expect, it } from 'vitest';
import {
  SPOILER_PARTICLES,
  createParticleField,
  frameStep,
  particleAlpha,
  spawnParticle,
  spoilerParticleCount,
  stepParticles,
  type ParticleField,
} from '../../../app/components/content/content-spoiler-particles';

function field(
  specks: Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    age?: number;
    life?: number;
  }>,
): ParticleField {
  const result = createParticleField(specks.length);
  specks.forEach((speck, index) => {
    result.x[index] = speck.x;
    result.y[index] = speck.y;
    result.vx[index] = speck.vx;
    result.vy[index] = speck.vy;
    result.age[index] = speck.age ?? 0;
    result.life[index] = speck.life ?? 10;
    result.size[index] = 1;
  });
  result.count = specks.length;
  return result;
}

describe('spoiler particles', () => {
  it('follows the area of the block within its bounds', () => {
    expect(spoilerParticleCount(10, 10)).toBe(SPOILER_PARTICLES.minCount);
    expect(spoilerParticleCount(400, 40)).toBe(400);
    expect(spoilerParticleCount(4000, 4000)).toBe(SPOILER_PARTICLES.maxCount);
  });

  it('is born dark, brightest midway and dark again at the end', () => {
    expect(particleAlpha(0, 1)).toBe(0);
    expect(particleAlpha(0.5, 1)).toBe(1);
    expect(particleAlpha(1, 1)).toBeCloseTo(0);
  });

  it('moves a speck, wraps it around the edges and reincarnates a spent one', () => {
    const specks = field([
      { x: 99, y: 5, vx: 100, vy: 0 },
      { x: 5, y: 5, vx: 0, vy: -100 },
      { x: 50, y: 50, vx: 0, vy: 0, age: 0.95, life: 1 },
    ]);

    stepParticles(specks, 0.1, 100, 100, SPOILER_PARTICLES);

    expect(specks.x[0]).toBeCloseTo(9);
    expect(specks.y[1]).toBeCloseTo(95);
    expect(specks.age[2]).toBe(0);
    expect(specks.life[2]).toBeGreaterThanOrEqual(SPOILER_PARTICLES.life[0]);
    expect(specks.life[2]).toBeLessThanOrEqual(SPOILER_PARTICLES.life[1]);
  });

  it('covers the same distance in the same time in a short block and a tall one', () => {
    const short = field([{ x: 10, y: 10, vx: 40, vy: 0 }]);
    const tall = field([{ x: 10, y: 10, vx: 40, vy: 0 }]);

    stepParticles(short, 0.25, 800, 24, SPOILER_PARTICLES);
    stepParticles(tall, 0.25, 800, 600, SPOILER_PARTICLES);

    expect(short.x[0]).toBeCloseTo(20);
    expect(tall.x[0]).toBeCloseTo(20);
  });

  it('drifts a line height at most over a whole life, so a short spoiler shimmers in place', () => {
    const [, fastest] = SPOILER_PARTICLES.speed;
    const [, longest] = SPOILER_PARTICLES.life;
    expect(fastest * longest).toBeLessThanOrEqual(32);
  });

  it('flies within the configured speed and starts part-way through its life', () => {
    const specks = createParticleField(200);
    for (let index = 0; index < 200; index++)
      spawnParticle(specks, index, 300, 50, SPOILER_PARTICLES, 0.5);
    for (let index = 0; index < 200; index++) {
      const speed = Math.hypot(specks.vx[index]!, specks.vy[index]!);
      expect(speed).toBeGreaterThanOrEqual(SPOILER_PARTICLES.speed[0] - 1e-3);
      expect(speed).toBeLessThanOrEqual(SPOILER_PARTICLES.speed[1] + 1e-3);
      expect(specks.age[index]).toBeCloseTo(specks.life[index]! / 2);
    }
  });

  it('mixes fine specks with a few coarser ones', () => {
    const specks = createParticleField(2000);
    for (let index = 0; index < 2000; index++)
      spawnParticle(specks, index, 300, 50, SPOILER_PARTICLES);
    const [smallest, largest] = SPOILER_PARTICLES.size;
    const middle = (smallest + largest) / 2;
    const sizes = [...specks.size];
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(smallest - 1e-6);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(largest + 1e-6);
    const fine = sizes.filter((size) => size < middle).length;
    expect(fine).toBeGreaterThan(sizes.length * 0.6);
    expect(fine).toBeLessThan(sizes.length * 0.8);
  });

  it('takes time from frame timestamps only, never backwards or too far', () => {
    expect(frameStep(1000, undefined)).toBe(0);
    expect(frameStep(1016, 1000)).toBeCloseTo(0.016);
    expect(frameStep(990, 1000)).toBe(0);
    expect(frameStep(5000, 1000)).toBe(0.05);
  });
});

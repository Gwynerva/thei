import { cyrb53 } from './hash';

/**
 * Returns a deterministic OKLCH hue (0–359) for any given string.
 * Uses the cyrb53 algorithm for strong avalanche effect — even a single
 * character difference produces a completely different hue.
 */
export function stringColorHue(str: string): number {
  return Math.abs(cyrb53(str) % 360);
}

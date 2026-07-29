import { describe, expect, it } from 'vitest';
import {
  generatedIconKey,
  normalizeGeneratedIconSeed,
  resolveGeneratedIcon,
} from '../../server/thei/media/generated-icon';

describe('generated fallback icons', () => {
  it('is stable for a project UUID without a versioned public URL', () => {
    const first = resolveGeneratedIcon('project', 'p-example');
    const second = resolveGeneratedIcon('project', 'p-example');

    expect(first).toEqual(second);
    expect(first.src).toMatch(
      /^\/media\/generated-icons\/project\/[a-f0-9]{64}\.webp$/,
    );
    expect(first.src).not.toContain('/v1/');
    expect(first.previewSrc).toBe(first.src);
  });

  it('normalizes author display names and changes on rename', () => {
    expect(normalizeGeneratedIconSeed('author', '  Gwynerva  ')).toBe(
      'gwynerva',
    );
    expect(generatedIconKey('author', 'Gwynerva')).toBe(
      generatedIconKey('author', '  GWYNERVA '),
    );
    expect(resolveGeneratedIcon('author', 'Gwynerva').src).not.toBe(
      resolveGeneratedIcon('author', 'Destroyer').src,
    );
  });
});

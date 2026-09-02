import { describe, expect, it } from 'vitest';
import {
  GENERATED_ICON_KINDS,
  generatedIconKey,
  isGeneratedIconKind,
  normalizeGeneratedIconSeed,
  resolveEntityIconMedia,
  resolveGeneratedIcon,
} from '../../server/thei/media/generated-icon';

describe('generated fallback icons', () => {
  it('uses one registry for every supported generated icon kind', () => {
    expect(GENERATED_ICON_KINDS).toEqual(['project', 'page', 'author']);
    expect(isGeneratedIconKind('project')).toBe(true);
    expect(isGeneratedIconKind('page')).toBe(true);
    expect(isGeneratedIconKind('author')).toBe(true);
    expect(isGeneratedIconKind('event')).toBe(false);
    expect(isGeneratedIconKind(undefined)).toBe(false);
  });

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

  it('uses a stable page icon seeded by the page UUID', () => {
    const first = resolveGeneratedIcon('page', 'pg-example');
    const second = resolveGeneratedIcon('page', 'pg-example');

    expect(first).toEqual(second);
    expect(first.src).toMatch(
      /^\/media\/generated-icons\/page\/[a-f0-9]{64}\.webp$/,
    );
    expect(first.src).not.toBe(resolveGeneratedIcon('page', 'pg-other').src);
  });

  it('prefers uploaded media and otherwise resolves the shared fallback', () => {
    const uploaded = {
      kind: 'image' as const,
      src: '/pages/example/icon/custom.webp',
      accentHue: 42,
    };

    expect(resolveEntityIconMedia('page', 'pg-example', uploaded)).toBe(
      uploaded,
    );
    expect(resolveEntityIconMedia('page', 'pg-example')).toEqual(
      resolveGeneratedIcon('page', 'pg-example'),
    );
  });
});

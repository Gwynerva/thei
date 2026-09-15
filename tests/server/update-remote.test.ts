import { describe, expect, it } from 'vitest';
import { parseTags, isNewer } from '../../update/remote';
import { dependencySpecifier } from '../../update/environment';
import {
  renderInstanceManifest,
  sourcePlaceholder,
} from '../../update/instance';

// Real `git ls-remote --tags` output: annotated tags appear twice, and not
// every tag is a release.
const lsRemote = [
  'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678\trefs/tags/v0.1.0',
  'b2c3d4e5f60718293a4b5c6d7e8f901234567890\trefs/tags/v0.1.0^{}',
  'c3d4e5f60718293a4b5c6d7e8f90123456789012\trefs/tags/v0.2.0',
  'd4e5f60718293a4b5c6d7e8f9012345678901234\trefs/tags/v0.10.0',
  'e5f60718293a4b5c6d7e8f901234567890123456\trefs/tags/v0.10.0^{}',
  'f60718293a4b5c6d7e8f90123456789012345678\trefs/tags/v1.0.0-rc.1',
  '0718293a4b5c6d7e8f9012345678901234567890\trefs/tags/nightly',
  '18293a4b5c6d7e8f90123456789012345678901a\trefs/heads/main',
].join('\n');

describe('remote tag discovery', () => {
  it('reads release tags, deduplicated and ordered', () => {
    expect(parseTags(lsRemote)).toEqual([
      'v0.1.0',
      'v0.2.0',
      'v0.10.0',
      'v1.0.0-rc.1',
    ]);
  });

  it('returns nothing for a repository without tags', () => {
    expect(parseTags('')).toEqual([]);
    expect(parseTags('18293a4b\trefs/heads/main')).toEqual([]);
  });

  it('only treats a strictly newer version as an update', () => {
    expect(isNewer('v0.2.0', '0.1.0')).toBe(true);
    expect(isNewer('v0.1.0', '0.1.0')).toBe(false);
    expect(isNewer('v0.1.0', '0.2.0')).toBe(false);
    expect(isNewer('nightly', '0.1.0')).toBe(false);
  });
});

describe('instance manifest', () => {
  const template = JSON.stringify(
    {
      name: 'thei-instance',
      dependencies: { nuxt: '^4.5.2', thei: sourcePlaceholder },
      trustedDependencies: ['better-sqlite3'],
    },
    null,
    2,
  );

  it('builds a GitHub specifier', () => {
    expect(
      dependencySpecifier('https://github.com/Gwynerva/thei.git', 'v0.2.0'),
    ).toBe('github:Gwynerva/thei#v0.2.0');
    expect(
      dependencySpecifier('git@github.com:Gwynerva/thei.git', 'v0.2.0'),
    ).toBe('github:Gwynerva/thei#v0.2.0');
  });

  it('falls back to a git URL for other remotes', () => {
    expect(dependencySpecifier('file:///srv/thei.git', 'v0.2.0')).toBe(
      'git+file:///srv/thei.git#v0.2.0',
    );
    expect(dependencySpecifier('git+file:///srv/thei.git', 'v0.2.0')).toBe(
      'git+file:///srv/thei.git#v0.2.0',
    );
  });

  it('pins the tag and keeps the rest of the template', () => {
    const rendered = renderInstanceManifest(
      template,
      'v0.2.0',
      'https://github.com/Gwynerva/thei.git',
    );
    const parsed = JSON.parse(rendered);

    expect(parsed.dependencies.thei).toBe('github:Gwynerva/thei#v0.2.0');
    expect(parsed.dependencies.nuxt).toBe('^4.5.2');
    expect(parsed.trustedDependencies).toEqual(['better-sqlite3']);
  });

  it('refuses a template it cannot fill in', () => {
    expect(() => renderInstanceManifest('{}', 'v0.2.0')).toThrow(
      sourcePlaceholder,
    );
  });
});

import { describe, expect, it } from 'vitest';
import type {
  PublicFile,
  PublicReferenceLink,
  PublicSecretReference,
} from '../../shared/api/public';
import {
  publicReferenceLinkKey,
  publicReferenceSplitSize,
  splitPublicReferenceFiles,
  splitPublicReferenceLinks,
} from '../../shared/public-references';

const external = (href: string, title = href): PublicReferenceLink => ({
  kind: 'external',
  title,
  href,
});
const internal = (
  kind: 'project' | 'event' | 'page',
  href: string,
  title = href,
): PublicReferenceLink => ({ kind, title, href });
const file = (key: string, title = key): PublicFile => ({
  key,
  title,
  href: `/files/${key}`,
  extension: 'pdf',
  size: 1,
});
const secret = (key: string): PublicSecretReference => ({
  secret: true,
  key,
  title: 'Secret',
  summary: '',
  iconMedia: { src: '', kind: 'image' } as never,
});

describe('publicReferenceLinkKey', () => {
  it('ignores fragments and trailing slashes of external addresses', () => {
    expect(publicReferenceLinkKey(external('https://a.test/docs/#intro'))).toBe(
      publicReferenceLinkKey(external('https://A.test/docs')),
    );
    expect(publicReferenceLinkKey(external('https://a.test/?q=1'))).not.toBe(
      publicReferenceLinkKey(external('https://a.test/?q=2')),
    );
  });

  it('keeps internal kinds apart from external addresses', () => {
    expect(
      publicReferenceLinkKey(internal('project', '/projects/a/')),
    ).not.toBe(publicReferenceLinkKey(external('/projects/a/')));
  });
});

describe('splitPublicReferenceLinks', () => {
  it('lifts links present in both lists into shared, keeping the manual one', () => {
    const split = splitPublicReferenceLinks(
      [
        external('https://a.test/', 'Named by hand'),
        internal('project', '/projects/p/', 'Project'),
        external('https://only-manual.test/'),
      ],
      [
        external('https://a.test', 'Fetched title'),
        internal('project', '/projects/p/', 'Project'),
        internal('event', '/events/e/'),
      ],
    );
    expect(split.shared.map((link) => link.title)).toEqual([
      'Named by hand',
      'Project',
    ]);
    expect(split.manual.map((link) => link.href)).toEqual([
      'https://only-manual.test/',
    ]);
    expect(split.content.map((link) => link.href)).toEqual(['/events/e/']);
    expect(publicReferenceSplitSize(split)).toBe(4);
  });

  it('merges an internal content link with a manual link resolved to the same entity', () => {
    const split = splitPublicReferenceLinks(
      [internal('page', '/pages/about/', 'About me')],
      [internal('page', '/pages/about/', 'About')],
    );
    expect(split).toEqual({
      shared: [internal('page', '/pages/about/', 'About me')],
      manual: [],
      content: [],
    });
  });

  it('collapses duplicates inside one list', () => {
    const split = splitPublicReferenceLinks(
      [],
      [
        external('https://a.test/x'),
        external('https://a.test/x/#top'),
        internal('event', '/events/e/'),
        internal('event', '/events/e/'),
      ],
    );
    expect(split.content).toHaveLength(2);
  });
});

describe('splitPublicReferenceFiles', () => {
  it('matches files by identity and never matches secrets to files', () => {
    const identity = (item: PublicFile) =>
      ({ a: 'hash-1', b: 'hash-1', c: 'hash-2' })[item.key] ?? item.key;
    const split = splitPublicReferenceFiles(
      [file('a', 'Manual title'), secret('s'), file('c')],
      [file('b', 'Content title'), file('s')],
      identity,
    );
    expect(split.shared.map((item) => item.title)).toEqual(['Manual title']);
    expect(split.manual.map((item) => item.key)).toEqual(['s', 'c']);
    expect(split.content.map((item) => item.key)).toEqual(['s']);
  });
});

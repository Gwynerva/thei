import { describe, expect, it } from 'vitest';
import type {
  PublicFile,
  PublicReferenceLink,
  PublicSecretReference,
} from '../../shared/api/public';
import {
  publicReferenceLinkKey,
  uniquePublicReferenceFiles,
  uniquePublicReferenceLinks,
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

describe('uniquePublicReferenceLinks', () => {
  const noted = (link: PublicReferenceLink, note: string) => ({
    ...link,
    note,
  });

  it('lists a link the owner attached twice once, the first copy standing', () => {
    expect(
      uniquePublicReferenceLinks([
        external('https://a.test/x', 'Named by hand'),
        external('https://a.test/x/#top', 'Fetched'),
        internal('event', '/events/e/'),
        internal('event', '/events/e/'),
      ]).map((link) => link.title),
    ).toEqual(['Named by hand', '/events/e/']);
  });

  it('keeps the note when only one copy has it', () => {
    expect(
      uniquePublicReferenceLinks([
        external('https://a.test/', 'Site'),
        noted(external('https://a.test', 'Site'), 'Why it is here'),
      ]),
    ).toEqual([noted(external('https://a.test/', 'Site'), 'Why it is here')]);
  });

  it('shows one copy when both notes read the same', () => {
    const links = uniquePublicReferenceLinks([
      noted(external('https://a.test/'), 'Same  words '),
      noted(external('https://a.test/'), 'Same words'),
    ]);
    expect(links).toHaveLength(1);
    expect(links[0]?.note).toBe('Same  words ');
  });

  it('keeps both copies of a link whose notes say different things', () => {
    expect(
      uniquePublicReferenceLinks([
        noted(external('https://a.test/'), 'First note'),
        noted(external('https://a.test/#part'), 'Second note'),
        noted(external('https://a.test'), 'Second note'),
      ]).map((link) => link.note),
    ).toEqual(['First note', 'Second note']);
  });
});

describe('uniquePublicReferenceFiles', () => {
  it('lists one file once by its identity, and never takes a secret for a file', () => {
    const identity = (item: PublicFile) =>
      ({ a: 'hash-1', b: 'hash-1', c: 'hash-2' })[item.key] ?? item.key;
    expect(
      uniquePublicReferenceFiles(
        [file('a', 'First'), secret('s'), file('b', 'Same bytes'), file('s')],
        identity,
      ).map((item) => item.key),
    ).toEqual(['a', 's', 's']);
  });
});

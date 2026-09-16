import { createHash } from 'node:crypto';
import type { PublicSecretReference } from '#layers/thei/shared/api/public';
import { resolveGeneratedIcon } from '../media/generated-icon';

export type SecretEntityKind =
  | 'project'
  | 'event'
  | 'page'
  | 'project-stage'
  | 'project-section'
  | 'media'
  | 'file';

/**
 * Presents something a visitor may not see under a stable codename.
 *
 * The codename is picked from a digest of an internal identity, which never
 * leaves the server, so the same secret keeps its name everywhere it appears
 * while nothing public can be traced back to it. The icon is seeded by the
 * resulting title, which also gives the secret its accent color.
 */
export function buildSecretReference(
  kind: SecretEntityKind,
  identity: string,
): PublicSecretReference {
  const digest = createHash('sha256')
    .update(`secret:${kind}:${identity}`)
    .digest();
  const codenames = THEI_SERVER.language.secretCodenames;
  const codename = codenames[digest.readUInt32BE(0) % codenames.length]!;
  const summaries = THEI_SERVER.language.secretSummaries;
  const summary = summaries[digest.readUInt32BE(16) % summaries.length]!;
  const phrase = THEI_SERVER.phrase;
  const title = {
    project: phrase.secret_project,
    event: phrase.secret_event,
    page: phrase.secret_page,
    'project-stage': phrase.secret_stage,
    'project-section': phrase.secret_section,
    media: phrase.secret_media,
    file: phrase.secret_file,
  }[kind](codename);
  return {
    secret: true,
    key: digest.toString('hex', 4, 16),
    title,
    summary,
    iconMedia: resolveGeneratedIcon('secret', title),
  };
}

import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  ASSET_DESCRIPTION_MAX,
  cleanAssetDescription,
} from '#layers/thei/shared/asset-description';
import { refuse as fail } from '../../../entity-patch/text';
import {
  AssetDescriptionConflict,
  AssetDescriptionInvalid,
  assetFamilyOf,
  familyExists,
  fileOfFamily,
  readFamilyDescription,
  writeAssetDescription,
} from '../../../assets/descriptions';
import { findFile, type FileKey } from '../target';
import type { ActionEvaluation, AiActionKindDef } from '../types';
import { clipped } from './common';

/**
 * Files, described: what a picture shows, what a recording or a video is and
 * what it is about, what a document is. A description is kept once for a
 * file's family, so the action names a file and changes what every variant
 * of it says. Applied, it is undone while the description reads as it left
 * it.
 */

/** What makes two descriptions the same one: their words, set apart from space. */
function textHash(text: string): string {
  return createHash('sha256')
    .update(text.replace(/\s+/g, ' ').trim().toLowerCase())
    .digest('hex')
    .slice(0, 24);
}

/** The file an action names, by its own field or as its target. */
function namedFile(key: FileKey | undefined, file: unknown): FileKey {
  if (file !== undefined) {
    const named =
      findFile(file) ??
      fail(`There is no file ${String(file)} in the library.`);
    if (key && key.id !== named.id)
      fail('Name the file once: as file, or as target asset:<id>.');
    return named;
  }
  return key ?? fail('Name the file it describes: file, its id a-….');
}

export const describeAction: AiActionKindDef<'describe'> = {
  kind: 'describe',
  reference: `A file's description, new or said again: file (its id, a-…) and text. It is what the file is, in words, the alt of a picture — read by models, by search and by whoever cannot see the file. A picture: what is in it; text on it is retold, not copied out. A recording: what it is and what it is about («a talk with grandmother about the move, about 10 minutes»). A video: what it shows and what is said. A document or an archive: what it is and what it is about. Never the text of a document nor a transcript of speech: one sentence or a few, at most ${ASSET_DESCRIPTION_MAX} characters, in the language of the site. One description serves the file and all its variants. Describe what you were shown, read with what its places say (read_file): the captions and titles there and the text around the file tell who and what is in it, where and when. A file you could not see is not described by guess — what its places say helps, but does not stand in for the file. What only a [private] place says stays out of a description that is public. Proofreading a description is this action too: the whole text, corrected.`,
  schema: z.object({
    file: z.string().optional(),
    text: z.string().min(1),
  }),
  targets: ['asset'],
  async prepare(key, input) {
    const file = namedFile(key, input.file);
    const text = cleanAssetDescription(input.text);
    if (!text) fail('Say what the file is.');
    if (text.length > ASSET_DESCRIPTION_MAX)
      fail(
        `A description is at most ${ASSET_DESCRIPTION_MAX} characters: say it shorter.`,
      );
    const family =
      assetFamilyOf(file.id) ?? fail(`There is no file ${file.id}.`);
    const current = readFamilyDescription(family.familyUuid);
    if (current.text === text) fail('That is already its description.');
    return {
      payload: {
        kind: 'describe',
        file: file.id,
        family: family.familyUuid,
        text,
      },
      base: { text: current.text, updatedAt: current.updatedAt },
      dropped: [],
      target: file,
    };
  },
  identity: (payload) => [payload.family, textHash(payload.text)],
  identityHasTarget: true,
  async apply(key, row, _context, write) {
    const payload = row.payload as {
      file: string;
      family: string;
      text: string;
    };
    const current = readFamilyDescription(payload.family);
    // Any file of the family still there carries it: the one named may be
    // gone while its variants stay.
    const carrier =
      (key && assetFamilyOf(key.id)?.familyUuid === payload.family
        ? key.id
        : fileOfFamily(payload.family)) ??
      fail('The file is gone from the library.');
    try {
      writeAssetDescription(carrier, payload.text, {
        expectedUpdatedAt: current.updatedAt,
        onWrite: (tx, schema, written) =>
          write(tx, schema, {
            kind: 'description',
            familyUuid: payload.family,
            before: current.text,
            after: written.text,
            versionBefore: current.updatedAt,
            versionAfter: written.updatedAt,
          }),
      });
    } catch (error) {
      if (error instanceof AssetDescriptionConflict)
        fail('The description changed in the meantime: read it again.');
      if (error instanceof AssetDescriptionInvalid) fail(error.message);
      throw error;
    }
    return { kind: 'asset', id: carrier };
  },
  evaluate(_key, row): ActionEvaluation {
    const payload = row.payload as { family: string; text: string };
    const base = (row.base ?? {}) as { text?: string };
    if (!familyExists(payload.family)) return { state: 'gone' };
    const current = readFamilyDescription(payload.family);
    if (current.text === payload.text) return { state: 'done' };
    return current.text === (base.text ?? '')
      ? { state: 'open' }
      : { state: 'stale' };
  },
  summary: (payload) =>
    `Description of ${payload.file}: "${clipped(payload.text, 100)}"`,
};

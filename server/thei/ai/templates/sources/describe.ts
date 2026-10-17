import { AssetType } from '#layers/thei/shared/asset';
import { fileFacts } from '../../../mcp/tools/library';
import { fileFamilies } from './files';
import type { CheckItem, TemplateSource } from './index';
import { withSections } from './scope';

/**
 * «File descriptions»: the files of the archive that have no description yet,
 * three a run, the latest touched first. What it reads of one is its bytes —
 * the original's, which the family was made from — so a file is looked at
 * again only once it is another file. A file the model could not be shown is
 * kept as looked at all the same: it is not described by guess, and the
 * next run would not be shown it either.
 */

/** How many files one run is given: each is looked at whole. */
const BATCH = 3;

/** The area a file is in, by its kind. */
const AREA_OF: Record<AssetType, string> = {
  [AssetType.Image]: 'pictures',
  [AssetType.Video]: 'videos',
  [AssetType.Audio]: 'recordings',
  [AssetType.Other]: 'documents',
};

export const describeSource: TemplateSource = {
  size: BATCH,
  areas: {
    pictures: 'pictures and drawings',
    videos: 'videos, by their frames and sound',
    recordings: 'recordings',
    documents: 'documents, archives and every other file',
  },

  async due({ scope, areas, covered, busy, whole }) {
    const batch: CheckItem[] = [];
    for (const family of fileFamilies(withSections(scope))) {
      if (!whole && batch.length >= BATCH) break;
      // A described file is the owner's: proofreading goes over its words.
      if (family.description || !family.placed) continue;
      if (areas && !areas.has(AREA_OF[family.type])) continue;
      const subject = `file:${family.familyUuid}`;
      if (busy.has(subject)) continue;
      if (covered.get(subject)?.fingerprint === family.originalHash) continue;
      let shown: string;
      try {
        shown = fileFacts(family.assetUuid);
      } catch {
        continue;
      }
      batch.push({
        subject,
        family: family.familyUuid,
        fingerprint: family.originalHash,
        parts: [],
        shown,
      });
    }
    return batch;
  },

  brief(batch) {
    return [
      'Describe the files that have none yet. Look at each with look_at_file, then propose its description with describe, as describe says: what the file shows or is about, in the language of the site — sure when what you were shown leaves no doubt, unsure when what its places say had to help. A file look_at_file could not show you is not described by guess: say which, and leave it. Propose nothing else.',
      'Read what each file’s places say before you describe it: the captions and titles the owner gave it there, the heading it stands under, the text just around it. They tell what the file alone may not — who is in a picture, where and when it was taken, what a recording or a document is of — so name them as the owner does, but only what the file and its places agree on. A description of a file on a public page is read by everyone: what only a [private] place says stays out of it.',
      '',
      ...batch.map((item) => item.shown),
    ].join('\n');
  },
};

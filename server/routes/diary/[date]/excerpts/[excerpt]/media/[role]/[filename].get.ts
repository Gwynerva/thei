import { publicIdFromExcerptUrlPart } from '#layers/thei/shared/excerpt-url';
import { dateFromDiaryUrlPart } from '#layers/thei/shared/diary-url';
import { sendContextAsset } from '../../../../../../../thei/assets/context-access';
import { listExcerpts } from '../../../../../../../thei/excerpts';
import {
  excerptAccess,
  diaryExcerptParent,
} from '../../../../../../../thei/excerpts/parents';

/** An excerpt's banner, the one file an excerpt holds outside its text. */
export default defineEventHandler(async (event) => {
  const date = dateFromDiaryUrlPart(getRouterParam(event, 'date') ?? '');
  if (!date) throw createError({ statusCode: 404 });
  const row = await THEI_SERVER.diary.findByDate(date);
  if (!row) throw createError({ statusCode: 404 });
  if (getRouterParam(event, 'role') !== 'banner')
    throw createError({ statusCode: 404 });
  const parent = diaryExcerptParent(row);
  // The address judges the file by this parent's access, so the excerpt has
  // to be this parent's own.
  const publicId = publicIdFromExcerptUrlPart(
    getRouterParam(event, 'excerpt') ?? '',
  );
  const excerpt = listExcerpts(parent).find(
    (item) => item.publicId === publicId,
  );
  if (!excerpt) throw createError({ statusCode: 404 });
  return sendContextAsset(event, {
    ownerType: 'excerpt',
    ownerId: excerpt.excerptUuid,
    // A private excerpt is the private side's, as its page is; any other is
    // as visible as its parent.
    access: excerptAccess(excerpt, parent),
    grantOwner: { entityType: parent.type, entityId: parent.id },
    role: 'banner',
    filename: getRouterParam(event, 'filename') ?? '',
  });
});

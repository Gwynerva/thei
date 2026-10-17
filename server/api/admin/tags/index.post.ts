import type { TagEditData } from '#layers/thei/shared/tag';
import { createTag } from '../../../thei/tags-edit/create';

export default defineEventHandler(async (event) =>
  createTag(await readBody<TagEditData>(event)),
);

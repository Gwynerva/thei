import type { PageEditData } from '#layers/thei/shared/page';
import { createPage } from '../../../thei/pages/create';

export default defineEventHandler(async (event) =>
  createPage(await readBody<PageEditData>(event)),
);

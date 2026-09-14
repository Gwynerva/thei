import { listLibraryAssets } from '../../../thei/assets/library';
import { parseLibraryQuery } from '../../../thei/assets/library-query';
export default defineEventHandler((event) =>
  listLibraryAssets(parseLibraryQuery(getQuery(event))),
);

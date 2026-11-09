import { listLibraryFeed } from '../../../thei/assets/library';
import { parseLibraryFeedQuery } from '../../../thei/assets/library-query';
export default defineEventHandler((event) =>
  listLibraryFeed(parseLibraryFeedQuery(getQuery(event))),
);

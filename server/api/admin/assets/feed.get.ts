import { listLibraryFeed } from '../../../thei/assets/library';
import { parseLibraryFeedQuery } from '../../../thei/assets/library-query';
import { withFeedPlaceMedia } from '../../../thei/assets/usage-media';
export default defineEventHandler((event) =>
  withFeedPlaceMedia(listLibraryFeed(parseLibraryFeedQuery(getQuery(event)))),
);

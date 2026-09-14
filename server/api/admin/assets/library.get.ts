import { listLibrarySections } from '../../../thei/assets/library';
import { parseLibraryQuery } from '../../../thei/assets/library-query';
export default defineEventHandler((event) => {
  const query = parseLibraryQuery(getQuery(event));
  return listLibrarySections(query);
});

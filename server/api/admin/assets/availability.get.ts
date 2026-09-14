import { getLibraryAvailability } from '../../../thei/assets/library';
import { parseSelectionConstraints } from '../../../thei/assets/library-query';

export default defineEventHandler((event) =>
  getLibraryAvailability(parseSelectionConstraints(getQuery(event))),
);

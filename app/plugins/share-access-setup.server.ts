/**
 * Hands the page the share links this visitor is holding.
 *
 * The private view a share link opens should say so: the reader is looking at
 * something the owner has not published, and the access ends at a known time.
 */
import type { ShareGrantPath } from '#layers/thei/shared/share-link';

export default defineNuxtPlugin(() => {
  const event = useRequestEvent();
  const grants = useState<ShareGrantPath[]>('share-grants', () => []);
  grants.value =
    (event?.context.shareGrantPaths as ShareGrantPath[] | undefined) ?? [];
});

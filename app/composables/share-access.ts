import type { ShareGrantPath } from '#layers/thei/shared/share-link';

/**
 * The share link that makes the current page visible, if any, and how long it
 * has left.
 *
 * Filled on the server from the visitor's cookie and carried in the payload,
 * so the notice renders with the page instead of appearing after it. A grant
 * covers its entity's address and everything under it, which is how a
 * project's link reaches its sections and chronology.
 */
export function useShareAccess() {
  const grants = useState<ShareGrantPath[]>('share-grants', () => []);
  const route = useRoute();
  const liveNow = useLiveNow();
  const grant = computed(() =>
    grants.value.find((item) => route.path.startsWith(item.path)),
  );
  const remaining = computed(() =>
    grant.value ? grant.value.expiresAt - liveNow.value : 0,
  );
  const ended = computed(() => Boolean(grant.value) && remaining.value <= 0);
  return { grant, remaining, ended };
}

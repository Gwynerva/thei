import type { ShareGrantPath } from '#layers/thei/shared/share-link';

/**
 * When a share link is what makes the current page visible, and until when.
 *
 * Filled on the server from the visitor's cookie and carried in the payload,
 * so the notice renders with the page instead of appearing after it.
 */
export function useShareAccess() {
  const grants = useState<ShareGrantPath[]>('share-grants', () => []);
  const route = useRoute();
  return computed(() => {
    if (!grants.value.length) return undefined;
    return grants.value.find((grant) => route.path.startsWith(grant.path))
      ?.expiresAt;
  });
}

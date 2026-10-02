/**
 * The tab title of an engine page: its trail, then the site and Thei.
 *
 * The head entry is made while the page is being set up, before anything is
 * awaited: one made later has no component to leave with, and stays in the
 * head after the page is gone.
 */
export const useAdminTabTitle = async (
  ...parts: (string | Ref<string>)[]
): Promise<void> => {
  const adminPublic = usePublicAdmin();
  const { data } = useNuxtData<{ displayName: string }>('admin-profile');
  useHead({
    title: computed(() => {
      const site = data.value?.displayName;
      if (site === undefined) return undefined;
      return `${parts.map((part) => toValue(part)).join(' \\ ')} \\ ${publicText(site)} - Thei`;
    }),
  });
  await adminPublic;
};

export const useAdminTabTitle = (...parts: (string | Ref<string>)[]) => {
  const nuxtApp = useNuxtApp();
  const adminPublicPromise = usePublicAdmin();

  return new Promise<void>(async (resolve) => {
    const adminPublic = await adminPublicPromise;
    const title = computed(() => {
      const postfix = ' \\ ' + adminPublic.value.displayName + ' — Thei';
      return (
        [
          ...parts.map((part) =>
            typeof part === 'string' ? part : part.value,
          ),
        ].join(' \\ ') + postfix
      );
    });

    nuxtApp.runWithContext(() => {
      useHead({
        title,
      });
    });

    resolve();
  });
};

export const usePublicAdmin = () => {
  const fetchPromise = useFetch('/api/admin/profile', { key: 'admin-profile' });
  type RawData = Readonly<NonNullable<typeof fetchPromise.data.value>>;
  return new Promise<Readonly<Ref<RawData>>>(async (resolve) => {
    try {
      const data = (await fetchPromise).data;
      resolve(data as any);
    } catch (error) {
      console.error('[thei] Failed to fetch public admin data:', error);
      // Still settle: a caller such as the error page must render with the
      // data it already has rather than hang forever.
      resolve(fetchPromise.data as any);
    }
  });
};

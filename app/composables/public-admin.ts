export const usePublicAdmin = () => {
  const fetchPromise = useFetch('/api/public-admin', { key: 'public-admin' });
  type RawData = NonNullable<typeof fetchPromise.data.value>;
  return new Promise<Ref<RawData>>(async (resolve) => {
    try {
      const data = (await fetchPromise).data;
      resolve(data as any);
    } catch (error) {
      console.error('[thei] Failed to fetch public admin data:', error);
    }
  });
};

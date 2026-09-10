export function useHashDisclosure(
  hash: `#${string}`,
  expanded: Ref<boolean>,
  load: () => Promise<void>,
) {
  const route = useRoute();
  function reveal(value: string) {
    if (value !== hash) return;
    expanded.value = true;
    void load();
  }
  watch(() => route.hash, reveal);
  onMounted(() => reveal(window.location.hash));
}

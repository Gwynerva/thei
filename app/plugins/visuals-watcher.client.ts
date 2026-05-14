import { applyVisuals, setStorageVisuals } from '../scripts/visuals';

export default defineNuxtPlugin(() => {
  const visuals = useVisuals();
  watch(
    visuals,
    (newVisuals) => {
      setStorageVisuals(newVisuals);
      applyVisuals(newVisuals);
    },
    { immediate: true, deep: true },
  );
});

/**
 * Device pixels per CSS pixel, kept current: it changes with the browser's
 * zoom and when the window moves to another screen. What is drawn at a
 * whole number of device pixels per image pixel is drawn as it is; anything
 * else the browser resamples.
 */
export function useDevicePixelRatio() {
  const ratio = ref(1);
  if (typeof window === 'undefined') return ratio;

  let media: MediaQueryList | undefined;
  const update = () => {
    media?.removeEventListener('change', update);
    ratio.value = window.devicePixelRatio || 1;
    // The query stops matching the moment the ratio changes, whatever it
    // changes to.
    media = window.matchMedia(`(resolution: ${ratio.value}dppx)`);
    media.addEventListener('change', update);
  };
  update();
  onScopeDispose(() => media?.removeEventListener('change', update));
  return ratio;
}

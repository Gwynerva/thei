export default defineNuxtPlugin((nuxtApp) => {
  const liveNow = useState<number>('live-now');

  if (import.meta.server) {
    liveNow.value = Date.now();
    return;
  }

  function updateLiveNow() {
    liveNow.value = Date.now();
    setTimeout(updateLiveNow, 1000);
  }

  // Hydration reads the server's clock: a client clock set before it would
  // turn "just now" into "1 minute ago" on the way and break hydration.
  if (nuxtApp.isHydrating && liveNow.value) {
    nuxtApp.hooks.hookOnce('app:suspense:resolve', updateLiveNow);
  } else {
    updateLiveNow();
  }
});

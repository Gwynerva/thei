export default defineNuxtPlugin(() => {
  const liveNow = useState<number>('live-now');

  if (import.meta.server) {
    liveNow.value = Date.now();
    return;
  }

  function updateLiveNow() {
    liveNow.value = Date.now();
    setTimeout(updateLiveNow, 1000);
  }

  updateLiveNow();
});

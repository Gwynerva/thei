/** Narrower than Tailwind's `sm`, the one breakpoint of the site: a phone. */
const PHONE_QUERY = '(width < 40rem)';

/** One query for the whole page, however many ask it. */
const phone = ref(false);
let askers = 0;
let query: MediaQueryList | undefined;
const update = () => (phone.value = Boolean(query?.matches));

/**
 * Whether the page is as narrow as a phone's, kept up to date as the window
 * turns or is resized. On the server, and before the page is mounted, it
 * reads as wide.
 */
export function usePhoneWidth() {
  let asking = false;
  onMounted(() => {
    asking = true;
    if (askers++ === 0) {
      query = window.matchMedia(PHONE_QUERY);
      query.addEventListener('change', update);
    }
    update();
  });
  onBeforeUnmount(() => {
    if (!asking || --askers > 0) return;
    query?.removeEventListener('change', update);
    query = undefined;
  });
  return readonly(phone);
}

import { buildLifeUrl, type LifeFilter } from '#layers/thei/shared/life';

/**
 * Picking a day out of the feed.
 *
 * Clicking a day's rail or its big date does three things at once: it makes
 * that day the active one, it rewrites the address so a reload lands back
 * here, and it puts the absolute link on the clipboard — because "which day am
 * I looking at" and "how do I send it to someone" are the same question.
 *
 * The address is replaced rather than pushed: scrolling the feed already
 * rewrites it continuously, and pushing would fill the back button with days.
 */
export function useLifeAnchor(options: {
  basePath: () => string;
  filter: () => LifeFilter;
  setActiveDate: (date: string) => void;
}) {
  const siteUrl = useSiteUrl();
  const copied = ref<string>();
  let clearTimer: ReturnType<typeof setTimeout> | undefined;

  function hrefFor(date: string) {
    return buildLifeUrl({ date, filter: options.filter() }, options.basePath());
  }

  async function pick(date: string) {
    options.setActiveDate(date);
    const path = hrefFor(date);
    if (import.meta.client) {
      const href = sitePath(path);
      if (window.location.pathname + window.location.search !== href)
        window.history.replaceState(
          { ...(window.history.state ?? {}), current: path },
          '',
          href,
        );
      try {
        await navigator.clipboard.writeText(siteUrl.resolve(path));
        copied.value = date;
        if (clearTimer) clearTimeout(clearTimer);
        clearTimer = setTimeout(() => {
          copied.value = undefined;
        }, 2_000);
      } catch {
        // Clipboard access can be refused; the address bar still moved, which
        // is the part the reader can act on.
      }
    }
  }

  onBeforeUnmount(() => {
    if (clearTimer) clearTimeout(clearTimer);
  });

  return { hrefFor, pick, copied: readonly(copied) };
}

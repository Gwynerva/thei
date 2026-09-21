import type { ResolvableScript } from '@unhead/vue/types';
import {
  googleTagInlineScript,
  googleTagSrc,
  yandexMetrikaInlineScript,
  type SiteAnalyticsSettings,
} from '#layers/thei/shared/analytics';

declare global {
  interface Window {
    ym?: (id: number, action: string, ...args: unknown[]) => void;
  }
}

/**
 * Puts the configured counters and verification codes into the page head.
 *
 * Verification meta tags are always rendered: a search console fetches the
 * page as a stranger, and the tag is inert for everyone else. The counters
 * themselves are left out for the signed-in owner, so browsing your own site
 * does not become traffic, and for a private site, which has no audience.
 *
 * Google Analytics counts in-app navigation by itself through enhanced
 * measurement, so no page views are sent by hand — doing both would count
 * every page twice. Yandex Metrica is the opposite: its snippet is started
 * with `defer`, and each navigation is reported here.
 */
export function useSiteAnalytics(options: {
  analytics: Ref<SiteAnalyticsSettings | undefined>;
  enabled: Ref<boolean>;
}) {
  const route = useRoute();
  const counters = computed(() =>
    options.enabled.value ? options.analytics.value : undefined,
  );

  useHead({
    meta: computed(() => {
      const value = options.analytics.value;
      const tags: { key: string; name: string; content: string }[] = [];
      if (value?.googleSiteVerification)
        tags.push({
          key: 'google-site-verification',
          name: 'google-site-verification',
          content: value.googleSiteVerification,
        });
      if (value?.yandexVerification)
        tags.push({
          key: 'yandex-verification',
          name: 'yandex-verification',
          content: value.yandexVerification,
        });
      return tags;
    }),
    script: computed(() => {
      const value = counters.value;
      const scripts: ResolvableScript[] = [];
      if (value?.googleTagId) {
        scripts.push({
          key: 'google-tag',
          src: googleTagSrc(value.googleTagId),
          async: true,
        });
        scripts.push({
          key: 'google-tag-init',
          innerHTML: googleTagInlineScript(value.googleTagId),
        });
      }
      if (value?.yandexMetrikaId)
        scripts.push({
          key: 'yandex-metrika',
          innerHTML: yandexMetrikaInlineScript(value.yandexMetrikaId),
        });
      return scripts;
    }),
  });

  if (import.meta.client) {
    let lastHit = '';
    const sendMetrikaHit = () => {
      const id = Number(counters.value?.yandexMetrikaId);
      if (!id || !window.ym) return;
      const url = window.location.href;
      if (url === lastHit) return;
      const referer = lastHit ? undefined : document.referrer;
      lastHit = url;
      window.ym(id, 'hit', url, {
        title: document.title,
        ...(referer ? { referer } : {}),
      });
    };
    // `flush: 'post'` so the new document title is already in place.
    watch(
      () => route.fullPath,
      () => nextTick(sendMetrikaHit),
      {
        immediate: true,
        flush: 'post',
      },
    );
  }
}

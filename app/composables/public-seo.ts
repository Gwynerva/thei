import type { MaybeRefOrGetter } from 'vue';
import { toValue } from 'vue';

type PublicSeoOptions = {
  title: MaybeRefOrGetter<string>;
  description?: MaybeRefOrGetter<string | undefined>;
  canonical?: MaybeRefOrGetter<string | undefined>;
  noIndex?: MaybeRefOrGetter<boolean | undefined>;
};

export function usePublicSeo(options: PublicSeoOptions) {
  const requestUrl = useRequestURL();
  useHead(() => {
    const description = options.description
      ? toValue(options.description)
      : undefined;
    const canonical = options.canonical
      ? toValue(options.canonical)
      : undefined;
    const noIndex = options.noIndex ? toValue(options.noIndex) : false;
    return {
      title: toValue(options.title),
      meta: [
        ...(description ? [{ name: 'description', content: description }] : []),
        ...(noIndex ? [{ name: 'robots', content: 'noindex,nofollow' }] : []),
      ],
      link: canonical
        ? [
            {
              rel: 'canonical',
              href: new URL(canonical, requestUrl.origin).toString(),
            },
          ]
        : [],
    };
  });
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

export function formatLifeSeoPeriod(
  period: string | undefined,
  locale: string,
): string | undefined {
  if (!period) return undefined;
  const [year, month, day] = period.split('-').map(Number);
  if (!year) return undefined;
  if (!month) return String(year);
  const date = new Date(Date.UTC(year, month - 1, day || 1));
  const monthName = new Intl.DateTimeFormat(locale, {
    ...(day ? { day: 'numeric' as const } : {}),
    month: 'long',
    timeZone: 'UTC',
  })
    .formatToParts(date)
    .find((part) => part.type === 'month')!.value;
  const label = day ? `${day} ${monthName} ${year}` : `${monthName} ${year}`;
  return label.charAt(0).toLocaleUpperCase(locale) + label.slice(1);
}

import type { MaybeRefOrGetter } from 'vue';
import { toValue } from 'vue';

/** One step of the trail leading to the current page. */
export type PublicBreadcrumb = {
  name: string;
  /** Site-relative path; resolved against the request origin. */
  path: string;
};

export type PublicSeoEntity = Record<string, unknown>;

type PublicSeoOptions = {
  title: MaybeRefOrGetter<string>;
  description?: MaybeRefOrGetter<string | undefined>;
  canonical?: MaybeRefOrGetter<string | undefined>;
  noIndex?: MaybeRefOrGetter<boolean | undefined>;
  /**
   * Schema.org type of the page node itself: `CollectionPage` for a listing,
   * `ProfilePage` for the home page. Defaults to `WebPage`.
   */
  pageType?: MaybeRefOrGetter<string | undefined>;
  /**
   * The trail above this page, root first, excluding the page itself — the
   * page is appended as the last crumb, so a page only describes where it sits.
   */
  breadcrumbs?: MaybeRefOrGetter<PublicBreadcrumb[] | undefined>;
  /** Name of the page's own crumb, when the tab title reads badly in a trail. */
  breadcrumbName?: MaybeRefOrGetter<string | undefined>;
  /**
   * Schema.org nodes for what the page is about — a CreativeWork, an Event, a
   * Person. The first one becomes the WebPage's `mainEntity`.
   *
   * Inside them, `@id`, `url`, `image`, `item`, `contentUrl`, `logo` and
   * `sameAs` are resolved against the site origin, so a node can be written
   * with a bare `#fragment` or a site-relative path.
   */
  entities?: MaybeRefOrGetter<PublicSeoEntity[] | undefined>;
  /** Representative image of the page, for `primaryImageOfPage`. */
  image?: MaybeRefOrGetter<string | undefined>;
};

/** Keys whose string values name a resource rather than describe one. */
const URL_KEYS = new Set([
  '@id',
  'url',
  'image',
  'item',
  'contentUrl',
  'logo',
  'sameAs',
]);

function resolveUrls<T>(value: T, resolve: (path: string) => string): T {
  if (Array.isArray(value)) {
    return value.map((item) => resolveUrls(item, resolve)) as T;
  }
  if (!value || typeof value !== 'object') return value;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] =
      URL_KEYS.has(key) && typeof item === 'string'
        ? resolve(item)
        : resolveUrls(item, resolve);
  }
  return result as T;
}

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

  useHead(() => {
    const canonical = options.canonical
      ? toValue(options.canonical)
      : undefined;
    const noIndex = options.noIndex ? toValue(options.noIndex) : false;
    // A page kept out of the index has nothing to describe to a crawler, and
    // without a canonical there is no stable @id to hang a graph on.
    if (!canonical || noIndex) return {};

    const absolute = (path: string) =>
      path.startsWith('#')
        ? `${new URL(canonical, requestUrl.origin).toString()}${path}`
        : new URL(path, requestUrl.origin).toString();
    const pageUrl = absolute(canonical);
    const title = toValue(options.title);
    const description = options.description
      ? toValue(options.description)
      : undefined;
    const image = options.image ? toValue(options.image) : undefined;
    const entities = resolveUrls(toValue(options.entities) ?? [], absolute);
    const trail = [
      ...(toValue(options.breadcrumbs) ?? []),
      {
        name:
          (options.breadcrumbName
            ? toValue(options.breadcrumbName)
            : undefined) ?? title,
        path: canonical,
      },
    ];
    // A lone crumb is the page itself and describes no trail at all.
    const hasTrail = trail.length > 1;

    const webPage: PublicSeoEntity = {
      '@type':
        (options.pageType ? toValue(options.pageType) : null) ?? 'WebPage',
      '@id': `${pageUrl}#webpage`,
      url: pageUrl,
      name: title,
      inLanguage: language.value.code,
      isPartOf: { '@id': `${absolute('/')}#website` },
      ...(description ? { description } : {}),
      ...(image ? { primaryImageOfPage: absolute(image) } : {}),
      ...(hasTrail ? { breadcrumb: { '@id': `${pageUrl}#breadcrumb` } } : {}),
      ...(entities[0]?.['@id']
        ? { mainEntity: { '@id': entities[0]['@id'] } }
        : {}),
    };

    return {
      script: [
        {
          key: 'public-page-jsonld',
          type: 'application/ld+json',
          textContent: serializeJsonLd({
            '@context': 'https://schema.org',
            '@graph': [
              webPage,
              ...(hasTrail
                ? [
                    {
                      '@type': 'BreadcrumbList',
                      '@id': `${pageUrl}#breadcrumb`,
                      itemListElement: trail.map((crumb, index) => ({
                        '@type': 'ListItem',
                        position: index + 1,
                        name: crumb.name,
                        item: absolute(crumb.path),
                      })),
                    },
                  ]
                : []),
              ...entities,
            ],
          }),
        },
      ],
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

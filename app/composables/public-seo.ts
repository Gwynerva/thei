import type { ResolvableLink, ResolvableMeta } from '@unhead/vue/types';
import type { MaybeRefOrGetter } from 'vue';
import { toValue } from 'vue';
import { version as theiVersion } from '#thei/static-public';

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
  /**
   * The card a link to this page previews as, from `useOgImage`.
   *
   * Left out where there is nothing to preview — a private entity, or a page
   * kept out of the index — so a link shows plain text rather than a picture
   * of something the visitor may not open.
   */
  ogImage?: MaybeRefOrGetter<string | undefined>;
  /** `article` for a piece of content, `profile` for the home page. */
  ogType?: MaybeRefOrGetter<string | undefined>;
  /**
   * Whether this page is also served as Markdown at `<canonical>index.md`.
   *
   * Announced as an alternate representation, which is how a reader that wants
   * the text rather than the application finds it.
   */
  markdown?: MaybeRefOrGetter<boolean | undefined>;
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
  const site = useSiteUrl();

  useHead(() => {
    const description = options.description
      ? toValue(options.description)
      : undefined;
    const canonical = options.canonical
      ? toValue(options.canonical)
      : undefined;
    const noIndex = options.noIndex ? toValue(options.noIndex) : false;
    const title = toValue(options.title);
    const ogImage = options.ogImage ? toValue(options.ogImage) : undefined;
    const meta: ResolvableMeta[] = [
      ...(description ? [{ name: 'description', content: description }] : []),
      // The convention every site generator follows: name and version, so a
      // crawler or an archive can tell what built the page.
      { name: 'generator', content: `Thei ${theiVersion}` },
      ...(noIndex ? [{ name: 'robots', content: 'noindex,nofollow' }] : []),
      // Open Graph is what messengers and social sites read; Twitter's own
      // card tag is the one extra line that makes the image large there.
      { property: 'og:title', content: title },
      ...(description
        ? [{ property: 'og:description', content: description }]
        : []),
      {
        property: 'og:type',
        content:
          (options.ogType ? toValue(options.ogType) : undefined) ?? 'website',
      },
      ...(canonical
        ? [{ property: 'og:url', content: site.resolve(canonical) }]
        : []),
      ...(ogImage
        ? [
            { property: 'og:image', content: site.resolve(ogImage) },
            { property: 'og:image:type', content: 'image/png' },
            { property: 'og:image:width', content: '1200' },
            { property: 'og:image:height', content: '630' },
            { property: 'og:image:alt', content: title },
            { name: 'twitter:card', content: 'summary_large_image' },
          ]
        : []),
    ];
    const link: ResolvableLink[] = canonical
      ? [
          {
            rel: 'canonical',
            href: site.resolve(canonical),
          },
          ...((options.markdown ? toValue(options.markdown) : false)
            ? [
                {
                  rel: 'alternate' as const,
                  type: 'text/markdown',
                  href: site.resolve(`${canonical}index.md`),
                },
              ]
            : []),
        ]
      : [];
    return { title, meta, link };
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
        ? `${site.resolve(canonical)}${path}`
        : site.resolve(path);
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

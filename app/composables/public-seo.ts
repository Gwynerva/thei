import type { ResolvableLink, ResolvableMeta } from '@unhead/vue/types';
import type { MaybeRefOrGetter } from 'vue';
import { toValue } from 'vue';
import { version as theiVersion } from '#thei/static-public';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import {
  OG_IMAGE_HEIGHT,
  OG_IMAGE_WIDTH,
  type OgImageInfo,
} from '#layers/thei/shared/og-url';

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
   * Schema.org nodes for what the page is about — an Article, a Person, a
   * list. The first one becomes the WebPage's `mainEntity`.
   *
   * Inside them, `@id`, `url`, `image`, `item`, `contentUrl`, `logo` and
   * `sameAs` are resolved against the site origin, so a node can be written
   * with a bare `#fragment` or a site-relative path.
   */
  entities?: MaybeRefOrGetter<PublicSeoEntity[] | undefined>;
  /**
   * Representative image of the page, for `primaryImageOfPage` — usually
   * `publicSeoImage()`, the same picture the main entity names.
   */
  image?: MaybeRefOrGetter<string | undefined>;
  /**
   * The card a link to this page previews as, from `useOgImage`.
   *
   * Every page a stranger may open has one, a link-only page included —
   * those are exactly the pages people share by link. It is absent where the
   * server draws none: a private entity, a closed site. A link then shows
   * plain text rather than a broken picture.
   */
  ogImage?: MaybeRefOrGetter<OgImageInfo | undefined>;
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

/**
 * Keys whose string values are words a reader sees — in a search result, a
 * link preview — and so get the owner's typography like the page itself.
 */
const TEXT_KEYS = new Set([
  'name',
  'headline',
  'description',
  'alternateName',
  'keywords',
  'caption',
  'abstract',
  'text',
]);

function formatTexts<T>(value: T): T {
  if (Array.isArray(value)) return value.map(formatTexts) as T;
  if (!value || typeof value !== 'object') return value;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value))
    result[key] = !TEXT_KEYS.has(key)
      ? formatTexts(item)
      : typeof item === 'string'
        ? publicText(item)
        : Array.isArray(item)
          ? item.map((entry) =>
              typeof entry === 'string'
                ? publicText(entry)
                : formatTexts(entry),
            )
          : formatTexts(item);
  return result as T;
}

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

/**
 * The owner of the site, as the author of everything on it. Every graph
 * carries the node it points at, so a reader of one page needs no other.
 */
export const publicSeoOwner = { '@id': '/#person' } as const;

/**
 * The smallest picture Google takes as the image of an article, in pixels
 * (width times height).
 */
const MIN_SEO_IMAGE_PIXELS = 50_000;

/**
 * The picture that stands for a page in structured data: the entity's own
 * image when it has one worth showing, otherwise the page's Open Graph card.
 *
 * A drawn placeholder icon depicts the entity's name rather than the entity,
 * and search engines ask for a picture of what the page is about, so it is
 * never offered; neither is an icon too small to be shown. A video stands in
 * by its still frame.
 */
export function publicSeoImage(
  media: MediaDescriptor | undefined,
  fallback?: string,
): string | undefined {
  if (!media || media.generated) return fallback;
  if (
    media.width &&
    media.height &&
    media.width * media.height < MIN_SEO_IMAGE_PIXELS
  )
    return fallback;
  return media.kind === 'video' ? media.previewSrc : media.src;
}

/**
 * When the things a page tells about happened, as schema.org's
 * `temporalCoverage` spells it: one ISO 8601 date, or an interval of two.
 */
export function publicSeoTemporalCoverage(period: {
  startDate: string;
  endDate: string;
}): string {
  return period.startDate === period.endDate
    ? period.startDate
    : `${period.startDate}/${period.endDate}`;
}

/**
 * The head of a public page. Titles, descriptions and the words inside the
 * structured data are the owner's, so they are formatted here once, whoever
 * builds them — a phrase formatted again is left as it was.
 *
 * The structured data says what a page is, not what Thei calls its entity:
 *
 * - the home page is the owner's `ProfilePage`, about a `Person`;
 * - a project is a `CreativeWork`, since a project may be anything at all;
 * - a section, an event and a page are an `Article` — something the
 *   owner wrote — and a diary entry is a `BlogPosting`;
 * - a list of any of them is a `CollectionPage` holding an `ItemList`.
 *
 * An event is never a schema.org `Event`. Search engines read that as a
 * gathering open to the public, and demand a venue and an address a moment
 * of a life does not have; when it happened goes in `temporalCoverage`.
 *
 * Every written node names `publicSeoOwner` as its author, and every graph
 * carries the site and its owner, so no reader has to fetch the home page to
 * know who wrote what.
 */
export function usePublicSeo(options: PublicSeoOptions) {
  const site = useSiteUrl();
  // The layout has already fetched it; what the site is called and whose it
  // is are the same thing here.
  const { data: owner } = useNuxtData<{ displayName: string }>('admin-profile');

  useHead(() => {
    const description = options.description
      ? publicText(toValue(options.description)) || undefined
      : undefined;
    const canonical = options.canonical
      ? toValue(options.canonical)
      : undefined;
    const noIndex = options.noIndex ? toValue(options.noIndex) : false;
    const title = publicText(toValue(options.title));
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
            { property: 'og:image', content: site.resolve(ogImage.url) },
            { property: 'og:image:type', content: 'image/png' },
            { property: 'og:image:width', content: String(OG_IMAGE_WIDTH) },
            {
              property: 'og:image:height',
              content: String(OG_IMAGE_HEIGHT),
            },
            { property: 'og:image:alt', content: ogImage.alt },
            { name: 'twitter:card', content: 'summary_large_image' },
            { name: 'twitter:image:alt', content: ogImage.alt },
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
    const title = publicText(toValue(options.title));
    const description = options.description
      ? publicText(toValue(options.description)) || undefined
      : undefined;
    const image = options.image ? toValue(options.image) : undefined;
    const entities = formatTexts(
      resolveUrls(toValue(options.entities) ?? [], absolute),
    );
    const trail = [
      ...(toValue(options.breadcrumbs) ?? []),
      {
        name:
          (options.breadcrumbName
            ? toValue(options.breadcrumbName)
            : undefined) ?? title,
        path: canonical,
      },
    ].map((crumb) => ({ ...crumb, name: publicText(crumb.name) }));
    // A lone crumb is the page itself and describes no trail at all.
    const hasTrail = trail.length > 1;

    const siteUrl = absolute('/');
    const personId = absolute(publicSeoOwner['@id']);
    const siteName = publicText(owner.value?.displayName ?? '');
    const webSite: PublicSeoEntity = {
      '@type': 'WebSite',
      '@id': `${siteUrl}#website`,
      url: siteUrl,
      ...(siteName ? { name: siteName } : {}),
      inLanguage: language.value.code,
      publisher: { '@id': personId },
    };
    // The home page describes the owner in full under the same @id.
    const person: PublicSeoEntity[] =
      siteName && !entities.some((entity) => entity['@id'] === personId)
        ? [{ '@type': 'Person', '@id': personId, name: siteName, url: siteUrl }]
        : [];

    const webPage: PublicSeoEntity = {
      '@type':
        (options.pageType ? toValue(options.pageType) : null) ?? 'WebPage',
      '@id': `${pageUrl}#webpage`,
      url: pageUrl,
      name: title,
      inLanguage: language.value.code,
      isPartOf: { '@id': webSite['@id'] },
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
              webSite,
              ...person,
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

/** A timeline day as a title reads it: "6 апреля 2027", "6 April 2027". */
export function formatLifeSeoDate(
  date: string | undefined,
  locale: string,
): string | undefined {
  if (!date) return undefined;
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return undefined;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  // Only the month name is taken from `Intl`; the order is fixed so the label
  // reads the same in every locale the engine ships.
  const monthName = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
    .formatToParts(parsed)
    .find((part) => part.type === 'month')!.value;
  const label = `${day} ${monthName} ${year}`;
  return label.charAt(0).toLocaleUpperCase(locale) + label.slice(1);
}

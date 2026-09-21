/**
 * Third-party analytics and search-console verification.
 *
 * Deliberately minimal: four identifiers, pasted from the provider's own
 * dashboard, turned into the exact snippet each provider documents. No
 * consent UI, no event mapping, no wrapper API — anything beyond "count the
 * visits and prove the site is mine" belongs in the provider's own interface.
 */
export interface SiteAnalyticsSettings {
  /** Google Analytics 4 measurement id, `G-XXXXXXX`. */
  googleTagId: string;
  /** `content` of Google Search Console's `google-site-verification` meta. */
  googleSiteVerification: string;
  /** Yandex Metrica counter number. */
  yandexMetrikaId: string;
  /** `content` of Yandex Webmaster's `yandex-verification` meta. */
  yandexVerification: string;
}

export const emptySiteAnalytics: SiteAnalyticsSettings = {
  googleTagId: '',
  googleSiteVerification: '',
  yandexMetrikaId: '',
  yandexVerification: '',
};

const PATTERNS: Record<keyof SiteAnalyticsSettings, RegExp> = {
  googleTagId: /^(?:G|AW|DC|GT)-[A-Z0-9-]{4,20}$/i,
  googleSiteVerification: /^[A-Za-z0-9_-]{10,100}$/,
  yandexMetrikaId: /^[0-9]{5,12}$/,
  yandexVerification: /^[A-Za-z0-9_-]{8,100}$/,
};

/**
 * Accepts what the provider's page offers for copying.
 *
 * Both Google and Yandex hand out a whole `<meta>` tag or a whole script
 * snippet, so pasting one is the likeliest thing to happen; the identifier is
 * lifted out of it instead of being rejected.
 */
export function normalizeAnalyticsValue(
  field: keyof SiteAnalyticsSettings,
  value: string,
): string | undefined {
  let trimmed = value.trim();
  if (!trimmed) return '';
  const meta = /content\s*=\s*["']([^"']+)["']/i.exec(trimmed);
  if (meta?.[1] && field.endsWith('Verification')) trimmed = meta[1].trim();
  if (field === 'googleTagId') {
    const fromSnippet = /[?&]id=([A-Za-z0-9-]+)/.exec(trimmed);
    if (fromSnippet?.[1]) trimmed = fromSnippet[1];
    trimmed = trimmed.toUpperCase();
  }
  if (field === 'yandexMetrikaId') {
    const fromSnippet = /ym\s*\(\s*([0-9]+)/.exec(trimmed);
    if (fromSnippet?.[1]) trimmed = fromSnippet[1];
  }
  return PATTERNS[field].test(trimmed) ? trimmed : undefined;
}

/** Validates every field, returning `undefined` when any one of them is bad. */
export function normalizeSiteAnalytics(
  value: Partial<SiteAnalyticsSettings> | undefined,
): SiteAnalyticsSettings | undefined {
  const result = { ...emptySiteAnalytics };
  for (const field of Object.keys(
    emptySiteAnalytics,
  ) as (keyof SiteAnalyticsSettings)[]) {
    const raw = value?.[field] ?? '';
    if (typeof raw !== 'string' || raw.length > 500) return undefined;
    const normalized = normalizeAnalyticsValue(field, raw);
    if (normalized === undefined) return undefined;
    result[field] = normalized;
  }
  return result;
}

/** Google Analytics' own SPA advice: let enhanced measurement do the counting. */
export function googleTagSrc(tagId: string): string {
  return `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(tagId)}`;
}

export function googleTagInlineScript(tagId: string): string {
  return [
    'window.dataLayer=window.dataLayer||[];',
    'function gtag(){dataLayer.push(arguments);}',
    "gtag('js',new Date());",
    `gtag('config',${JSON.stringify(tagId)});`,
  ].join('');
}

/**
 * Metrica's SPA snippet: `defer` stops it from counting page views on its own,
 * because in a single-page app only the router knows a page changed.
 */
export function yandexMetrikaInlineScript(counterId: string): string {
  const id = Number(counterId);
  return (
    '(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};' +
    'm[i].l=1*new Date();' +
    'k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)' +
    "})(window,document,'script','https://mc.yandex.ru/metrika/tag.js','ym');" +
    `ym(${id},'init',{defer:true,clickmap:true,trackLinks:true,accurateTrackBounce:true});`
  );
}

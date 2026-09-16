import type { IconName } from '#thei/icons';

export interface ErrorViewAction {
  label: string;
  path: string;
  primary?: boolean;
}

export interface ErrorView {
  status: number;
  title: string;
  description: string;
  /** The icon at the center of the singularity. */
  icon: IconName;
  /** Icons drawn into the singularity around it. */
  debris: IconName[];
  actions: ErrorViewAction[];
}

/** Shown in the center when no icon suits the situation better. */
export const ERROR_FALLBACK_ICON: IconName = 'face-dead';

/** The site itself: what a visitor could have been looking for. */
const SITE_DEBRIS: IconName[] = [
  'project',
  'event',
  'page',
  'tag',
  'heart',
  'gallery',
  'file',
  'calendar',
  'star',
  'link',
  'media',
  'history',
];

/**
 * Everything a public error page shows, decided in one place. A status
 * without an entry of its own gets the generic error with the fallback icon.
 */
export function useErrorView(status: MaybeRefOrGetter<number>) {
  return computed<ErrorView>(() => {
    const code = toValue(status);
    const home: ErrorViewAction = {
      label: phrase.value.back_home,
      path: '/',
      primary: true,
    };

    if (code === 403)
      return {
        status: code,
        title: phrase.value.forbidden_title,
        description: phrase.value.forbidden_description,
        icon: 'lock-close',
        debris: withSiteDebris([
          'person-key',
          'visibility-off',
          'lock-partial',
        ]),
        actions: [
          { label: phrase.value.sign_in, path: '/sign-in/', primary: true },
        ],
      };

    if (code === 404)
      return {
        status: code,
        title: phrase.value.not_found_title,
        description: phrase.value.not_found_description,
        icon: 'link-broken',
        debris: withSiteDebris(['missing', 'globe']),
        actions: [home, { label: phrase.value.open_life, path: '/life/' }],
      };

    return {
      status: code,
      title: phrase.value.error_title,
      description: phrase.value.error_description,
      icon: ERROR_FALLBACK_ICON,
      debris: withSiteDebris(['warning', 'refresh']),
      actions: [home],
    };
  });
}

function withSiteDebris(specific: IconName[]) {
  return [...specific, ...SITE_DEBRIS];
}

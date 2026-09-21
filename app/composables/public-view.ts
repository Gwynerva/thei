import {
  publicViewCookieName,
  publicViewGuestValue,
} from '#layers/thei/shared/public-view';

const publicViewCookieMaxAge = 60 * 60 * 24 * 365;

export function usePublicViewAsGuest(options: { reload?: boolean } = {}) {
  const viewCookie = useCookie<string | null>(publicViewCookieName, {
    path: useSiteUrl().base,
    maxAge: publicViewCookieMaxAge,
    sameSite: 'strict',
    secure: !import.meta.dev,
  });

  return computed({
    get: () => viewCookie.value === publicViewGuestValue,
    set: (asGuest: boolean) => {
      viewCookie.value = asGuest ? publicViewGuestValue : null;
      if (import.meta.client && options.reload !== false)
        window.location.reload();
    },
  });
}

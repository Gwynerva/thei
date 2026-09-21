import { createSignInLink } from '../../../thei/access-links/sign-in-links';
import { signInLinkPath } from '#layers/thei/shared/api/sign-in';
import type { SignInLinkItem } from '#layers/thei/shared/api/sign-in';
import { siteUrl } from '../../../thei/site-url';

export default defineEventHandler(async (event): Promise<SignInLinkItem> => {
  const link = await createSignInLink(event);
  return {
    tokenHash: link.tokenHash,
    createdAt: link.createdAt,
    expiresAt: link.expiresAt,
    createdFrom: link.createdFrom,
    // Absolute, because the link is meant to leave this device.
    url: siteUrl(event, signInLinkPath(link.token!)),
  };
});

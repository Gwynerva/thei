import { listSignInLinks } from '../../../thei/access-links/sign-in-links';
import type { SignInLinkItem } from '#layers/thei/shared/api/sign-in';

export default defineEventHandler((): SignInLinkItem[] =>
  listSignInLinks().map((link) => ({
    tokenHash: link.tokenHash,
    createdAt: link.createdAt,
    expiresAt: link.expiresAt,
    createdFrom: link.createdFrom,
  })),
);

export interface SignInData {
  secretPhrase: string;
  password: string;
}

/**
 * A one-time link that signs the owner in on another device.
 *
 * The token lives in the URL and nowhere else: the panel lists links by the
 * hash the server stores, so a link shown once cannot be shown again.
 */
export interface SignInLinkItem {
  tokenHash: string;
  createdAt: number;
  expiresAt: number;
  /** Where it was created, e.g. "Firefox · Windows". */
  createdFrom?: string;
  /** The full address, returned only when the link is created. */
  url?: string;
}

export function signInLinkPath(token: string): string {
  return `/sign-in/link/${token}/`;
}

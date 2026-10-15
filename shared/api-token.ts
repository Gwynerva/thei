import type { AiSessionItem } from './ai';

/**
 * Tokens that let a program outside the browser — an AI client over MCP —
 * work with the site on the owner's behalf.
 *
 * There are two kinds, as there are two kinds of help: a reader reads
 * everything and proposes actions; an editor may apply them too, as the
 * owner can, deleting included. Which change needs which scope is decided in one
 * place on the server (`server/thei/mcp/scope.ts`); this file only names
 * them.
 */
export const API_TOKEN_SCOPES = [
  /** Read everything as the owner sees it, and propose actions. */
  'read',
  /** Apply actions too: create, edit, publish, delete. */
  'edit',
] as const;

export type ApiTokenScope = (typeof API_TOKEN_SCOPES)[number];

/** The two kinds of token, offered when one is created. */
export const API_TOKEN_PRESETS = {
  reader: ['read'],
  editor: ['read', 'edit'],
} as const satisfies Record<string, readonly ApiTokenScope[]>;

export type ApiTokenPreset = keyof typeof API_TOKEN_PRESETS;

export const API_TOKEN_PRESET_NAMES = Object.keys(
  API_TOKEN_PRESETS,
) as ApiTokenPreset[];

/** Lets a secret scanner recognise a leaked token by its look. */
export const API_TOKEN_PREFIX = 'thei_';

export const API_TOKEN_LABEL_MAX = 100;

/** How many tokens a site may hold at once. */
export const API_TOKEN_LIMIT = 20;

export interface ApiTokenItem {
  tokenUuid: string;
  label: string;
  scopes: ApiTokenScope[];
  createdAt: number;
  lastUsedAt: number | null;
  /** The client last seen with it, as it introduced itself: "claude-code 2.1". */
  lastClient: string | null;
  /** `token` — made and copied by the owner; `oauth` — an app connected by signing in. */
  kind: 'token' | 'oauth';
  /** For a connection: the app, as it is known — by its own description, or by its word. */
  client?: { name: string; host: string; verified: boolean };
}

export interface ApiTokenCreateResponse {
  /** Shown once: only its hash is kept. */
  token: string;
  item: ApiTokenItem;
}

/** Puts scopes in their canonical order and drops anything unknown. */
export function normalizeApiTokenScopes(value: unknown): ApiTokenScope[] {
  const given = new Set(Array.isArray(value) ? value : []);
  given.add('read');
  return API_TOKEN_SCOPES.filter((scope) => given.has(scope));
}

/** The preset a set of scopes amounts to, if any. */
export function apiTokenPresetOf(
  scopes: readonly ApiTokenScope[],
): ApiTokenPreset | undefined {
  const key = normalizeApiTokenScopes(scopes).join(',');
  return API_TOKEN_PRESET_NAMES.find(
    (name) => API_TOKEN_PRESETS[name].join(',') === key,
  );
}

export interface ApiTokenListResponse {
  /** Whether AI access over MCP is on; off, no token opens anything. */
  enabled: boolean;
  tokens: ApiTokenItem[];
  /** What an app is told to connect. */
  connect: {
    /** The MCP endpoint's address. */
    endpoint: string;
    /** Whether an app may connect by signing in: AI on, and HTTPS or this computer. */
    signIn: boolean;
    /**
     * For a site in a subfolder: where an app looks for the sign-in server,
     * and where the site answers it — the one redirect the proxy needs.
     */
    proxyRule?: { from: string; to: string };
  };
}

/** One access key and what it did lately, for its own window. */
export interface ApiTokenActivityResponse {
  item: ApiTokenItem;
  /** Its sessions, the latest first. */
  sessions: AiSessionItem[];
  /** Actions it proposed that still wait for the owner. */
  waiting: number;
}

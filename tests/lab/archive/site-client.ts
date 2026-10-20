// Talks to a Thei site as its owner would through the admin: a cookie jar,
// patience with a dev server that restarts, and sign-in that respects the
// limit of one attempt every three seconds.
import { openAsBlob } from 'node:fs';
import en from '../../../shared/language/list/en';
import ru from '../../../shared/language/list/ru';

/**
 * Whether a refused sign-in says to wait: the server's own phrase, as each
 * language it may speak words it (the lab site speaks English; the
 * playground, whatever its owner chose). Compared with spaces made plain,
 * since a phrase binds short words to the next with a no-break space.
 */
function isRateLimited(message: string) {
  const plain = (text: string) => text.replace(/\s+/g, ' ').trim();
  return [en, ru].some(
    (language) =>
      plain(
        (language.normalize ?? ((text: string) => text))(
          language.phrases.sign_in_too_many_attempts ??
            en.phrases.sign_in_too_many_attempts,
        ),
      ) === plain(message),
  );
}

const RESTART_WINDOW_MS = 3 * 60 * 1000;

export class SiteError extends Error {}

export interface Answer<T = any> {
  status: number;
  body: T;
  text: string;
  location?: string;
}

export interface RequestOptions {
  json?: unknown;
  file?: string;
  headers?: Record<string, string>;
  /** As a stranger: no cookies sent or kept. */
  visitor?: boolean;
  timeoutMs?: number;
  /** Answer undefined instead of retrying when the request may have landed. */
  once?: boolean;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function describe(error: unknown) {
  const value = error as { code?: unknown; message?: string; name?: string };
  if (value?.name === 'TimeoutError') return 'no answer in time';
  return (
    (typeof value?.code === 'string' && value.code) ||
    value?.name ||
    value?.message ||
    String(error)
  );
}

export class SiteClient {
  readonly cookies = new Map<string, string>();
  credentials?: { secretPhrase: string; password: string };
  lastFailure = '';

  constructor(
    readonly origin: string,
    private readonly log: (message: string) => void = () => {},
  ) {}

  private keepCookies(response: Response) {
    for (const header of response.headers.getSetCookie()) {
      const [pair = '', ...attributes] = header.split(';');
      const split = pair.indexOf('=');
      if (split < 0) continue;
      const name = pair.slice(0, split).trim();
      const value = pair.slice(split + 1).trim();
      const expired =
        !value ||
        attributes.some((attribute) =>
          /^\s*max-age\s*=\s*0\s*$/i.test(attribute),
        ) ||
        attributes.some((attribute) => {
          const match = /^\s*expires\s*=\s*(.+)$/i.exec(attribute);
          return Boolean(match && Date.parse(match[1]!) < Date.now());
        });
      if (expired) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  /** The cookie header this client sends, for a browser to take over. */
  cookieHeader() {
    return [...this.cookies]
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }

  private async send(
    method: string,
    path: string,
    options: RequestOptions,
  ): Promise<Answer> {
    const headers: Record<string, string> = { ...options.headers };
    if (!options.visitor && this.cookies.size)
      headers.cookie = this.cookieHeader();
    let body: BodyInit | undefined;
    if (options.json !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(options.json);
    } else if (options.file) {
      headers['content-type'] = 'application/octet-stream';
      body = await openAsBlob(options.file);
    }
    const response = await fetch(`${this.origin}${path}`, {
      method,
      headers,
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(options.timeoutMs ?? 2 * 60 * 1000),
    });
    if (!options.visitor) this.keepCookies(response);
    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      parsed = undefined;
    }
    return {
      status: response.status,
      body: parsed,
      text,
      location: response.headers.get('location') ?? undefined,
    };
  }

  /**
   * A request that waits out a restarting server — refused, reset, 502–504,
   * or a 500 a few times — and signs in again on a 403 from an admin route.
   */
  async request<T = any>(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<Answer<T>> {
    const deadline = Date.now() + RESTART_WINDOW_MS;
    let serverErrors = 0;
    let signIns = 0;
    for (;;) {
      let answer: Answer | undefined;
      let failure: unknown;
      try {
        answer = await this.send(method, path, options);
      } catch (error) {
        failure = error;
      }
      const transient =
        !answer ||
        answer.status === 502 ||
        answer.status === 503 ||
        answer.status === 504 ||
        (answer.status >= 500 && ++serverErrors <= 3);
      if (transient) {
        this.lastFailure = `${method} ${path}: ${
          answer
            ? `${answer.status} ${answer.text.replace(/\s+/g, ' ').slice(0, 300)}`
            : describe(failure)
        }`;
        if (Date.now() > deadline)
          throw new SiteError(`${this.lastFailure} — kept failing`);
        this.log(`  … ${this.lastFailure.slice(0, 200)}; waiting for the site`);
        await this.waitOpen(deadline);
        if (options.once) return undefined as unknown as Answer<T>;
        continue;
      }
      if (
        answer!.status === 403 &&
        !options.visitor &&
        path.startsWith('/api/admin/') &&
        this.credentials &&
        signIns++ < 3
      ) {
        this.log(`  … ${method} ${path}: 403; signing in again`);
        await this.signIn();
        continue;
      }
      return answer as Answer<T>;
    }
  }

  async attempt<T = any>(
    method: string,
    path: string,
    options: RequestOptions = {},
  ) {
    return (await this.request<T>(method, path, { ...options, once: true })) as
      Answer<T> | undefined;
  }

  /** Throws with the site's own words unless the answer is a success. */
  ok<T>(
    what: string,
    answer: Answer<T>,
    accept: (answer: Answer<T>) => boolean = (a) => a.status === 200,
  ): Answer<T> {
    if (accept(answer)) return answer;
    const message =
      (answer.body as { message?: string } | undefined)?.message ??
      answer.text.slice(0, 500);
    throw new SiteError(`${what} was refused: ${answer.status} ${message}`);
  }

  /** What the boot says: being installed, open, closed for an update, or down. */
  async state(): Promise<'install' | 'open' | 'closed' | 'down'> {
    try {
      const answer = await this.send('GET', '/api/update/progress', {
        visitor: true,
        timeoutMs: 30_000,
      });
      if (
        answer.status >= 300 &&
        answer.status < 400 &&
        answer.location?.includes('/install/')
      )
        return 'install';
      if (answer.status === 200 && answer.body?.site === 'open') return 'open';
      if (answer.status === 200) return 'closed';
      return 'down';
    } catch {
      return 'down';
    }
  }

  async waitOpen(
    deadline = Date.now() + RESTART_WINDOW_MS,
  ): Promise<'install' | 'open'> {
    let last = '';
    for (;;) {
      const state = await this.state();
      if (state === 'open' || state === 'install') return state;
      if (Date.now() > deadline)
        throw new SiteError(
          `The site at ${this.origin} did not open (last seen: ${state}).`,
        );
      if (state !== last)
        this.log(
          `  … the site is ${state === 'down' ? 'not answering' : 'closed'}; waiting`,
        );
      last = state;
      await sleep(1500);
    }
  }

  async signIn() {
    const credentials = this.credentials;
    if (!credentials) throw new SiteError('No credentials to sign in with.');
    this.cookies.clear();
    for (let attempt = 0; attempt < 10; attempt++) {
      const answer = await this.request('POST', '/api/admin/session', {
        json: {
          secretPhrase: credentials.secretPhrase,
          password: credentials.password,
        },
      });
      if (answer.status === 200 && answer.body?.type === 'success') return;
      if (answer.status === 302 && this.cookies.size) return;
      const message = String(answer.body?.message ?? answer.text).slice(0, 200);
      if (answer.status === 200 && attempt < 9 && isRateLimited(message)) {
        await sleep(3500);
        continue;
      }
      throw new SiteError(
        `Signing in was refused (${answer.status}: ${message}).`,
      );
    }
    throw new SiteError('Signing in kept being rate-limited.');
  }
}

/** Runs `work` over `items`, `limit` at a time. */
export async function inPool<T>(
  items: T[],
  limit: number,
  work: (item: T, index: number) => Promise<void>,
) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        await work(items[index]!, index);
      }
    }),
  );
}

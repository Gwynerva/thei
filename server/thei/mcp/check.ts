import { count } from 'drizzle-orm';
import type { H3Event } from 'h3';
import type { AiCheckReport, AiCheckStep } from '#layers/thei/shared/ai-check';
import { listApiTokens } from '../api-tokens';
import { siteUrl } from '../site-url';
import { inProcessMcp } from './inprocess';
import { oauthAvailable, oauthIssuer } from '../oauth/base';

/**
 * Tries what an MCP client does, from the site itself: the handshake of
 * either protocol era, listing the tools, a read, and the public address
 * answering through whatever proxy stands in front. What a client would
 * stumble on shows here first. Given an access key, it goes as that key —
 * with its rights, so the tools are the ones an app holding it sees — and
 * says when the key was last used.
 */
export async function checkAiConnection(
  event: H3Event,
  tokenUuid?: string,
): Promise<AiCheckReport> {
  const key = tokenUuid
    ? listApiTokens().find((token) => token.tokenUuid === tokenUuid)
    : undefined;
  if (tokenUuid && !key) throw new Error('No such access key');
  const endpoint = siteUrl(event, '/api/mcp');
  const steps: AiCheckStep[] = [];
  const enabled = THEI_SERVER.config.mcp.enabled;
  steps.push({ id: 'enabled', status: enabled ? 'ok' : 'fail' });

  const context = {
    event,
    principal: key
      ? { tokenUuid: key.tokenUuid, label: key.label, scopes: key.scopes }
      : {
          tokenUuid: 'check',
          label: 'Connection check',
          scopes: ['read' as const],
        },
  };
  const rpc = inProcessMcp(context, 'thei-check');

  try {
    const handshake = await rpc(
      'initialize',
      {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'thei-check', version: '1' },
      },
      true,
    );
    steps.push(
      handshake?.result?.protocolVersion
        ? {
            id: 'handshake',
            status: 'ok',
            data: { version: handshake.result.protocolVersion },
          }
        : { id: 'handshake', status: 'fail' },
    );
  } catch (error) {
    steps.push({
      id: 'handshake',
      status: 'fail',
      data: { error: String(error) },
    });
  }

  try {
    const tools = await rpc('tools/list');
    const count = tools?.result?.tools?.length ?? 0;
    steps.push({ id: 'tools', status: count ? 'ok' : 'fail', data: { count } });
  } catch (error) {
    steps.push({ id: 'tools', status: 'fail', data: { error: String(error) } });
  }

  try {
    const overview = await rpc('tools/call', {
      name: 'site_overview',
      arguments: {},
    });
    const answered =
      overview?.result && !overview.result.isError && !overview.error;
    if (answered) {
      // What a client reading the archive would find in it.
      const { db, schema } = THEI_SERVER.useDb();
      const total = (table: any) =>
        db.select({ value: count() }).from(table).get()!.value;
      steps.push({
        id: 'read',
        status: 'ok',
        data: {
          projects: total(schema.projects),
          events: total(schema.events),
          diaryEntries: total(schema.diaryEntries),
        },
      });
    } else steps.push({ id: 'read', status: 'fail' });
  } catch (error) {
    steps.push({ id: 'read', status: 'fail', data: { error: String(error) } });
  }

  // From outside, as a client reaches it: an answer asking for a token
  // proves the address, the proxy and the switch are all right.
  if (!enabled) steps.push({ id: 'public', status: 'skip' });
  else
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(5000),
      });
      steps.push(
        response.status === 401 && response.headers.get('www-authenticate')
          ? { id: 'public', status: 'ok' }
          : { id: 'public', status: 'fail', data: { status: response.status } },
      );
    } catch (error) {
      // A server often cannot reach its own public address from inside;
      // that alone says nothing about clients outside.
      steps.push({
        id: 'public',
        status: 'warn',
        data: { error: error instanceof Error ? error.message : String(error) },
      });
    }

  const url = new URL(endpoint);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  steps.push({
    id: 'https',
    status: url.protocol === 'https:' ? 'ok' : local ? 'skip' : 'warn',
  });

  // Signing in, found where an app looks for it: at the host's root, with
  // the site's path after it — which a site in a subfolder needs its proxy
  // to send on.
  if (!oauthAvailable(event))
    steps.push({ id: 'signin', status: enabled ? 'warn' : 'skip' });
  else {
    const issuer = new URL(`${oauthIssuer(event)}/`);
    const where = `${issuer.origin}/.well-known/oauth-authorization-server${issuer.pathname.replace(/\/$/, '')}`;
    try {
      const response = await fetch(where, {
        signal: AbortSignal.timeout(5000),
      });
      const body = response.ok
        ? ((await response.json().catch(() => null)) as {
            issuer?: string;
          } | null)
        : null;
      steps.push(
        body?.issuer === oauthIssuer(event)
          ? { id: 'signin', status: 'ok' }
          : { id: 'signin', status: 'fail', data: { where } },
      );
    } catch (error) {
      steps.push({
        id: 'signin',
        status: 'warn',
        data: {
          where,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  const used = (key ? [key] : listApiTokens())
    .filter((token) => token.lastUsedAt)
    .sort((a, b) => b.lastUsedAt! - a.lastUsedAt!);
  const latest = used[0];
  steps.push(
    latest
      ? {
          id: 'clients',
          status: 'ok',
          data: {
            label: latest.label,
            client: latest.lastClient ?? '',
            at: latest.lastUsedAt!,
          },
        }
      : { id: 'clients', status: 'warn' },
  );

  return { endpoint, steps };
}

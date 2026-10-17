import { and, desc, eq, gte, isNull } from 'drizzle-orm';
import type { McpCallContext } from '../../mcp/context';
import { McpToolError } from '../../mcp/result';
import { createSession, findSession, type SessionRow } from './store';

/**
 * Sessions of apps over MCP. An app may open one of its own (`open_session`)
 * and name it in what it proposes; one that does not has its work gathered
 * by its key and the name it gives itself, a new session after half an hour
 * of quiet. Thei's own model works in the session it was started in.
 */

/** Quiet longer than this, an app's next proposal starts a new session. */
export const APP_SESSION_GAP_MS = 30 * 60 * 1000;

/** The name an app goes by: what it said of itself, else what its key last saw. */
export function appClientOf(context: McpCallContext): string | null {
  if (context.client) return context.client;
  const { db, schema } = THEI_SERVER.useDb();
  return (
    db
      .select({ lastClient: schema.apiTokens.lastClient })
      .from(schema.apiTokens)
      .where(eq(schema.apiTokens.tokenUuid, context.principal.tokenUuid))
      .get()?.lastClient ?? null
  );
}

/** Opens a session of the app's own. */
export function openAppSession(
  context: McpCallContext,
  title: string,
  now = Date.now(),
): string {
  return createSession(
    {
      origin: 'app',
      title: title.replace(/\s+/g, ' ').trim().slice(0, 200),
      tokenUuid: context.principal.tokenUuid,
      client: appClientOf(context) ?? undefined,
    },
    now,
  );
}

/** Whether a session is one this call may work in. */
function ownSession(context: McpCallContext, session: SessionRow) {
  return (
    session.origin === 'app' &&
    session.tokenUuid === context.principal.tokenUuid
  );
}

/**
 * The session a call works in: the one it runs in, the one it names, or
 * the app's own of the last half hour — a new one when there is none.
 */
export function sessionForCall(
  context: McpCallContext,
  named?: string,
  now = Date.now(),
): string {
  if (context.session) return context.session.sessionUuid;
  if (named) {
    const session = findSession(named);
    if (!session || !ownSession(context, session))
      throw new McpToolError(
        `There is no session ${named} of this key: open one with open_session, or leave session out.`,
      );
    if (session.closedAt)
      throw new McpToolError(
        `The owner archived the session ${named}: open a new one with open_session.`,
      );
    return session.sessionUuid;
  }
  const { db, schema } = THEI_SERVER.useDb();
  const client = appClientOf(context);
  const recent = db
    .select({ sessionUuid: schema.aiSessions.sessionUuid })
    .from(schema.aiSessions)
    .where(
      and(
        eq(schema.aiSessions.origin, 'app'),
        eq(schema.aiSessions.tokenUuid, context.principal.tokenUuid),
        client === null
          ? isNull(schema.aiSessions.client)
          : eq(schema.aiSessions.client, client),
        isNull(schema.aiSessions.closedAt),
        gte(schema.aiSessions.lastActiveAt, now - APP_SESSION_GAP_MS),
      ),
    )
    .orderBy(desc(schema.aiSessions.lastActiveAt))
    .get();
  return recent?.sessionUuid ?? openAppSession(context, '', now);
}

/** The app's sessions, its latest first: what `session_actions` reads by default. */
export function latestAppSession(context: McpCallContext): string | undefined {
  if (context.session) return context.session.sessionUuid;
  const { db, schema } = THEI_SERVER.useDb();
  return db
    .select({ sessionUuid: schema.aiSessions.sessionUuid })
    .from(schema.aiSessions)
    .where(
      and(
        eq(schema.aiSessions.origin, 'app'),
        eq(schema.aiSessions.tokenUuid, context.principal.tokenUuid),
      ),
    )
    .orderBy(desc(schema.aiSessions.lastActiveAt))
    .get()?.sessionUuid;
}

/** Whether a session named by an app is its own, to read. */
export function readableSession(
  context: McpCallContext,
  sessionUuid: string,
): boolean {
  if (context.session?.sessionUuid === sessionUuid) return true;
  const session = findSession(sessionUuid);
  return Boolean(session && ownSession(context, session));
}

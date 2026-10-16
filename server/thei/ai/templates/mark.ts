import { and, eq } from 'drizzle-orm';
import type { AiMessagePart } from '#layers/thei/shared/ai';
import { sessionActions } from '../actions/rows';
import { findSession, sessionMessages, updateSession } from '../sessions/store';
import { markRead, takeTemplateReads } from './reads';

/**
 * A turn of a template's session is over. Gone through, what its model read
 * is kept as the template's own; failed, it is let go for the next run. A
 * run its schedule started that left nothing to decide — no action, no
 * question — goes straight to the archive: the template's history keeps it,
 * the list of sessions does not.
 */
export function settleTemplateTurn(
  sessionUuid: string,
  wentThrough: boolean,
  now = Date.now(),
) {
  const reads = takeTemplateReads(sessionUuid);
  const session = findSession(sessionUuid);
  if (!session?.templateId || session.origin !== 'template') return;
  const messages = sessionMessages(sessionUuid);
  const parts = messages.flatMap((message) => message.parts as AiMessagePart[]);
  if (!wentThrough) {
    // The run's own turn failed: it read nothing for good, so «since the
    // last run» stays since the run before it, unless a later run started.
    // A later turn, the owner's, leaves the run as it went.
    const turns = messages.filter((message) => message.role === 'model');
    if (turns.length !== 1) return;
    const run = parts.find((part) => part.type === 'template');
    const { db, schema } = THEI_SERVER.useDb();
    db.update(schema.aiTemplates)
      .set({
        lastRunAt: run?.type === 'template' ? (run.since ?? null) : null,
      })
      .where(
        and(
          eq(schema.aiTemplates.templateId, session.templateId),
          eq(schema.aiTemplates.lastSessionUuid, sessionUuid),
        ),
      )
      .run();
    return;
  }
  markRead(session.templateId, reads, now);

  const scheduled = parts.some(
    (part) => part.type === 'template' && part.by === 'schedule',
  );
  const owner = messages.some((message) => message.role === 'owner');
  const asked = parts.some((part) => part.type === 'question');
  if (scheduled && !owner && !asked && !sessionActions(sessionUuid).length)
    updateSession(sessionUuid, { archivedAt: now });
}

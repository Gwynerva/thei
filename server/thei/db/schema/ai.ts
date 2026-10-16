import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import type { AiTemplateOfferKind } from '#layers/thei/shared/ai-template';
import type {
  AiActionState,
  AiAppliedBy,
  AiCertainty,
  AiEntityType,
  AiMemoryAnchor,
  AiMemoryType,
  AiMessagePart,
  AiMessageRole,
  AiSessionOrigin,
  AiSessionState,
  AiTranscriptTurn,
} from '#layers/thei/shared/ai';

/**
 * What the site's model spent, a row a day on the server's clock: the
 * limit the owner sets is counted from it. Kept about a year.
 */
export const aiUsage = sqliteTable('ai-usage', {
  day: text().primaryKey(),
  inputTokens: integer().notNull().default(0),
  outputTokens: integer().notNull().default(0),
  cacheReadTokens: integer().notNull().default(0),
  cacheWriteTokens: integer().notNull().default(0),
  calls: integer().notNull().default(0),
});

/**
 * AI sessions: conversations about the archive. The owner starts one, a
 * template starts one on its schedule, an app over MCP leaves one. A session
 * keeps what was said and every action proposed in it; closed or quiet for a
 * week it goes to the archive, and a month later it is deleted unless pinned —
 * its summary is what other sessions read of it.
 *
 * The counts are kept on the row, so the list groups and filters sessions
 * without reading their actions.
 */
export const aiSessions = sqliteTable(
  'ai-sessions',
  {
    sessionUuid: text().primaryKey(),
    title: text().notNull().default(''),
    origin: text().notNull().$type<AiSessionOrigin>(),
    /** The access key of an app's session. */
    tokenUuid: text(),
    /** The app's own name for itself, as it introduced itself over MCP. */
    client: text(),
    templateId: text(),
    /** The model that answered, as the service names it. */
    model: text(),
    state: text().notNull().default('idle').$type<AiSessionState>(),
    pinned: integer({ mode: 'boolean' }).notNull().default(false),
    /** Actions waiting for the owner, and questions not yet answered. */
    waiting: integer().notNull().default(0),
    applied: integer().notNull().default(0),
    rejected: integer().notNull().default(0),
    /** A few lines on what was asked and done, kept past the session. */
    summary: text().notNull().default(''),
    /** What the model spent in it, as the limits count. */
    tokens: integer().notNull().default(0),
    /** Why the last turn failed, until the next one. */
    error: text(),
    createdAt: integer().notNull(),
    lastActiveAt: integer().notNull(),
    closedAt: integer(),
    archivedAt: integer(),
    /**
     * Deleted after its month in the archive: what was said and proposed is
     * gone, its title, summary and the entities it concerned stay.
     */
    purgedAt: integer(),
  },
  (t) => [
    index('ai-sessions-active-idx').on(t.archivedAt, t.lastActiveAt),
    index('ai-sessions-app-idx').on(t.tokenUuid, t.client, t.lastActiveAt),
    index('ai-sessions-template-idx').on(t.templateId, t.createdAt),
    index('ai-sessions-waiting-idx').on(t.waiting),
  ],
);

/**
 * What was said in a session, in order. `text` is editing Markdown, links to
 * entities included; `parts` carry a question, the steps a model took or the
 * session's own notice; `transcript` is the turn as the model saw it, tool
 * calls and answers included, so the conversation can go on.
 */
export const aiMessages = sqliteTable(
  'ai-messages',
  {
    messageUuid: text().primaryKey(),
    sessionUuid: text().notNull(),
    seq: integer().notNull(),
    role: text().notNull().$type<AiMessageRole>(),
    text: text().notNull().default(''),
    parts: text({ mode: 'json' })
      .notNull()
      .default([])
      .$type<AiMessagePart[]>(),
    transcript: text({ mode: 'json' })
      .notNull()
      .default([])
      .$type<AiTranscriptTurn[]>(),
    tokens: integer().notNull().default(0),
    createdAt: integer().notNull(),
  },
  (t) => [uniqueIndex('ai-messages-seq-idx').on(t.sessionUuid, t.seq)],
);

/**
 * Every action proposed in a session, and what became of it.
 *
 * Actions proposed together are a bundle, applied in `bundleOrder`; an atomic
 * bundle is applied whole or not at all. `base` is what the action was made
 * against — versions and values — so it can tell when the entity moved on
 * another way; `undo` is what taking it back needs, kept while the session
 * lives. A comment answered with a new version leaves the old one
 * `superseded`, pointed at by the new one's `supersedes`.
 */
export const aiActions = sqliteTable(
  'ai-actions',
  {
    actionUuid: text().primaryKey(),
    sessionUuid: text().notNull(),
    messageUuid: text(),
    bundleUuid: text(),
    bundleOrder: integer().notNull().default(0),
    atomic: integer({ mode: 'boolean' }).notNull().default(false),
    kind: text().notNull(),
    targetType: text().$type<AiEntityType>(),
    targetId: text(),
    payload: text({ mode: 'json' }).notNull().$type<unknown>(),
    /** A text edit's parts and the owner's decision on each. */
    parts: text({ mode: 'json' }).$type<unknown[]>(),
    base: text({ mode: 'json' }).$type<unknown>(),
    certainty: text().notNull().$type<AiCertainty>(),
    reason: text().notNull().default(''),
    state: text().notNull().$type<AiActionState>(),
    supersedes: text(),
    fingerprint: text().notNull(),
    undo: text({ mode: 'json' }).$type<unknown>(),
    /** Files the action brings or frees: held from cleanup while it may apply or undo. */
    assetUuids: text({ mode: 'json' }).notNull().default([]).$type<string[]>(),
    appliedBy: text().$type<AiAppliedBy>(),
    createdAt: integer().notNull(),
    decidedAt: integer(),
    error: text(),
  },
  (t) => [
    index('ai-actions-session-idx').on(t.sessionUuid, t.createdAt),
    index('ai-actions-target-idx').on(t.targetType, t.targetId, t.state),
    index('ai-actions-state-idx').on(t.state),
    index('ai-actions-fingerprint-idx').on(t.fingerprint),
  ],
);

/**
 * Which entities a session is about or touched: what an entity's ✦ lists,
 * and how a session is found by what it concerned.
 */
export const aiSessionEntities = sqliteTable(
  'ai-session-entities',
  {
    sessionUuid: text().notNull(),
    entityType: text().notNull().$type<AiEntityType>(),
    entityId: text().notNull(),
    /** `about`: attached or mentioned by the owner; `touched`: read or acted on. */
    role: text().notNull().$type<'about' | 'touched'>(),
    at: integer().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.sessionUuid, t.entityType, t.entityId] }),
    index('ai-session-entities-entity-idx').on(t.entityType, t.entityId, t.at),
  ],
);

/**
 * What the AI remembers, anchored to what it is about: the owner, an entity,
 * a pair of entities, or every entity of a kind. A model reads a record only
 * together with its anchor. A `never` record is an action the owner said not
 * to offer again, matched by its fingerprint.
 */
export const aiMemory = sqliteTable(
  'ai-memory',
  {
    memoryUuid: text().primaryKey(),
    anchor: text().notNull().$type<AiMemoryAnchor>(),
    /** The entity, or for a kind the kind; empty for the owner. */
    anchorType: text().notNull().default(''),
    anchorId: text().notNull().default(''),
    /** The other end of a pair. */
    otherType: text(),
    otherId: text(),
    type: text().notNull().$type<AiMemoryType>(),
    text: text().notNull(),
    fingerprint: text(),
    /** The session it was remembered in, while that lives. */
    sessionUuid: text(),
    createdAt: integer().notNull(),
    updatedAt: integer().notNull(),
  },
  (t) => [
    index('ai-memory-anchor-idx').on(t.anchor, t.anchorType, t.anchorId),
    index('ai-memory-other-idx').on(t.otherType, t.otherId),
    index('ai-memory-fingerprint-idx').on(t.fingerprint),
  ],
);

/**
 * The dictionary: names, places and the owner's own words. A model reads a
 * word's note only when the word, or one of its forms, is in the text it
 * reads; proofreading never corrects a word kept as written.
 */
export const aiTerms = sqliteTable('ai-terms', {
  /** Lowercase, `ё` as `е`: how a word is looked up. */
  word: text().primaryKey(),
  /** As the owner wrote it. */
  display: text().notNull(),
  note: text().notNull().default(''),
  /** Other forms of the word, as written, matched as the word is. */
  forms: text({ mode: 'json' }).notNull().default([]).$type<string[]>(),
  /** Proofreading leaves it as written. */
  keep: integer({ mode: 'boolean' }).notNull().default(true),
  createdAt: integer().notNull(),
  updatedAt: integer().notNull(),
});

/**
 * A model's own few lines about an entity, kept with a fingerprint of what it
 * read: while the entity reads the same, the lines stand in for the whole.
 */
export const aiDigests = sqliteTable(
  'ai-digests',
  {
    entityType: text().notNull().$type<AiEntityType>(),
    entityId: text().notNull(),
    text: text().notNull(),
    fingerprint: text().notNull(),
    model: text().notNull().default(''),
    at: integer().notNull(),
  },
  (t) => [primaryKey({ columns: [t.entityType, t.entityId] })],
);

/**
 * Session templates: the owner's own, and the owner's settings of the
 * built-in checks (`builtin` names one; its words live in the code).
 */
export const aiTemplates = sqliteTable('ai-templates', {
  templateId: text().primaryKey(),
  builtin: text(),
  title: text(),
  instruction: text(),
  /** The model to use; empty for the one of the connection. */
  model: text().notNull().default(''),
  /** The kinds of entity it is offered on, from their ✦. */
  offerOn: text({ mode: 'json' })
    .notNull()
    .default([])
    .$type<AiTemplateOfferKind[]>(),
  lastSessionUuid: text(),
  createdAt: integer().notNull(),
  updatedAt: integer().notNull(),
});

/**
 * What a built-in check has looked at: each subject — a text, a link, an
 * entity, a file — as it read then, by a fingerprint of what the check reads
 * and, where it looks at less than the whole, the parts it went over (the
 * paragraphs of a text). A subject that reads otherwise now is due again.
 * The entity it belongs to, if any, forgets it when deleted.
 */
export const aiTemplateCoverage = sqliteTable(
  'ai-template-coverage',
  {
    templateId: text().notNull(),
    subject: text().notNull(),
    entityType: text().$type<AiEntityType>(),
    entityId: text(),
    fingerprint: text().notNull(),
    parts: text({ mode: 'json' }).notNull().default([]).$type<string[]>(),
    at: integer().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.templateId, t.subject] }),
    index('ai-template-coverage-entity-idx').on(t.entityType, t.entityId),
  ],
);

/**
 * What a run of a check was given, until its turn is over: gone through, it
 * becomes what the check has looked at; failed, it is let go. Meanwhile no
 * other run is given the same.
 */
export const aiTemplateBatches = sqliteTable(
  'ai-template-batches',
  {
    sessionUuid: text().notNull(),
    templateId: text().notNull(),
    subject: text().notNull(),
    entityType: text().$type<AiEntityType>(),
    entityId: text(),
    fingerprint: text().notNull(),
    parts: text({ mode: 'json' }).notNull().default([]).$type<string[]>(),
  },
  (t) => [
    primaryKey({ columns: [t.sessionUuid, t.subject] }),
    index('ai-template-batches-template-idx').on(t.templateId),
    index('ai-template-batches-entity-idx').on(t.entityType, t.entityId),
  ],
);

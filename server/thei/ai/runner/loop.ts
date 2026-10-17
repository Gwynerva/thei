import type {
  AiMessagePart,
  AiNoticeKind,
  AiStep,
  AiTranscriptTurn,
} from '#layers/thei/shared/ai';
import type { ApiTokenPrincipal } from '../../api-tokens';
import { entityFace, findEntity, refOf } from '../../entity-kinds';
import { MCP_INSTRUCTIONS } from '../../mcp/instructions';
import { FILES_META, REFUSED_META } from '../../mcp/result';
import { directTools, type DirectTool } from '../../mcp/registry';
import { withOwnerInstructions } from '../../mcp/server';
import { ModelError } from '../model/service';
import {
  streamTurn,
  type StreamCall,
  type StreamFile,
  type StreamFileKind,
} from '../model/stream';
import { sessionModel } from '../model/settings';
import {
  countedTokens,
  recordUsage,
  tokensLeft,
  type ModelUsage,
} from '../model/usage';
import { publishSession, setWriting } from '../sessions/bus';
import { makeSessionFile, modelFiles } from '../sessions/files';
import {
  nameSession,
  SESSION_NAME_MAX,
  sessionUnnamed,
} from '../sessions/names';
import { findTemplate } from '../templates/store';
import { settleTemplateTurn } from '../templates/coverage';
import { backgroundEvent } from './background-event';
import { repairTranscript } from './transcript';
import {
  beginTurn,
  endTurn,
  haltOf,
  TookTooLong,
  TURN_LIMITS,
  turnLive,
  within,
  type TurnHalt,
} from './turns';
import {
  addSessionTokens,
  findSession,
  insertMessage,
  refreshSessionCounts,
  sessionAbout,
  sessionMessages,
  touchSession,
  updateMessage,
  updateSession,
} from '../sessions/store';

/**
 * One turn of a session: Thei's own model reads the conversation and
 * answers, calling the site's tools as it goes — reading, searching,
 * proposing — until it has said what it has to say or asked the owner
 * something. Its words are streamed to whoever watches and saved as they
 * come; what it spends is counted against the owner's limit.
 */

/**
 * The key Thei's own model works as, never a real key's id: in each session
 * as a key of its own, `thei:<session>`, so a busy check's run spends no
 * other session's writes a minute.
 */
export const SESSION_TOKEN = 'thei';
/** How many times the model may be called in one turn. */
const MODEL_CALLS = 40;
/**
 * What one turn may spend, in counted tokens: far above what a turn takes,
 * so only a model going round in circles meets it.
 */
const TURN_TOKEN_CAP = 3_000_000;
/**
 * How much of a tool's answer the model is handed: every answer is reread
 * on every later call, so one huge answer costs many times over.
 */
const TOOL_ANSWER_MAX = 30_000;
/** How often the words written so far are saved while they stream. */
const SAVE_EVERY_MS = 800;

/** Read for the model before the turn: it is in the instructions. */
const HIDDEN_TOOLS = new Set(['site_overview']);

/** The one tool only a session has: asking the owner, with choices. */
const ASK_TOOL = {
  name: 'ask_owner',
  description:
    'Asks the owner a question with a few answers to choose from — they may also answer in their own words — and ends your turn: their answer comes as their next message. Ask only what you cannot find out yourself.',
  inputSchema: {
    type: 'object',
    properties: {
      question: { type: 'string' },
      options: {
        type: 'array',
        items: { type: 'string' },
        minItems: 2,
        maxItems: 5,
      },
    },
    required: ['question', 'options'],
  },
};

/**
 * Offered while the session still goes by the owner's first words: the
 * model names it in its first answer.
 */
const NAME_TOOL = {
  name: 'name_session',
  description:
    'Names this session, once: two to five words saying what it is about — not the owner’s first words.',
  inputSchema: {
    type: 'object',
    properties: { name: { type: 'string', maxLength: SESSION_NAME_MAX } },
    required: ['name'],
  },
};

/** A file the owner asked for, made of what the model writes. */
const FILE_TOOL = {
  name: 'make_file',
  description:
    'Makes a file the owner asked for out of what you write: any format, as its name says. It is opened alone, with no files beside it, so whatever it needs goes inside it. It goes into the library, kept in this session, and the owner sees it under your answer. To put it in place, propose that with its id.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'The file name with its extension',
      },
      content: { type: 'string', description: 'The whole file' },
      base64: {
        type: 'boolean',
        description: 'The content is base64 of the bytes, not text',
      },
    },
    required: ['name', 'content'],
  },
};

/** Tools of the conversation itself, not of the site: no step is told of them. */
const OWN_TOOLS = new Set([ASK_TOOL.name, NAME_TOOL.name, FILE_TOOL.name]);

function nameNote(language: string) {
  return `This session has no name yet. In this answer, call ${NAME_TOOL.name} with a short name for it, in ${language}: two to five words saying what it is about.`;
}

function sessionNote(language: string) {
  return `\
You are Thei's own model, in a conversation with the owner on the AI page of their site. Answer in ${language}, briefly.
- You change nothing yourself. What you would change, propose with propose — read a kind with describe_actions before you first propose it — and the owner applies it or not. A proposal the owner commented on comes back as their message: propose a new version of it with supersedes.
- Say in your answer what you proposed and why, in a sentence or two; the owner sees each action beside it.
- When the owner must choose before you can go on, call ask_owner and end your turn.
- Write in editing Markdown: lists, bold, links to entities as [their title](thei:project/<id>) (a diary entry as [its day](thei:diary-entry/YYYY-MM-DD)) and to other sites as [words](https://…). Never a bare ref, never a picture.
- A table may go in your answer as a Markdown table. A file the owner asks for, make with make_file.`;
}

/** What the session is about, named for the model with titles. */
function aboutLines(sessionUuid: string): string {
  const about = sessionAbout(sessionUuid);
  if (!about.length) return '';
  const lines = about.flatMap((item) => {
    const key = findEntity(`${item.type}:${item.id}`);
    if (!key) return [];
    const face = entityFace(key);
    return [`- ${refOf(key)}${face?.title ? ` — ${face.title}` : ''}`];
  });
  return lines.length
    ? `The owner started this session about:\n${lines.join('\n')}`
    : '';
}

/** The refs and the query a tool call names, for the line of steps. */
function stepOf(call: StreamCall, failed: boolean, refused = 0): AiStep {
  const input = (call.input ?? {}) as Record<string, unknown>;
  const refs = new Set<string>();
  for (const value of [input.ref, input.target, input.other])
    if (typeof value === 'string') refs.add(value);
  if (Array.isArray(input.refs))
    for (const value of input.refs)
      if (typeof value === 'string') refs.add(value);
  if (Array.isArray(input.actions))
    for (const action of input.actions as Record<string, unknown>[])
      if (typeof action?.target === 'string') refs.add(action.target);
  const detail =
    typeof input.query === 'string'
      ? input.query
      : typeof input.kind === 'string'
        ? input.kind
        : undefined;
  return {
    tool: call.name,
    ...(refs.size ? { refs: [...refs].slice(0, 20) } : {}),
    ...(detail ? { detail: detail.slice(0, 200) } : {}),
    ...(failed ? { failed: true } : {}),
    ...(refused > 0 ? { refused } : {}),
  };
}

function cutAnswer(text: string) {
  return text.length > TOOL_ANSWER_MAX
    ? `${text.slice(0, TOOL_ANSWER_MAX)}\n\n[Cut off here: ${text.length - TOOL_ANSWER_MAX} more characters. Ask for less at a time.]`
    : text;
}

class TurnStop extends Error {
  constructor(
    readonly kind: AiNoticeKind,
    readonly detail = '',
  ) {
    super(kind);
  }
}

/** The turn was closed while it waited: it goes no further, and writes nothing. */
class TurnClosed extends Error {}

/**
 * How the queue reaches a turn that does not end when stopped: it closes
 * the turn for it, keeping what the turn wrote so far, as stopped or out of
 * time. Set once the turn has begun.
 */
export interface TurnHandle {
  close?: (halt: TurnHalt) => void;
}

/** What ended a turn early, as its notice says; none for Thei's own failure. */
function stopOf(error: unknown, signal: AbortSignal): TurnStop | undefined {
  if (error instanceof TurnStop) return error;
  if (error instanceof ModelError)
    return new TurnStop(error.kind, error.detail);
  if (signal.aborted) return new TurnStop(haltOf(signal));
  return undefined;
}

/** A tool call that took too long, as the model is told of it. */
function tookTooLong(name: string) {
  return {
    text: `${name} took longer than ${Math.round(TURN_LIMITS.toolMs / 1000)} s and was left; nothing it would still do is kept. Ask for less at a time.`,
    error: true,
  };
}

/**
 * Runs one turn of a session: the model answers the conversation so far.
 * Never throws; whatever stops it is said in the session as a notice. A
 * turn stopped while it waits ends at once; one that does not is closed
 * for it through `handle`, and whatever it gets after that is dropped.
 */
export async function runSessionTurn(
  sessionUuid: string,
  signal: AbortSignal,
  handle: TurnHandle = {},
): Promise<void> {
  /** Writes what the turn leaves, once: set once the turn has begun. */
  let close: ((stop?: TurnStop) => void) | undefined;
  try {
    const session = findSession(sessionUuid);
    if (!session) return;
    const { db, schema } = THEI_SERVER.useDb();
    /** Still going by the owner's first words: the model names it now. */
    const unnamed = sessionUnnamed(session);
    // A template's session is answered with the template's own model, if it
    // names one.
    const settings = sessionModel(
      session.templateId ? findTemplate(session.templateId)?.model : undefined,
    );
    const said = sessionMessages(sessionUuid);
    // A turn the last process left half-done is put right before it is
    // read again.
    const history = repairTranscript(
      said.flatMap((message) => message.transcript),
    );
    /** What the owner's files were called, for a model shown them. */
    const fileNames = new Map(
      said.flatMap((message) =>
        message.parts.flatMap((part) =>
          part.type === 'file' ? [[part.assetUuid, part.name] as const] : [],
        ),
      ),
    );
    const message = db.transaction((tx) =>
      insertMessage(tx, schema, sessionUuid, { role: 'model' }),
    );
    const messageUuid = message.messageUuid;
    beginTurn(sessionUuid, messageUuid);
    updateSession(sessionUuid, {
      state: 'running',
      error: null,
      ...(settings ? { model: settings.model } : {}),
    });
    publishSession(sessionUuid, { type: 'message', messageUuid });
    publishSession(sessionUuid, { type: 'session' });

    let text = '';
    const steps: AiStep[] = [];
    const parts: AiMessagePart[] = [];
    const transcript: AiTranscriptTurn[] = [];
    let spent = 0;
    let savedAt = 0;
    let closed = false;
    const live = () => !closed && turnLive(sessionUuid, messageUuid);
    /** After every wait: a turn closed meanwhile goes no further. */
    const going = () => {
      if (closed) throw new TurnClosed();
    };
    const partsNow = (): AiMessagePart[] => [
      ...(steps.length ? [{ type: 'steps' as const, steps: [...steps] }] : []),
      ...parts,
    ];
    const save = () => {
      updateMessage(messageUuid, {
        text,
        parts: partsNow(),
        transcript,
        tokens: spent,
      });
      setWriting(messageUuid, null);
      publishSession(sessionUuid, { type: 'message', messageUuid });
    };
    close = (stop) => {
      if (closed) return;
      closed = true;
      endTurn(sessionUuid, messageUuid);
      if (stop)
        parts.push({
          type: 'notice',
          kind: stop.kind,
          text: stop.detail.slice(0, 500),
        });
      // A call asked for and never answered would leave the conversation
      // unable to go on: each gets its answer.
      transcript.splice(0, transcript.length, ...repairTranscript(transcript));
      save();
      updateSession(sessionUuid, {
        state: 'idle',
        ...(stop && stop.kind !== 'stopped' ? { error: stop.kind } : {}),
      });
      db.transaction((tx) => {
        touchSession(tx, schema, sessionUuid);
        refreshSessionCounts(tx, schema, sessionUuid);
      });
      // What a check's run was given counts as looked at once its turn
      // went through, and is let go either way.
      try {
        settleTemplateTurn(sessionUuid, !stop);
      } catch {
        THEI_SERVER.console
          .tag('MCP')
          .error('Failed to settle what a check’s run was given');
      }
      publishSession(sessionUuid, { type: 'session' });
    };
    handle.close = (halt) => close?.(new TurnStop(halt));

    if (!settings) throw new TurnStop('no-model');
    const principal: ApiTokenPrincipal = {
      tokenUuid: `${SESSION_TOKEN}:${sessionUuid}`,
      label: 'Thei',
      scopes: ['read'],
    };
    const all = directTools({
      event: backgroundEvent(),
      principal,
      session: { sessionUuid, messageUuid, live, signal },
    });
    // The overview is read for the model, unless it takes too long: then
    // the model may read it itself.
    const overview = await within(
      all.find((tool) => tool.name === 'site_overview')!.call({}, { signal }),
      signal,
      TURN_LIMITS.toolMs,
    ).catch((error: unknown) => {
      if (error instanceof TookTooLong) return undefined;
      throw error;
    });
    going();
    const tools = new Map<string, DirectTool>(
      all
        .filter((tool) => !overview || !HIDDEN_TOOLS.has(tool.name))
        .map((tool) => [tool.name, tool]),
    );
    const system = [
      // The overview says the owner's instructions itself: read for the
      // model, they are not said twice.
      overview ? MCP_INSTRUCTIONS : withOwnerInstructions(MCP_INSTRUCTIONS),
      sessionNote(THEI_SERVER.phrase.language_name),
      overview
        ? `What site_overview says, read for you:\n\n${overview.content
            .map((part) => ('text' in part ? part.text : ''))
            .join('\n')}`
        : '',
      aboutLines(sessionUuid),
      unnamed ? nameNote(THEI_SERVER.phrase.language_name) : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    /**
     * The files these turns show, made ready within the time a tool call
     * has; ones that take longer are told of in words alone.
     */
    const readyFiles = (turns: readonly { role: string; files?: string[] }[]) =>
      within(
        modelFiles(turns, fileNames, signal),
        signal,
        TURN_LIMITS.toolMs,
      ).catch((error: unknown) => {
        if (!(error instanceof TookTooLong)) throw error;
        THEI_SERVER.console
          .tag('AI')
          .warn('The files of a session took too long to make ready.');
        return new Map<string, StreamFile[]>();
      });
    const files = await readyFiles(history);
    going();
    /** Kinds of a file's blocks the model's service turned away. */
    let unshown = new Set<StreamFileKind>();
    const offered = [
      ...[...tools.values()].map(({ name, description, inputSchema }) => ({
        name,
        description,
        inputSchema,
      })),
      ASK_TOOL,
      FILE_TOOL,
      ...(unnamed ? [NAME_TOOL] : []),
    ];

    /**
     * What a call spent is spent, whatever became of the call or the turn:
     * counted against the month's limit and the session's at once — one
     * cut short too, and one that answers after the turn was closed.
     */
    const spend = (usage: ModelUsage) => {
      recordUsage(usage);
      const counted = countedTokens(usage);
      spent += counted;
      addSessionTokens(sessionUuid, counted);
    };

    for (let call = 0; ; call++) {
      if (call >= MODEL_CALLS) throw new TurnStop('turns');
      if (!THEI_SERVER.config.mcp.enabled || !sessionModel())
        throw new TurnStop('no-model');
      if (tokensLeft() <= 0) throw new TurnStop('limit');
      if (spent > TURN_TOKEN_CAP) throw new TurnStop('turns');
      if (signal.aborted) throw new TurnStop(haltOf(signal));
      // Words of a later call stand apart from those before them.
      const before = text.length;
      const separator = text ? '\n\n' : '';
      let first = true;
      const turn = await streamTurn({
        settings,
        system,
        turns: [...history, ...transcript],
        files,
        unshown,
        tools: offered,
        signal,
        onUsage: spend,
        onText(delta) {
          if (closed) return;
          const piece = first ? separator + delta : delta;
          first = false;
          const at = text.length;
          text += piece;
          setWriting(messageUuid, text);
          publishSession(sessionUuid, {
            type: 'delta',
            messageUuid,
            text: piece,
            at,
          });
          if (Date.now() - savedAt > SAVE_EVERY_MS) {
            savedAt = Date.now();
            updateMessage(messageUuid, { text });
          }
        },
      });
      going();
      // What came streamed is what the provider gave in the end.
      text = text.slice(0, before) + (turn.text ? separator + turn.text : '');
      unshown = turn.unshown;
      // An answer with neither words nor calls is kept out of the
      // conversation: no service takes an empty turn back.
      if (turn.text || turn.calls.length)
        transcript.push({
          role: 'assistant',
          text: turn.text,
          ...(turn.calls.length
            ? {
                calls: turn.calls.map(({ id, name, input }) => ({
                  id,
                  name,
                  input,
                })),
              }
            : {}),
          ...(turn.native ? { native: turn.native } : {}),
        });
      if (turn.stop === 'refusal') throw new TurnStop('refused');
      if (!turn.calls.length) {
        // Words cut off at the most a model may write say so; calls cut
        // off are told to the model, which makes them again.
        if (turn.stop === 'length') throw new TurnStop('length');
        break;
      }

      let asked = false;
      for (const call of turn.calls) {
        if (signal.aborted) throw new TurnStop(haltOf(signal));
        const answer = async (): Promise<{
          text: string;
          error: boolean;
          refused?: number;
          /** Library files the tool showed. */
          files?: string[];
        }> => {
          if (call.broken) return { text: call.broken, error: true };
          if (call.name === NAME_TOOL.name)
            return {
              text: nameSession(
                sessionUuid,
                (call.input as { name?: unknown } | undefined)?.name,
                live,
              ),
              error: false,
            };
          if (call.name === FILE_TOOL.name) {
            // A file that takes too long is left, and places nothing.
            const left = new AbortController();
            const made = await within(
              makeSessionFile(
                sessionUuid,
                (call.input ?? {}) as Record<string, unknown>,
                live,
                AbortSignal.any([signal, left.signal]),
              ),
              signal,
              TURN_LIMITS.toolMs,
            ).catch((error: unknown) => {
              if (!(error instanceof TookTooLong)) throw error;
              left.abort();
              return undefined;
            });
            if (!made) return tookTooLong(call.name);
            if ('refused' in made) return { text: made.refused, error: true };
            parts.push({ type: 'file', ...made.file });
            return {
              text: `Made «${made.file.name}» as ${made.file.assetUuid}; the owner sees it under your answer.`,
              error: false,
            };
          }
          if (call.name === ASK_TOOL.name) {
            const input = (call.input ?? {}) as {
              question?: unknown;
              options?: unknown;
            };
            const options = Array.isArray(input.options)
              ? input.options
                  .filter(
                    (option): option is string => typeof option === 'string',
                  )
                  .map((option) => option.trim().slice(0, 200))
                  .filter(Boolean)
                  .slice(0, 5)
              : [];
            if (typeof input.question !== 'string' || options.length < 2)
              return {
                text: 'A question needs its words and two to five answers.',
                error: true,
              };
            parts.push({
              type: 'question',
              text: input.question.trim().slice(0, 1000),
              options,
            });
            asked = true;
            return {
              text: 'Asked. End your turn now: the answer comes as the owner’s next message.',
              error: false,
            };
          }
          const tool = tools.get(call.name);
          if (!tool)
            return { text: `There is no tool ${call.name} here.`, error: true };
          // A call left for taking too long hears it was, and may stop too.
          const left = new AbortController();
          const result = await within(
            tool.call(call.input, {
              signal: AbortSignal.any([signal, left.signal]),
            }),
            signal,
            TURN_LIMITS.toolMs,
          ).catch((error: unknown) => {
            if (!(error instanceof TookTooLong)) throw error;
            left.abort();
            return undefined;
          });
          if (!result) return tookTooLong(call.name);
          const refused = result._meta?.[REFUSED_META];
          const shown = result._meta?.[FILES_META];
          return {
            refused: typeof refused === 'number' ? refused : 0,
            ...(Array.isArray(shown) && shown.length
              ? { files: shown.filter((id) => typeof id === 'string') }
              : {}),
            text: cutAnswer(
              result.content
                .map((part) => ('text' in part ? part.text : ''))
                .join('\n'),
            ),
            error: Boolean(result.isError),
          };
        };
        const result = await answer();
        going();
        if (!OWN_TOOLS.has(call.name))
          steps.push(stepOf(call, result.error, result.refused));
        transcript.push({
          role: 'tool',
          id: call.id,
          name: call.name,
          output: result.text,
          ...(result.error ? { error: true } : {}),
          ...(result.files ? { files: result.files } : {}),
        });
        // What a tool showed is made ready for the model's next call.
        if (result.files) {
          for (const [id, blocks] of await readyFiles([
            { role: 'tool', files: result.files },
          ]))
            files.set(id, blocks);
          going();
        }
        save();
      }
      if (asked) break;
    }
  } catch (error) {
    if (error instanceof TurnClosed) return;
    const stop = stopOf(error, signal);
    if (!stop)
      THEI_SERVER.console.error(
        '[AI] A session turn failed:',
        error instanceof Error ? (error.stack ?? error.message) : error,
      );
    if (close)
      close(stop ?? new TurnStop('error', 'Thei could not finish this turn.'));
    else {
      updateSession(sessionUuid, { state: 'idle' });
      publishSession(sessionUuid, { type: 'session' });
    }
    return;
  }
  close?.();
}

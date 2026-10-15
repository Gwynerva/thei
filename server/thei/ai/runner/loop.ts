import type {
  AiMessagePart,
  AiNoticeKind,
  AiStep,
  AiTranscriptTurn,
} from '#layers/thei/shared/ai';
import type { ApiTokenPrincipal } from '../../api-tokens';
import { entityFace, findEntity, refOf } from '../../entity-kinds';
import { MCP_INSTRUCTIONS } from '../../mcp/instructions';
import { REFUSED_META } from '../../mcp/result';
import { directTools, type DirectTool } from '../../mcp/registry';
import { withOwnerInstructions } from '../../mcp/server';
import { ModelError, streamTurn, type StreamCall } from '../model/stream';
import { sessionModel } from '../model/settings';
import { countedTokens, recordUsage, tokensLeft } from '../model/usage';
import { publishSession, setWriting } from '../sessions/bus';
import { makeSessionFile, modelFiles } from '../sessions/files';
import {
  nameSession,
  SESSION_NAME_MAX,
  sessionUnnamed,
} from '../sessions/names';
import { findTemplate } from '../templates/store';
import { settleTemplateTurn } from '../templates/mark';
import { backgroundEvent } from './background-event';
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

/** The key Thei's own model works as. Never a real key's id. */
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
    'Makes a file the owner asked for out of what you write: any format, as its name says. It goes into the library, kept in this session, and the owner sees it under your answer. To put it in place, propose that with its id.',
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

/**
 * Runs one turn of a session: the model answers the conversation so far.
 * Never throws; whatever stops it is said in the session as a notice.
 */
export async function runSessionTurn(
  sessionUuid: string,
  signal: AbortSignal,
): Promise<void> {
  const session = findSession(sessionUuid);
  if (!session || session.purgedAt) return;
  const { db, schema } = THEI_SERVER.useDb();
  /** Still going by the owner's first words: the model names it now. */
  const unnamed = sessionUnnamed(session);
  // A template's session is answered with the template's own model, if it
  // names one.
  const settings = sessionModel(
    session.templateId ? findTemplate(session.templateId)?.model : undefined,
  );
  const said = sessionMessages(sessionUuid);
  const history: AiTranscriptTurn[] = said.flatMap(
    (message) => message.transcript,
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
  updateSession(sessionUuid, {
    state: 'running',
    error: null,
    ...(settings ? { model: settings.model } : {}),
  });
  publishSession(sessionUuid, {
    type: 'message',
    messageUuid: message.messageUuid,
  });
  publishSession(sessionUuid, { type: 'session' });

  let text = '';
  const steps: AiStep[] = [];
  const parts: AiMessagePart[] = [];
  const transcript: AiTranscriptTurn[] = [];
  let spent = 0;
  let savedAt = 0;
  const partsNow = (): AiMessagePart[] => [
    ...(steps.length ? [{ type: 'steps' as const, steps: [...steps] }] : []),
    ...parts,
  ];
  const save = () => {
    updateMessage(message.messageUuid, {
      text,
      parts: partsNow(),
      transcript,
      tokens: spent,
    });
    setWriting(message.messageUuid, null);
    publishSession(sessionUuid, {
      type: 'message',
      messageUuid: message.messageUuid,
    });
  };

  try {
    if (!settings) throw new TurnStop('no-model');
    const principal: ApiTokenPrincipal = {
      tokenUuid: SESSION_TOKEN,
      label: 'Thei',
      scopes: ['read'],
    };
    const context = {
      event: backgroundEvent(),
      principal,
      session: { sessionUuid, messageUuid: message.messageUuid },
    };
    const all = directTools(context);
    const tools = new Map<string, DirectTool>(
      all
        .filter((tool) => !HIDDEN_TOOLS.has(tool.name))
        .map((tool) => [tool.name, tool]),
    );
    const overview = await all
      .find((tool) => tool.name === 'site_overview')!
      .call({});
    const system = [
      withOwnerInstructions(MCP_INSTRUCTIONS),
      sessionNote(THEI_SERVER.phrase.language_name),
      `What site_overview says, read for you:\n\n${overview.content
        .map((part) => ('text' in part ? part.text : ''))
        .join('\n')}`,
      aboutLines(sessionUuid),
      unnamed ? nameNote(THEI_SERVER.phrase.language_name) : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    const files = await modelFiles(history, fileNames);
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

    for (let call = 0; ; call++) {
      if (call >= MODEL_CALLS) throw new TurnStop('turns');
      if (!THEI_SERVER.config.mcp.enabled || !sessionModel())
        throw new TurnStop('no-model');
      if (tokensLeft() <= 0) throw new TurnStop('limit');
      if (spent > TURN_TOKEN_CAP) throw new TurnStop('turns');
      if (signal.aborted) throw new TurnStop('stopped');
      // Words of a later call stand apart from those before them.
      const before = text.length;
      const separator = text ? '\n\n' : '';
      let first = true;
      const turn = await streamTurn({
        settings,
        system,
        turns: [...history, ...transcript],
        files,
        tools: offered,
        signal,
        onText(delta) {
          const piece = first ? separator + delta : delta;
          first = false;
          const at = text.length;
          text += piece;
          setWriting(message.messageUuid, text);
          publishSession(sessionUuid, {
            type: 'delta',
            messageUuid: message.messageUuid,
            text: piece,
            at,
          });
          if (Date.now() - savedAt > SAVE_EVERY_MS) {
            savedAt = Date.now();
            updateMessage(message.messageUuid, { text });
          }
        },
      });
      // What came streamed is what the provider gave in the end.
      text = text.slice(0, before) + (turn.text ? separator + turn.text : '');
      recordUsage(turn.usage);
      const counted = countedTokens(turn.usage);
      spent += counted;
      addSessionTokens(sessionUuid, counted);
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
      if (!turn.calls.length) break;

      let asked = false;
      for (const call of turn.calls) {
        const answer = async (): Promise<{
          text: string;
          error: boolean;
          refused?: number;
        }> => {
          if (call.broken) return { text: call.broken, error: true };
          if (call.name === NAME_TOOL.name)
            return {
              text: nameSession(
                sessionUuid,
                (call.input as { name?: unknown } | undefined)?.name,
              ),
              error: false,
            };
          if (call.name === FILE_TOOL.name) {
            const made = await makeSessionFile(
              sessionUuid,
              (call.input ?? {}) as Record<string, unknown>,
            );
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
          const result = await tool.call(call.input);
          const refused = result._meta?.[REFUSED_META];
          return {
            refused: typeof refused === 'number' ? refused : 0,
            text: cutAnswer(
              result.content
                .map((part) => ('text' in part ? part.text : ''))
                .join('\n'),
            ),
            error: Boolean(result.isError),
          };
        };
        const result = await answer();
        if (!OWN_TOOLS.has(call.name))
          steps.push(stepOf(call, result.error, result.refused));
        transcript.push({
          role: 'tool',
          id: call.id,
          name: call.name,
          output: result.text,
          ...(result.error ? { error: true } : {}),
        });
        save();
      }
      if (asked) break;
    }
  } catch (error) {
    const stop =
      error instanceof TurnStop
        ? error
        : error instanceof ModelError
          ? new TurnStop(error.kind, error.detail)
          : signal.aborted
            ? new TurnStop('stopped')
            : undefined;
    if (!stop)
      THEI_SERVER.console.error(
        '[AI] A session turn failed:',
        error instanceof Error ? (error.stack ?? error.message) : error,
      );
    const notice =
      stop ?? new TurnStop('error', 'Thei could not finish this turn.');
    // A call asked for and never answered would leave the conversation
    // unable to go on: each gets its answer.
    const last = transcript.at(-1);
    if (last?.role === 'assistant')
      for (const call of last.calls ?? [])
        transcript.push({
          role: 'tool',
          id: call.id,
          name: call.name,
          output: 'Stopped before it ran.',
          error: true,
        });
    parts.push({
      type: 'notice',
      kind: notice.kind,
      text: notice.detail.slice(0, 500),
    });
    if (notice.kind !== 'stopped')
      updateSession(sessionUuid, { error: notice.kind });
  } finally {
    save();
    updateSession(sessionUuid, { state: 'idle' });
    db.transaction((tx) => {
      touchSession(tx, schema, sessionUuid);
      refreshSessionCounts(tx, schema, sessionUuid);
    });
    // A template's turn keeps what it read once it went through, and a
    // scheduled run that left nothing to decide goes to the archive — after
    // the touch above, which brings a session back out of it.
    try {
      settleTemplateTurn(
        sessionUuid,
        !parts.some((part) => part.type === 'notice'),
      );
    } catch {
      THEI_SERVER.console
        .tag('MCP')
        .error('Failed to settle what a template run read');
    }
    publishSession(sessionUuid, { type: 'session' });
  }
}

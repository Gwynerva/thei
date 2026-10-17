import Anthropic from '@anthropic-ai/sdk';
import type { AiTranscriptTurn } from '#layers/thei/shared/ai';
import { TURN_LIMITS } from '../runner/turns';
import {
  anthropicError,
  anthropicThinking,
  anthropicUsage,
  chatAddress,
  chatBodyError,
  chatFailure,
  chatHeaders,
  chatUsage,
  ModelError,
  outputLimit,
  refusedThinking,
  type ChatUsage,
} from './service';
import type { ModelSettings } from './settings';
import type { ModelUsage } from './usage';

/**
 * One turn of the model, streamed: its words as they come, the tools it
 * asks for, and what the turn spent. The conversation is kept in a shape of
 * Thei's own (`AiTranscriptTurn`) and spoken to each provider in its own:
 * Anthropic's Messages API, or the chat completions API that other clouds,
 * Ollama and LM Studio speak.
 */

export interface StreamTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * A block of a file, as a model is shown it (`server/thei/ai/sessions/files.ts`
 * makes them): a picture made small, a PDF whole, a text's words, a
 * recording as MP3. A file may be several — a video is its frame and its
 * sound — and any other is told of in words alone.
 */
export type StreamFile =
  | { kind: 'image'; name: string; data: string }
  | { kind: 'pdf'; name: string; data: string }
  | { kind: 'text'; name: string; text: string }
  | {
      kind: 'audio';
      name: string;
      /** Base64 of an MP3. */
      data: string;
      /** Seconds it was cut at, when the recording runs longer. */
      cutAt?: number;
    };

/** The kinds of block a provider may turn away. */
export type StreamFileKind = Exclude<StreamFile['kind'], 'text'>;

/**
 * Given up in this order when a provider refuses a request that carries
 * them: the rarest kind first. Each is then told of in words.
 */
const DROPPED_FIRST: StreamFileKind[] = ['audio', 'pdf', 'image'];

const BLOCK_WORDS: Record<StreamFileKind, string> = {
  image: 'a picture',
  pdf: 'a PDF',
  audio: 'a recording',
};

/**
 * What a model is told of a block it could not be shown: so it neither
 * pretends to have seen the file nor guesses what is in it.
 */
function unshownNote(file: Exclude<StreamFile, { kind: 'text' }>): string {
  return `(«${file.name}» is ${BLOCK_WORDS[file.kind]} that could not be shown to you here. Do not guess what is in it.)`;
}

/** A recording cut short, said before it. */
function cutNote(file: Extract<StreamFile, { kind: 'audio' }>): string {
  const minutes = Math.round((file.cutAt ?? 0) / 60);
  return `(You hear the first ${minutes} minutes of «${file.name}»: it runs longer.)`;
}

export interface StreamTurnInput {
  settings: ModelSettings;
  system: string;
  turns: AiTranscriptTurn[];
  /**
   * The blocks of the files the turns name — what the owner brought, what a
   * tool showed — by id; one missing is told of in words only.
   */
  files?: ReadonlyMap<string, StreamFile[]>;
  /** Kinds of block this provider turned away already: told in words. */
  unshown?: ReadonlySet<StreamFileKind>;
  tools: StreamTool[];
  signal: AbortSignal;
  /** Words as they come, in order. */
  onText: (delta: string) => void;
  /**
   * What a call to the service spent, once for every call it answered —
   * one cut short by a stop, a timeout or a failure midway too, as far as
   * it is known.
   */
  onUsage: (usage: ModelUsage) => void;
}

export interface StreamCall {
  id: string;
  name: string;
  input: unknown;
  /** Cut off, or not JSON: the tool is not run, the model hears why. */
  broken?: string;
}

export interface StreamTurnOutput {
  text: string;
  calls: StreamCall[];
  native?: { provider: string; content: unknown };
  /**
   * Why the model stopped short, if it did: its answer ran out of room — the
   * longest it may write, or all the conversation it can read — or it
   * refused to answer.
   */
  stop?: 'length' | 'refusal';
  /**
   * Kinds of block the provider turned away, now and before: the next call
   * of the turn tells of them in words from the start.
   */
  unshown: Set<StreamFileKind>;
}

/** The files a turn shows: what the owner brought, or what a tool showed. */
export function turnFiles(turn: { role: string; files?: string[] }): string[] {
  return turn.role === 'user' || turn.role === 'tool' ? (turn.files ?? []) : [];
}

/** The files a request carries blocks of, by kind, given what is unshown. */
function kindsCarried(
  turns: AiTranscriptTurn[],
  files: ReadonlyMap<string, StreamFile[]>,
  unshown: ReadonlySet<StreamFileKind>,
): Set<StreamFileKind> {
  const kinds = new Set<StreamFileKind>();
  for (const turn of turns)
    for (const id of turnFiles(turn))
      for (const file of files.get(id) ?? [])
        if (file.kind !== 'text' && !unshown.has(file.kind))
          kinds.add(file.kind);
  return kinds;
}

/** The kind of block to give up next, when a request with them is refused. */
function nextToDrop(carried: ReadonlySet<StreamFileKind>) {
  return DROPPED_FIRST.find((kind) => carried.has(kind));
}

/** The room a turn may take: a long proposal fits, a runaway does not. */
const MAX_OUTPUT_TOKENS = 16000;
const CUT_OFF =
  'Your turn was cut off before this call was whole; make it again, shorter.';

/**
 * A tool's input as the model wrote it: parsed, or why it is not run — cut
 * off with the turn, or not JSON at all, which the model is shown to write
 * it again.
 */
function parsedCall(
  call: { id: string; name: string; arguments: string },
  cut: boolean,
): StreamCall {
  if (cut) return { id: call.id, name: call.name, input: {}, broken: CUT_OFF };
  try {
    const input: unknown = JSON.parse(call.arguments || '{}');
    // A tool's input is an object, or nothing a service takes back.
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new TypeError('Not an object');
    return { id: call.id, name: call.name, input };
  } catch {
    return {
      id: call.id,
      name: call.name,
      input: {},
      broken: JSON.stringify({ INVALID_JSON: call.arguments }),
    };
  }
}

/**
 * What one call spent, told once however it ends. A call cut short is
 * counted as far as the service said, its words written so far at about
 * four characters a token: the service bills them, and does not say how
 * many until its answer is over.
 */
function callMeter(onUsage: (usage: ModelUsage) => void) {
  let known: ModelUsage | undefined;
  let written = 0;
  let told = false;
  return {
    said(usage: ModelUsage) {
      known = usage;
    },
    wrote(characters: number) {
      written += characters;
    },
    /** Once: the call answered whole, or was cut short. */
    tell(whole: boolean) {
      if (told) return;
      told = true;
      const usage = known ?? {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      };
      if (whole) return onUsage(usage);
      if (!known && !written) return;
      onUsage({
        ...usage,
        outputTokens: Math.max(usage.outputTokens, Math.ceil(written / 4)),
      });
    },
  };
}

type CallMeter = ReturnType<typeof callMeter>;

export async function streamTurn(
  input: StreamTurnInput,
): Promise<StreamTurnOutput> {
  const quiet = silenceWatch(input.signal);
  const watched = { ...input, signal: quiet.signal, heard: quiet.heard };
  try {
    return await (input.settings.provider === 'anthropic'
      ? streamAnthropic(watched)
      : streamOpenAi(watched));
  } catch (error) {
    if (quiet.silent && !input.signal.aborted)
      throw new ModelError(
        'timeout',
        `The service said nothing for ${Math.round(TURN_LIMITS.silenceMs / 1000)} s.`,
      );
    throw error;
  } finally {
    quiet.stop();
  }
}

/**
 * A service that stops mid-answer and never says another word would hold a
 * turn for good: one silent for too long once it began to answer is given
 * up on. `heard` is called on every sign of life, the first when it answers
 * at all — a model on a laptop may think long before that, and the turn's
 * own clock bounds the wait.
 */
function silenceWatch(signal: AbortSignal) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const heard = () => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(), TURN_LIMITS.silenceMs);
    timer.unref?.();
  };
  return {
    signal: AbortSignal.any([signal, controller.signal]),
    heard,
    get silent() {
      return controller.signal.aborted;
    },
    stop: () => clearTimeout(timer),
  };
}

/** A turn as a provider is asked for it, told when the service is heard. */
type WatchedInput = StreamTurnInput & { heard: () => void };

// --- Anthropic ---------------------------------------------------------------

/** What Anthropic's API takes: pictures and PDFs, and no sound. */
const ANTHROPIC_SENDS = (kind: StreamFileKind) => kind !== 'audio';

function anthropicFile(
  file: StreamFile,
  unshown: ReadonlySet<StreamFileKind>,
):
  | Anthropic.TextBlockParam
  | Anthropic.ImageBlockParam
  | Anthropic.DocumentBlockParam {
  if (file.kind === 'text') return { type: 'text', text: textFile(file) };
  if (!ANTHROPIC_SENDS(file.kind) || unshown.has(file.kind))
    return { type: 'text', text: unshownNote(file) };
  if (file.kind === 'image')
    return {
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: file.data },
    };
  return {
    type: 'document',
    title: file.name,
    source: {
      type: 'base64',
      media_type: 'application/pdf',
      data: file.data,
    },
  };
}

/** The blocks of the files a turn shows. */
function anthropicFiles(
  turn: AiTranscriptTurn,
  files: ReadonlyMap<string, StreamFile[]>,
  unshown: ReadonlySet<StreamFileKind>,
) {
  return turnFiles(turn).flatMap((id) =>
    (files.get(id) ?? []).map((file) => anthropicFile(file, unshown)),
  );
}

/** A text file, set apart from the words of the message. */
function textFile(file: { name: string; text: string }) {
  return `«${file.name}»:\n\n${file.text}`;
}

function anthropicMessages(
  turns: AiTranscriptTurn[],
  files: ReadonlyMap<string, StreamFile[]> = new Map(),
  unshown: ReadonlySet<StreamFileKind> = new Set(),
): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = [];
  const push = (
    role: 'user' | 'assistant',
    blocks: Anthropic.ContentBlockParam[],
  ) => {
    const last = messages.at(-1);
    if (last?.role === role && Array.isArray(last.content))
      (last.content as Anthropic.ContentBlockParam[]).push(...blocks);
    else messages.push({ role, content: blocks });
  };
  for (const turn of turns) {
    if (turn.role === 'user')
      push('user', [
        { type: 'text', text: turn.text },
        ...anthropicFiles(turn, files, unshown),
      ]);
    else if (turn.role === 'tool') {
      // A file a tool showed goes along with its answer.
      const shown = anthropicFiles(turn, files, unshown);
      push('user', [
        {
          type: 'tool_result',
          tool_use_id: turn.id,
          content: shown.length
            ? [{ type: 'text', text: turn.output }, ...shown]
            : turn.output,
          ...(turn.error ? { is_error: true } : {}),
        },
      ]);
    } else if (turn.native?.provider === 'anthropic')
      push('assistant', turn.native.content as Anthropic.ContentBlockParam[]);
    else
      push('assistant', [
        ...(turn.text ? [{ type: 'text' as const, text: turn.text }] : []),
        ...(turn.calls ?? []).map((call) => ({
          type: 'tool_use' as const,
          id: call.id,
          name: call.name,
          input: call.input,
        })),
      ]);
  }
  return messages;
}

/** An answer of Anthropic's, gathered from its stream. */
interface AnthropicAnswer {
  /** The blocks by the index each came with. */
  content: (Anthropic.ContentBlock | undefined)[];
  /** The input of each tool call as it was written, by the call's block. */
  inputs: Map<number, string>;
  stop: Anthropic.StopReason | null;
}

/**
 * Reads an answer of Anthropic's as it streams: its words told as they
 * come, what it spent told to `meter`. Tool inputs are kept as written and
 * parsed only at the end, each on its own: a call the model wrote broken
 * is told so, rather than the whole answer lost.
 */
async function readAnthropic(
  stream: AsyncIterable<Anthropic.RawMessageStreamEvent>,
  signal: AbortSignal,
  meter: CallMeter,
  heard: () => void,
  onText: (delta: string) => void,
): Promise<AnthropicAnswer> {
  const content: Anthropic.ContentBlock[] = [];
  const inputs = new Map<number, string>();
  let stop: Anthropic.StopReason | null = null;
  let usage: Parameters<typeof anthropicUsage>[0] = {};
  for await (const event of stream) {
    heard();
    switch (event.type) {
      case 'message_start':
        usage = { ...event.message.usage };
        meter.said(anthropicUsage(usage));
        break;
      case 'message_delta': {
        // The counts are the call's so far; those it leaves out stand.
        const delta = event.usage;
        usage = {
          ...usage,
          output_tokens: delta.output_tokens,
          ...(delta.input_tokens != null
            ? { input_tokens: delta.input_tokens }
            : {}),
          ...(delta.cache_read_input_tokens != null
            ? { cache_read_input_tokens: delta.cache_read_input_tokens }
            : {}),
          ...(delta.cache_creation_input_tokens != null
            ? { cache_creation_input_tokens: delta.cache_creation_input_tokens }
            : {}),
        };
        meter.said(anthropicUsage(usage));
        stop = event.delta.stop_reason ?? stop;
        break;
      }
      case 'content_block_start':
        content[event.index] = { ...event.content_block };
        break;
      case 'content_block_delta': {
        const block = content[event.index];
        const delta = event.delta;
        if (delta.type === 'text_delta' && block?.type === 'text') {
          block.text += delta.text;
          meter.wrote(delta.text.length);
          onText(delta.text);
        } else if (delta.type === 'input_json_delta') {
          inputs.set(
            event.index,
            (inputs.get(event.index) ?? '') + delta.partial_json,
          );
          meter.wrote(delta.partial_json.length);
        } else if (
          delta.type === 'thinking_delta' &&
          block?.type === 'thinking'
        ) {
          block.thinking += delta.thinking;
          meter.wrote(delta.thinking.length);
        } else if (
          delta.type === 'signature_delta' &&
          block?.type === 'thinking'
        )
          block.signature = delta.signature;
        else if (delta.type === 'citations_delta' && block?.type === 'text')
          block.citations = [...(block.citations ?? []), delta.citation];
        break;
      }
    }
  }
  // A stream stopped from this side ends quietly: it is no whole answer.
  signal.throwIfAborted();
  return { content, inputs, stop };
}

/** An answer of Anthropic's as a turn: its words, its calls, how it ended. */
function anthropicTurn(
  answer: AnthropicAnswer,
  unshown: Set<StreamFileKind>,
): StreamTurnOutput {
  const cut =
    answer.stop === 'max_tokens' ||
    answer.stop === 'model_context_window_exceeded';
  const calls: StreamCall[] = [];
  // By the index each block came with, as the inputs are kept.
  const content = answer.content.flatMap(
    (block, index): Anthropic.ContentBlock[] => {
      if (!block) return [];
      if (block.type !== 'tool_use') return [block];
      const call = parsedCall(
        {
          id: block.id,
          name: block.name,
          arguments:
            answer.inputs.get(index) ?? JSON.stringify(block.input ?? {}),
        },
        cut,
      );
      calls.push(call);
      // Handed back as the model wrote it, as far as it parses: a call that
      // does not is an empty one, whose answer says why it was not run.
      return [{ ...block, input: call.input }];
    },
  );
  return {
    text: content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join(''),
    calls,
    native: { provider: 'anthropic', content },
    ...(answer.stop === 'refusal'
      ? { stop: 'refusal' as const }
      : cut
        ? { stop: 'length' as const }
        : {}),
    unshown,
  };
}

async function streamAnthropic({
  settings,
  system,
  turns,
  files = new Map(),
  unshown: unshownBefore,
  tools,
  signal,
  onText,
  onUsage,
  heard,
}: WatchedInput): Promise<StreamTurnOutput> {
  const unshown = new Set(unshownBefore ?? []);
  const client = new Anthropic({ apiKey: settings.apiKey, maxRetries: 2 });
  for (;;) {
    const meter = callMeter(onUsage);
    let written = false;
    try {
      const stream = await client.messages.create(
        {
          model: settings.model,
          max_tokens: MAX_OUTPUT_TOKENS,
          ...anthropicThinking(settings.model),
          // The instructions and the tools are the same for every turn of
          // every session: cached, they are read for a tenth.
          system: [
            {
              type: 'text',
              text: system,
              cache_control: { type: 'ephemeral' },
            },
          ],
          tools: tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
            // A long proposal streams as it is written; its input is checked
            // against the tool's schema before the tool runs.
            eager_input_streaming: true,
          })),
          messages: anthropicMessages(turns, files, unshown),
          // The conversation so far is reread on every turn: cached, for a
          // tenth.
          cache_control: { type: 'ephemeral' },
          stream: true,
        },
        { signal },
      );
      heard();
      const answer = await readAnthropic(
        stream,
        signal,
        meter,
        heard,
        (delta) => {
          written = true;
          onText(delta);
        },
      );
      meter.tell(true);
      return anthropicTurn(answer, unshown);
    } catch (error) {
      meter.tell(false);
      if (signal.aborted) throw error;
      // A model that takes no adaptive thinking is asked again without it.
      if (!written && refusedThinking(settings.model, error)) continue;
      // A request the service refuses while it carries a file's blocks is
      // asked again without them, one kind at a time: the model is told in
      // words what it could not be shown.
      if (error instanceof Anthropic.BadRequestError && !written) {
        const drop = nextToDrop(
          new Set(
            [...kindsCarried(turns, files, unshown)].filter(ANTHROPIC_SENDS),
          ),
        );
        if (drop) {
          unshown.add(drop);
          continue;
        }
      }
      throw anthropicError(error);
    }
  }
}

// --- Chat completions ----------------------------------------------------------

type ChatPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'input_audio'; input_audio: { data: string; format: 'mp3' } }
  | { type: 'file'; file: { filename: string; file_data: string } };

type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | ChatPart[] }
  | {
      role: 'assistant';
      content: string | null;
      tool_calls?: {
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }[];
    }
  | { role: 'tool'; tool_call_id: string; content: string };

/**
 * A block of a file in the chat completions format: a picture as an image,
 * a PDF as a file, a recording as sound; what the provider turned away is
 * told in words.
 */
function chatParts(
  file: StreamFile,
  unshown: ReadonlySet<StreamFileKind>,
): ChatPart[] {
  if (file.kind === 'text') return [{ type: 'text', text: textFile(file) }];
  if (unshown.has(file.kind))
    return [{ type: 'text', text: unshownNote(file) }];
  if (file.kind === 'image')
    return [
      {
        type: 'image_url',
        image_url: { url: `data:image/jpeg;base64,${file.data}` },
      },
    ];
  if (file.kind === 'pdf')
    return [
      {
        type: 'file',
        file: {
          filename: file.name,
          file_data: `data:application/pdf;base64,${file.data}`,
        },
      },
    ];
  return [
    ...(file.cutAt ? [{ type: 'text' as const, text: cutNote(file) }] : []),
    { type: 'input_audio', input_audio: { data: file.data, format: 'mp3' } },
  ];
}

/**
 * The conversation in the chat completions format. The files a message
 * brings go in it as parts; a tool's answer is words only in this format, so
 * the files the tools of one call showed follow their answers, in a message
 * of their own.
 */
function chatMessages(
  system: string,
  turns: AiTranscriptTurn[],
  files: ReadonlyMap<string, StreamFile[]> = new Map(),
  unshown: ReadonlySet<StreamFileKind> = new Set(),
): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: 'system', content: system }];
  const partsOf = (turn: AiTranscriptTurn) =>
    turnFiles(turn).flatMap((id) =>
      (files.get(id) ?? []).flatMap((file) => chatParts(file, unshown)),
    );
  let shownByTools: ChatPart[] = [];
  const showToolFiles = () => {
    if (!shownByTools.length) return;
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: 'The files your tools showed above:' },
        ...shownByTools,
      ],
    });
    shownByTools = [];
  };
  for (const turn of turns) {
    if (turn.role !== 'tool') showToolFiles();
    if (turn.role === 'user') {
      const brought = partsOf(turn);
      messages.push({
        role: 'user',
        content: brought.length
          ? [{ type: 'text', text: turn.text }, ...brought]
          : turn.text,
      });
    } else if (turn.role === 'tool') {
      messages.push({
        role: 'tool',
        tool_call_id: turn.id,
        content: turn.error ? `Error: ${turn.output}` : turn.output,
      });
      shownByTools.push(...partsOf(turn));
    } else
      messages.push({
        role: 'assistant',
        content: turn.text || null,
        ...(turn.calls?.length
          ? {
              tool_calls: turn.calls.map((call) => ({
                id: call.id,
                type: 'function' as const,
                function: {
                  name: call.name,
                  arguments: JSON.stringify(call.input ?? {}),
                },
              })),
            }
          : {}),
      });
  }
  showToolFiles();
  return messages;
}

/** The longest one request to a chat completions server may take. */
const CHAT_REQUEST_MS = 10 * 60 * 1000;

async function chatRequest(
  settings: ModelSettings,
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<Response> {
  try {
    return await fetch(chatAddress(settings.baseUrl, '/chat/completions'), {
      method: 'POST',
      headers: chatHeaders(settings.apiKey),
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new ModelError(
      'address',
      error instanceof Error ? error.message : String(error),
    );
  }
}

/** How a chat completions server ended an answer, as a turn says it. */
function chatStop(finish: string | undefined): StreamTurnOutput['stop'] {
  if (finish === 'length') return 'length';
  if (finish === 'content_filter') return 'refusal';
  return undefined;
}

/**
 * A turn of a chat completions server, within the longest a request may
 * take: one that takes longer is out of time, whatever it says meanwhile.
 */
async function streamOpenAi(input: WatchedInput): Promise<StreamTurnOutput> {
  const cap = AbortSignal.timeout(CHAT_REQUEST_MS);
  try {
    return await chatTurn({
      ...input,
      signal: AbortSignal.any([input.signal, cap]),
    });
  } catch (error) {
    if (cap.aborted && !input.signal.aborted)
      throw new ModelError(
        'timeout',
        `The service took longer than ${CHAT_REQUEST_MS / 60_000} min.`,
      );
    throw error;
  }
}

async function chatTurn({
  settings,
  system,
  turns,
  files = new Map(),
  unshown: unshownBefore,
  tools,
  signal,
  onText,
  onUsage,
  heard,
}: WatchedInput): Promise<StreamTurnOutput> {
  const unshown = new Set(unshownBefore ?? []);
  const base = {
    model: settings.model,
    ...(tools.length
      ? {
          tools: tools.map((tool) => ({
            type: 'function' as const,
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.inputSchema,
            },
          })),
        }
      : {}),
    ...outputLimit(settings.baseUrl, MAX_OUTPUT_TOKENS),
    stream: true,
  };
  let counted = true;
  let response: Response;
  for (;;) {
    response = await chatRequest(
      settings,
      {
        ...base,
        messages: chatMessages(system, turns, files, unshown),
        ...(counted ? { stream_options: { include_usage: true } } : {}),
      },
      signal,
    );
    heard();
    if (response.status !== 400) break;
    const said = await response.text().catch(() => '');
    // Ollama and LM Studio may not know stream_options: asked again without.
    if (counted && /stream_options|include_usage/i.test(said)) {
      counted = false;
      continue;
    }
    // A model that takes no sound, no PDF or no pictures is asked again
    // without them, one kind at a time, and told of them in words.
    const drop = nextToDrop(kindsCarried(turns, files, unshown));
    if (drop) unshown.add(drop);
    else throw chatFailure(400, said);
  }
  if (!response.ok)
    throw chatFailure(response.status, await response.text().catch(() => ''));

  const meter = callMeter(onUsage);
  try {
    const turn = /text\/event-stream/i.test(
      response.headers.get('content-type') ?? '',
    )
      ? await readChatStream(response, meter, heard, onText)
      : await readChatAnswer(response, meter, onText);
    meter.tell(true);
    return { ...turn, unshown };
  } catch (error) {
    meter.tell(false);
    throw error;
  }
}

/** A call as a chat completions server gives it, whole or in pieces. */
interface ChatCall {
  id?: string;
  function?: { name?: string; arguments?: string };
}

/** The calls of an answer, each with an id — a server may give none. */
function chatCalls(
  calls: { id?: string; name: string; arguments: string }[],
  cut: boolean,
): StreamCall[] {
  return calls
    .filter((call) => call.name)
    .map((call, index) =>
      parsedCall({ ...call, id: call.id || `call_${index}` }, cut),
    );
}

/** A server that does not stream answers at once, as plain JSON. */
async function readChatAnswer(
  response: Response,
  meter: CallMeter,
  onText: (delta: string) => void,
): Promise<Omit<StreamTurnOutput, 'unshown'>> {
  let body: {
    error?: unknown;
    choices?: {
      finish_reason?: string;
      message?: { content?: string | null; tool_calls?: ChatCall[] };
    }[];
    usage?: ChatUsage;
  };
  try {
    body = await response.json();
  } catch {
    throw new ModelError(
      'error',
      'The service answered with what is not JSON.',
    );
  }
  if (body.error) throw chatBodyError(body.error);
  meter.said(chatUsage(body.usage));
  const choice = body.choices?.[0];
  const text = choice?.message?.content ?? '';
  if (text) onText(text);
  const stop = chatStop(choice?.finish_reason);
  return {
    text,
    calls: chatCalls(
      (choice?.message?.tool_calls ?? []).map((call) => ({
        id: call.id,
        name: call.function?.name ?? '',
        arguments: call.function?.arguments ?? '',
      })),
      stop === 'length',
    ),
    ...(stop ? { stop } : {}),
  };
}

/**
 * Reads a streamed answer of a chat completions server: its words told as
 * they come, its calls gathered piece by piece. An error the server puts in
 * the stream ends the turn with it rather than with a silence.
 */
async function readChatStream(
  response: Response,
  meter: CallMeter,
  heard: () => void,
  onText: (delta: string) => void,
): Promise<Omit<StreamTurnOutput, 'unshown'>> {
  let text = '';
  let finish: string | undefined;
  const calls: { id: string; name: string; arguments: string }[] = [];
  const take = (line: string) => {
    if (!line.startsWith('data:')) return;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') return;
    let chunk: {
      error?: unknown;
      choices?: {
        delta?: {
          content?: string | null;
          tool_calls?: (ChatCall & { index?: number })[];
        };
        finish_reason?: string | null;
      }[];
      usage?: ChatUsage;
    };
    try {
      chunk = JSON.parse(data);
    } catch {
      return;
    }
    if (chunk.error) throw chatBodyError(chunk.error);
    if (chunk.usage) meter.said(chatUsage(chunk.usage));
    const choice = chunk.choices?.[0];
    if (!choice) return;
    if (choice.finish_reason === 'error')
      throw new ModelError('error', 'The service broke its answer off.');
    if (choice.finish_reason) finish = choice.finish_reason;
    const delta = choice.delta;
    if (delta?.content) {
      text += delta.content;
      meter.wrote(delta.content.length);
      onText(delta.content);
    }
    for (const part of delta?.tool_calls ?? []) {
      const index = part.index ?? calls.length;
      const call = (calls[index] ??= { id: '', name: '', arguments: '' });
      if (part.id) call.id = part.id;
      if (part.function?.name) call.name += part.function.name;
      if (part.function?.arguments) {
        call.arguments += part.function.arguments;
        meter.wrote(part.function.arguments.length);
      }
    }
  };
  const decoder = new TextDecoder();
  let buffer = '';
  const reader = response.body!.getReader();
  let ended = false;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      heard();
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf('\n');
      while (newline !== -1) {
        take(buffer.slice(0, newline).replace(/\r$/, ''));
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf('\n');
      }
    }
    ended = true;
  } finally {
    // An answer given up on midway lets its connection go.
    if (!ended) void reader.cancel().catch(() => {});
  }
  take(buffer.trim());
  const stop = chatStop(finish);
  return {
    text,
    calls: chatCalls(calls, stop === 'length'),
    ...(stop ? { stop } : {}),
  };
}

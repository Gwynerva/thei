import Anthropic from '@anthropic-ai/sdk';
import type { AiTranscriptTurn } from '#layers/thei/shared/ai';
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
  usage: ModelUsage;
  /** The model ended its turn, asked for tools, ran out of room, or refused. */
  stop: 'end' | 'tools' | 'length' | 'refusal';
  /**
   * Kinds of block the provider turned away, now and before: the next call
   * of the turn tells of them in words from the start.
   */
  unshown: Set<StreamFileKind>;
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

/** The files a turn shows: what the owner brought, or what a tool showed. */
function turnFiles(turn: AiTranscriptTurn): string[] {
  return turn.role === 'user' || turn.role === 'tool' ? (turn.files ?? []) : [];
}

/**
 * Why a turn could not be had: a key the service refused, a service busy or
 * out of reach, a model it does not know, or anything else it said. `detail`
 * is what it said, for the owner.
 */
export class ModelError extends Error {
  constructor(
    readonly kind: 'key' | 'busy' | 'address' | 'model' | 'error',
    readonly detail = '',
  ) {
    super(detail || kind);
    this.name = 'ModelError';
  }
}

/** The room a turn may take: a long proposal fits, a runaway does not. */
const MAX_OUTPUT_TOKENS = 16000;
const CUT_OFF =
  'Your turn was cut off before this call was whole; make it again, shorter.';
/** How many times a turn is asked again when its tool input would not parse. */
const UNPARSED_RETRIES = 2;

export function streamTurn(input: StreamTurnInput): Promise<StreamTurnOutput> {
  return input.settings.provider === 'anthropic'
    ? streamAnthropic(input)
    : streamOpenAi(input);
}

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

function anthropicError(error: unknown): unknown {
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  )
    return new ModelError('key', providerDetail(error));
  if (error instanceof Anthropic.NotFoundError)
    return new ModelError('model', providerDetail(error));
  if (
    error instanceof Anthropic.RateLimitError ||
    error instanceof Anthropic.InternalServerError
  )
    return new ModelError('busy', providerDetail(error));
  if (error instanceof Anthropic.APIConnectionError)
    return new ModelError('address', error.message);
  if (error instanceof Anthropic.APIError)
    return new ModelError('error', providerDetail(error));
  return error;
}

function providerDetail(error: InstanceType<typeof Anthropic.APIError>) {
  const body = error.error as { error?: { message?: unknown } } | undefined;
  const said = body?.error?.message;
  return (typeof said === 'string' ? said : error.message).slice(0, 300);
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
}: StreamTurnInput): Promise<StreamTurnOutput> {
  const unshown = new Set(unshownBefore ?? []);
  const client = new Anthropic({ apiKey: settings.apiKey, maxRetries: 2 });
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model: settings.model,
    max_tokens: MAX_OUTPUT_TOKENS,
    // The model decides how much to think; its thoughts are shown to no
    // one, so they are not sent back in full either.
    thinking: { type: 'adaptive', display: 'omitted' },
    // The instructions and the tools are the same for every turn of every
    // session: cached, they are read for a tenth.
    system: [
      { type: 'text', text: system, cache_control: { type: 'ephemeral' } },
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
    // The conversation so far is reread on every turn: cached, for a tenth.
    cache_control: { type: 'ephemeral' },
  };
  for (let attempt = 0; ; attempt++) {
    let written = '';
    params.messages = anthropicMessages(turns, files, unshown);
    try {
      const stream = client.messages.stream(params, { signal });
      stream.on('text', (delta) => {
        written += delta;
        onText(delta);
      });
      const message = await stream.finalMessage();
      const usage: ModelUsage = {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
      };
      const text = message.content
        .flatMap((block) => (block.type === 'text' ? [block.text] : []))
        .join('');
      const uses = message.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
      );
      const cut = message.stop_reason === 'max_tokens';
      return {
        text,
        calls: uses.map((use) => ({
          id: use.id,
          name: use.name,
          input: use.input,
          ...(cut ? { broken: CUT_OFF } : {}),
        })),
        native: { provider: 'anthropic', content: message.content },
        usage,
        stop:
          message.stop_reason === 'refusal'
            ? 'refusal'
            : uses.length
              ? 'tools'
              : cut
                ? 'length'
                : 'end',
        unshown,
      };
    } catch (error) {
      if (signal.aborted) throw error;
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
          attempt--;
          continue;
        }
      }
      // Tool input that would not parse at all rejects the read of the
      // stream: the turn is asked again, a few times.
      if (
        !(error instanceof Anthropic.APIError) &&
        error instanceof SyntaxError &&
        attempt < UNPARSED_RETRIES &&
        !written
      )
        continue;
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

/**
 * OpenAI's own API takes the limit of an answer under its newer name, and
 * refuses the old one for its newer models; other servers of the format
 * know only the old one.
 */
function outputLimit(settings: ModelSettings, tokens: number) {
  let host = '';
  try {
    host = new URL(settings.baseUrl).hostname;
  } catch {
    // An address that does not parse fails on the request itself.
  }
  return host === 'api.openai.com'
    ? { max_completion_tokens: tokens }
    : { max_tokens: tokens };
}

interface ChatUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

function usageOf(usage: ChatUsage | undefined): ModelUsage {
  const cached = usage?.prompt_tokens_details?.cached_tokens ?? 0;
  return {
    inputTokens: Math.max(0, (usage?.prompt_tokens ?? 0) - cached),
    outputTokens: usage?.completion_tokens ?? 0,
    cacheReadTokens: cached,
    cacheWriteTokens: 0,
  };
}

async function chatRequest(
  settings: ModelSettings,
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<Response> {
  try {
    return await fetch(
      `${settings.baseUrl.replace(/\/+$/, '')}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(settings.apiKey
            ? { authorization: `Bearer ${settings.apiKey}` }
            : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.any([signal, AbortSignal.timeout(10 * 60 * 1000)]),
      },
    );
  } catch (error) {
    if (signal.aborted) throw error;
    throw new ModelError(
      'address',
      error instanceof Error ? error.message : String(error),
    );
  }
}

async function chatFailure(response: Response): Promise<ModelError> {
  const text = (await response.text().catch(() => '')).slice(0, 300);
  if (response.status === 401 || response.status === 403)
    return new ModelError('key', text);
  if (response.status === 404)
    return new ModelError(/model/i.test(text) ? 'model' : 'address', text);
  if (response.status === 429 || response.status >= 500)
    return new ModelError('busy', text);
  return new ModelError(
    /model/i.test(text) ? 'model' : 'error',
    `${response.status} ${text}`,
  );
}

function parsedCall(
  call: { id: string; name: string; arguments: string },
  cut: boolean,
): StreamCall {
  if (cut) return { id: call.id, name: call.name, input: {}, broken: CUT_OFF };
  try {
    return {
      id: call.id,
      name: call.name,
      input: JSON.parse(call.arguments || '{}'),
    };
  } catch {
    return {
      id: call.id,
      name: call.name,
      input: {},
      broken: JSON.stringify({ INVALID_JSON: call.arguments }),
    };
  }
}

async function streamOpenAi({
  settings,
  system,
  turns,
  files = new Map(),
  unshown: unshownBefore,
  tools,
  signal,
  onText,
}: StreamTurnInput): Promise<StreamTurnOutput> {
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
    ...outputLimit(settings, MAX_OUTPUT_TOKENS),
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
    else
      throw new ModelError(
        /model/i.test(said) ? 'model' : 'error',
        `400 ${said.slice(0, 300)}`,
      );
  }
  if (!response.ok) throw await chatFailure(response);

  // A server that does not stream answers at once, as plain JSON.
  if (!/text\/event-stream/i.test(response.headers.get('content-type') ?? '')) {
    const body = (await response.json()) as {
      choices?: {
        finish_reason?: string;
        message?: {
          content?: string | null;
          tool_calls?: {
            id: string;
            function: { name: string; arguments: string };
          }[];
        };
      }[];
      usage?: ChatUsage;
    };
    const choice = body.choices?.[0];
    const text = choice?.message?.content ?? '';
    if (text) onText(text);
    const cut = choice?.finish_reason === 'length';
    const calls = (choice?.message?.tool_calls ?? []).map((call) =>
      parsedCall(
        {
          id: call.id,
          name: call.function.name,
          arguments: call.function.arguments,
        },
        cut,
      ),
    );
    return {
      text,
      calls,
      usage: usageOf(body.usage),
      stop: calls.length ? 'tools' : cut ? 'length' : 'end',
      unshown,
    };
  }

  let text = '';
  let finish = '';
  let usage: ChatUsage | undefined;
  const calls: { id: string; name: string; arguments: string }[] = [];
  const decoder = new TextDecoder();
  let buffer = '';
  const reader = response.body!.getReader();
  const take = (line: string) => {
    if (!line.startsWith('data:')) return;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') return;
    let chunk: {
      choices?: {
        delta?: {
          content?: string | null;
          tool_calls?: {
            index?: number;
            id?: string;
            function?: { name?: string; arguments?: string };
          }[];
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
    if (chunk.usage) usage = chunk.usage;
    const choice = chunk.choices?.[0];
    if (!choice) return;
    if (choice.finish_reason) finish = choice.finish_reason;
    const delta = choice.delta;
    if (delta?.content) {
      text += delta.content;
      onText(delta.content);
    }
    for (const part of delta?.tool_calls ?? []) {
      const index = part.index ?? calls.length;
      const call = (calls[index] ??= { id: '', name: '', arguments: '' });
      if (part.id) call.id = part.id;
      if (part.function?.name) call.name += part.function.name;
      if (part.function?.arguments) call.arguments += part.function.arguments;
    }
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      take(buffer.slice(0, newline).replace(/\r$/, ''));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf('\n');
    }
  }
  take(buffer.trim());
  const cut = finish === 'length';
  const made = calls
    .filter((call) => call.name)
    .map((call, index) =>
      parsedCall({ ...call, id: call.id || `call_${index}` }, cut),
    );
  return {
    text,
    calls: made,
    usage: usageOf(usage),
    stop: made.length ? 'tools' : cut ? 'length' : 'end',
    unshown,
  };
}

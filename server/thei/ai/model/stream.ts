import Anthropic from '@anthropic-ai/sdk';
import type { AiTranscriptTurn } from '#layers/thei/shared/ai';
import { TURN_LIMITS } from '../runner/turns';
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
 * A file the owner brought into the session, as a model is shown it: a
 * picture made small, a PDF whole, a text's words. Any other file is told of
 * in the words of the message alone.
 */
export type StreamFile =
  | { kind: 'image'; data: string }
  | { kind: 'pdf'; name: string; data: string }
  | { kind: 'text'; name: string; text: string };

export interface StreamTurnInput {
  settings: ModelSettings;
  system: string;
  turns: AiTranscriptTurn[];
  /** The files the turns name, by id; one missing is told of in words only. */
  files?: ReadonlyMap<string, StreamFile>;
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
}

/**
 * Why a turn could not be had: a key the service refused, a service busy or
 * out of reach, a model it does not know, a service that fell silent, or
 * anything else it said. `detail` is what it said, for the owner.
 */
export class ModelError extends Error {
  constructor(
    readonly kind: 'key' | 'busy' | 'address' | 'model' | 'timeout' | 'error',
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

function anthropicFile(file: StreamFile): Anthropic.ContentBlockParam {
  if (file.kind === 'image')
    return {
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: file.data },
    };
  if (file.kind === 'pdf')
    return {
      type: 'document',
      title: file.name,
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: file.data,
      },
    };
  return { type: 'text', text: textFile(file) };
}

/** A text file, set apart from the words of the message. */
function textFile(file: { name: string; text: string }) {
  return `«${file.name}»:\n\n${file.text}`;
}

function anthropicMessages(
  turns: AiTranscriptTurn[],
  files: ReadonlyMap<string, StreamFile> = new Map(),
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
        ...(turn.files ?? []).flatMap((id) => {
          const file = files.get(id);
          return file ? [anthropicFile(file)] : [];
        }),
      ]);
    else if (turn.role === 'tool')
      push('user', [
        {
          type: 'tool_result',
          tool_use_id: turn.id,
          content: turn.output,
          ...(turn.error ? { is_error: true } : {}),
        },
      ]);
    else if (turn.native?.provider === 'anthropic')
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
  files,
  tools,
  signal,
  onText,
  heard,
}: WatchedInput): Promise<StreamTurnOutput> {
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
    messages: anthropicMessages(turns, files),
    // The conversation so far is reread on every turn: cached, for a tenth.
    cache_control: { type: 'ephemeral' },
  };
  for (let attempt = 0; ; attempt++) {
    let written = '';
    try {
      const stream = client.messages.stream(params, { signal });
      stream.on('connect', heard);
      stream.on('streamEvent', heard);
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
      };
    } catch (error) {
      if (signal.aborted) throw error;
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

type ChatMessage =
  | { role: 'system'; content: string }
  | {
      role: 'user';
      content:
        | string
        | (
            | { type: 'text'; text: string }
            | { type: 'image_url'; image_url: { url: string } }
          )[];
    }
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
 * The conversation in the chat completions format. Pictures go as images,
 * unless `pictures` is off for a model that sees none; a PDF is not a part
 * every server of the format takes, so it is only named.
 */
function chatMessages(
  system: string,
  turns: AiTranscriptTurn[],
  files: ReadonlyMap<string, StreamFile> = new Map(),
  pictures = true,
): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: 'system', content: system }];
  for (const turn of turns) {
    const brought = (turn.role === 'user' ? (turn.files ?? []) : []).flatMap(
      (id) => {
        const file = files.get(id);
        return file ? [file] : [];
      },
    );
    if (turn.role === 'user' && brought.length)
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: turn.text },
          ...brought.map((file) =>
            file.kind === 'image' && pictures
              ? {
                  type: 'image_url' as const,
                  image_url: { url: `data:image/jpeg;base64,${file.data}` },
                }
              : {
                  type: 'text' as const,
                  text:
                    file.kind === 'text'
                      ? textFile(file)
                      : file.kind === 'pdf'
                        ? `(«${file.name}» is a PDF this model is not shown.)`
                        : '(A picture this model is not shown.)',
                },
          ),
        ],
      });
    else if (turn.role === 'user')
      messages.push({ role: 'user', content: turn.text });
    else if (turn.role === 'tool')
      messages.push({
        role: 'tool',
        tool_call_id: turn.id,
        content: turn.error ? `Error: ${turn.output}` : turn.output,
      });
    else
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
  files,
  tools,
  signal,
  onText,
  heard,
}: WatchedInput): Promise<StreamTurnOutput> {
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
  let pictures = turns.some(
    (turn) =>
      turn.role === 'user' &&
      turn.files?.some((id) => files?.get(id)?.kind === 'image'),
  );
  let response: Response;
  for (;;) {
    response = await chatRequest(
      settings,
      {
        ...base,
        messages: chatMessages(system, turns, files, pictures),
        ...(counted ? { stream_options: { include_usage: true } } : {}),
      },
      signal,
    );
    heard();
    if (response.status !== 400) break;
    const said = await response.text().catch(() => '');
    // Ollama and LM Studio may not know stream_options: asked again without.
    if (counted && /stream_options|include_usage/i.test(said)) counted = false;
    // A model that sees no pictures is told of them in words.
    else if (pictures) pictures = false;
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
    heard();
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
  };
}

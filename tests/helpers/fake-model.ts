import { createHash } from 'node:crypto';
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * A model played by a local server, for the tests of whatever talks to one.
 *
 * It answers the two wire formats Thei speaks — Anthropic's Messages API and
 * OpenAI-compatible chat completions, the latter also standing for Ollama and
 * LM Studio — whole or streamed, turn by turn from a script, and lists its
 * models. Every request is kept for the test to look at. vitest and
 * Playwright both use it: a site is pointed at `url` like at any service.
 */

export type FakeToolCall = {
  id?: string;
  name: string;
  input: Record<string, unknown>;
  /** The input as written instead — JSON or not: a model that slipped. */
  raw?: string;
};

export type FakeTurn = {
  text?: string;
  toolCalls?: FakeToolCall[];
  usage?: { input?: number; output?: number; cacheRead?: number };
  /** Answer this call with an error instead: a refused key, a busy service. */
  error?: { status: number; body?: unknown };
  /** A pause before every streamed piece, to watch a reply arrive. */
  delayMs?: number;
  /**
   * Stream this many pieces, then say nothing more and hold the answer
   * open: a service gone silent midway.
   */
  stallAfter?: number;
  /**
   * Stream this many pieces, then put this error in the stream and end it:
   * a service that fails midway.
   */
  failAfter?: { pieces: number; error: unknown };
  /**
   * How the answer ends, as the API names it — `max_tokens`, `refusal`,
   * `length`, `content_filter` — instead of by its calls.
   */
  stop?: string;
};

export type FakeRequest = {
  api: 'anthropic' | 'openai';
  path: string;
  headers: IncomingHttpHeaders;
  body: any;
};

/**
 * The turns in order, or a function that picks each one — and may take its
 * time, as a person answering in a model's place does.
 */
export type FakeScript =
  | FakeTurn[]
  | ((
      request: FakeRequest,
      index: number,
    ) => FakeTurn | undefined | Promise<FakeTurn | undefined>);

export type FakeModel = {
  url: string;
  /** Every chat call so far, in order; model listings are not kept. */
  requests: FakeRequest[];
  /** The calls turned away for a block the model does not take. */
  refused: FakeRequest[];
  close: () => Promise<void>;
};

export type FakeModelOptions = {
  models?: string[];
  /** A fixed port, for a server a site is configured to; otherwise any free one. */
  port?: number;
  /**
   * Refuse `stream_options` with a 400, as Ollama and LM Studio do: a client
   * is expected to ask again without it.
   */
  refuseStreamOptions?: boolean;
  /**
   * Kinds of content block the model does not take — `input_audio`,
   * `file`, `document`, `image`… — refused with a 400, as a service
   * refuses a request that carries one: a client is expected to ask again
   * without it.
   */
  refuseBlocks?: string[];
  /**
   * Refuse adaptive thinking with a 400, as Anthropic's older models do: a
   * client is expected to ask again without it.
   */
  refuseThinking?: boolean;
  /**
   * Think, as Anthropic's newer models do: every answer begins with a
   * thinking block whose signature binds it to what came before it — the
   * instructions, the tools as a set, every earlier message, and the
   * thinking block before it. Sent back over anything else, it is refused
   * with the service's own 400; a leading run of blocks may be left out.
   */
  signThinking?: boolean;
};

/** What a thinking block was thought over, as a service binds it. */
function boundTo(body: any, messages: unknown[]): string {
  const system = Array.isArray(body.system)
    ? body.system.map((block: { text?: string }) => block.text ?? '').join('\n')
    : String(body.system ?? '');
  const tools = ((body.tools ?? []) as any[])
    .map((tool) => [tool.name, tool.description, tool.input_schema])
    .sort((left, right) => String(left[0]).localeCompare(String(right[0])));
  const plain = (messages as { role: string; content: unknown }[]).map(
    (message) => ({
      role: message.role,
      content: (typeof message.content === 'string'
        ? [{ type: 'text', text: message.content }]
        : (message.content as Record<string, unknown>[])
      )
        .filter(
          (block) =>
            block.type !== 'thinking' && block.type !== 'redacted_thinking',
        )
        .map(({ cache_control: _marker, ...block }) => block),
    }),
  );
  return createHash('sha256')
    .update(JSON.stringify([system, tools, plain]))
    .digest('hex');
}

/** The thinking blocks a request carries, in order, with where each is. */
function thinkingIn(messages: any[]) {
  const found: { at: string; message: number; signature: string }[] = [];
  messages.forEach((message, index) => {
    if (!Array.isArray(message.content)) return;
    message.content.forEach((block: any, position: number) => {
      if (block?.type === 'thinking')
        found.push({
          at: `messages.${index}.content.${position}`,
          message: index,
          signature: String(block.signature ?? ''),
        });
    });
  });
  return found;
}

/** Where a request sends back thinking it was not thought over, if anywhere. */
function unboundThinking(body: any): string | undefined {
  const blocks = thinkingIn(body.messages ?? []);
  for (const [index, block] of blocks.entries()) {
    let sealed: { over?: string; after?: string | null };
    try {
      sealed = JSON.parse(Buffer.from(block.signature, 'base64').toString());
    } catch {
      return `${block.at}: Invalid \`signature\` in \`thinking\` block.`;
    }
    const before = blocks[index - 1];
    const over = boundTo(body, body.messages.slice(0, block.message));
    if (
      sealed.over !== over ||
      (before ? before.signature !== sealed.after : false)
    )
      return `${block.at}: Invalid \`signature\` in \`thinking\` block. The block is bound to a different conversation. Remove the block, or set \`thinking.block_binding.prefix_mismatch_behavior\` to "drop_block". That setting requires the \`thinking-binding-controls-2026-08-01\` value in the \`anthropic-beta\` header.`;
  }
  return undefined;
}

/** A signature for thinking done over this request. */
function signThinking(body: any): string {
  const blocks = thinkingIn(body.messages ?? []);
  return Buffer.from(
    JSON.stringify({
      over: boundTo(body, body.messages ?? []),
      after: blocks.at(-1)?.signature ?? null,
    }),
  ).toString('base64');
}

/** Whether a body carries a content block of one of these types anywhere. */
function carriesBlock(value: unknown, types: readonly string[]): boolean {
  if (Array.isArray(value))
    return value.some((item) => carriesBlock(item, types));
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (typeof record.type === 'string' && types.includes(record.type))
    return true;
  return Object.values(record).some((item) => carriesBlock(item, types));
}

const NO_MORE: FakeTurn = {
  error: { status: 500, body: { error: 'the script has no more turns' } },
};

const wait = (ms?: number) =>
  ms ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

/** A text in the pieces a stream would bring it in: a word at a time. */
function pieces(text: string): string[] {
  return text.match(/\S+\s*|\s+/g) ?? [];
}

/** A JSON text in a few uneven pieces, as tool arguments arrive. */
function jsonPieces(json: string): string[] {
  const out: string[] = [];
  for (let at = 0; at < json.length; at += 7) out.push(json.slice(at, at + 7));
  return out.length ? out : ['{}'];
}

function apiOf(headers: IncomingHttpHeaders, path: string): FakeRequest['api'] {
  if (path.endsWith('/messages') || headers['anthropic-version'])
    return 'anthropic';
  return 'openai';
}

export async function startFakeModel(
  script: FakeScript,
  options: FakeModelOptions = {},
): Promise<FakeModel> {
  const requests: FakeRequest[] = [];
  const refused: FakeRequest[] = [];
  const models = options.models ?? ['fake-small', 'fake-large'];
  const turnFor = async (request: FakeRequest, index: number) =>
    (typeof script === 'function'
      ? await script(request, index)
      : script[index]) ?? NO_MORE;

  const server: Server = createServer((request, response) => {
    let raw = '';
    request.on('data', (chunk) => (raw += chunk));
    request.on('end', () => {
      const path = (request.url ?? '').split('?')[0]!;
      const api = apiOf(request.headers, path);
      if (request.method === 'GET' && path.endsWith('/models')) {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify(
            api === 'anthropic'
              ? {
                  data: models.map((id) => ({
                    id,
                    type: 'model',
                    display_name: id,
                  })),
                  has_more: false,
                }
              : {
                  object: 'list',
                  data: models.map((id) => ({ id, object: 'model' })),
                },
          ),
        );
        return;
      }
      const body = raw ? JSON.parse(raw) : {};
      if (
        options.refuseStreamOptions &&
        api === 'openai' &&
        body.stream_options
      ) {
        response.writeHead(400, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            error: { message: 'unknown field stream_options' },
          }),
        );
        return;
      }
      const fake: FakeRequest = { api, path, headers: request.headers, body };
      if (options.refuseThinking && api === 'anthropic' && body.thinking) {
        refused.push(fake);
        response.writeHead(400, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            type: 'error',
            error: {
              type: 'invalid_request_error',
              message:
                "thinking.type: Input tag 'adaptive' found using 'type' does not match any of the expected tags: 'disabled', 'enabled'",
            },
          }),
        );
        return;
      }
      if (
        options.refuseBlocks?.length &&
        carriesBlock(body.messages, options.refuseBlocks)
      ) {
        refused.push(fake);
        response.writeHead(400, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify(
            api === 'anthropic'
              ? {
                  type: 'error',
                  error: {
                    type: 'invalid_request_error',
                    message: 'This model does not take that content.',
                  },
                }
              : {
                  error: { message: 'This model does not take that content.' },
                },
          ),
        );
        return;
      }
      if (options.signThinking && api === 'anthropic') {
        const unbound = unboundThinking(body);
        if (unbound) {
          refused.push(fake);
          response.writeHead(400, { 'content-type': 'application/json' });
          response.end(
            JSON.stringify({
              type: 'error',
              error: { type: 'invalid_request_error', message: unbound },
            }),
          );
          return;
        }
      }
      requests.push(fake);
      void turnFor(fake, requests.length - 1).then((turn) =>
        answer(turn, fake, response),
      );
    });
  });

  async function answer(
    turn: FakeTurn,
    request: FakeRequest,
    response: import('node:http').ServerResponse,
  ) {
    if (turn.error) {
      response.writeHead(turn.error.status, {
        'content-type': 'application/json',
      });
      response.end(JSON.stringify(turn.error.body ?? { error: 'failed' }));
      return;
    }
    const calls = (turn.toolCalls ?? []).map((call, index) => ({
      ...call,
      id: call.id ?? `call_${requests.length}_${index}`,
      written: call.raw ?? JSON.stringify(call.input),
    }));
    const usage = {
      input: turn.usage?.input ?? 100,
      output: turn.usage?.output ?? 20,
      cacheRead: turn.usage?.cacheRead ?? 0,
    };
    const stream = request.body.stream === true;
    let sent = 0;
    /** Thrown to end a stream with the error of `failAfter`. */
    const FAILED = Symbol('failed');
    /** Before every streamed piece: its pause, its failure, or silence for good. */
    const next = async () => {
      if (turn.failAfter && sent >= turn.failAfter.pieces) throw FAILED;
      if (turn.stallAfter !== undefined && sent >= turn.stallAfter)
        await new Promise(() => {});
      sent++;
      await wait(turn.delayMs);
    };
    if (request.api === 'anthropic') {
      const stop = turn.stop ?? (calls.length ? 'tool_use' : 'end_turn');
      /** The answer's thinking, signed over what it was thought over. */
      const signature = options.signThinking
        ? signThinking(request.body)
        : undefined;
      if (!stream) {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            id: `msg_${requests.length}`,
            type: 'message',
            role: 'assistant',
            model: request.body.model,
            content: [
              ...(signature
                ? [{ type: 'thinking', thinking: '', signature }]
                : []),
              ...(turn.text ? [{ type: 'text', text: turn.text }] : []),
              ...calls.map((call) => ({
                type: 'tool_use',
                id: call.id,
                name: call.name,
                input: call.input,
              })),
            ],
            stop_reason: stop,
            stop_sequence: null,
            usage: {
              input_tokens: usage.input,
              output_tokens: usage.output,
              cache_read_input_tokens: usage.cacheRead,
            },
          }),
        );
        return;
      }
      response.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      });
      const send = (event: string, data: unknown) =>
        response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      send('message_start', {
        type: 'message_start',
        message: {
          id: `msg_${requests.length}`,
          type: 'message',
          role: 'assistant',
          model: request.body.model,
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: {
            input_tokens: usage.input,
            output_tokens: 1,
            cache_read_input_tokens: usage.cacheRead,
          },
        },
      });
      let index = 0;
      try {
        if (signature) {
          send('content_block_start', {
            type: 'content_block_start',
            index,
            content_block: { type: 'thinking', thinking: '', signature: '' },
          });
          send('content_block_delta', {
            type: 'content_block_delta',
            index,
            delta: { type: 'signature_delta', signature },
          });
          send('content_block_stop', { type: 'content_block_stop', index });
          index++;
        }
        if (turn.text) {
          send('content_block_start', {
            type: 'content_block_start',
            index,
            content_block: { type: 'text', text: '' },
          });
          for (const piece of pieces(turn.text)) {
            await next();
            send('content_block_delta', {
              type: 'content_block_delta',
              index,
              delta: { type: 'text_delta', text: piece },
            });
          }
          send('content_block_stop', { type: 'content_block_stop', index });
          index++;
        }
        for (const call of calls) {
          send('content_block_start', {
            type: 'content_block_start',
            index,
            content_block: {
              type: 'tool_use',
              id: call.id,
              name: call.name,
              input: {},
            },
          });
          for (const piece of jsonPieces(call.written)) {
            await next();
            send('content_block_delta', {
              type: 'content_block_delta',
              index,
              delta: { type: 'input_json_delta', partial_json: piece },
            });
          }
          send('content_block_stop', { type: 'content_block_stop', index });
          index++;
        }
      } catch (error) {
        if (error !== FAILED) throw error;
        send('error', { type: 'error', error: turn.failAfter!.error });
        response.end();
        return;
      }
      send('message_delta', {
        type: 'message_delta',
        delta: { stop_reason: stop, stop_sequence: null },
        usage: { output_tokens: usage.output },
      });
      send('message_stop', { type: 'message_stop' });
      response.end();
      return;
    }

    const finish = turn.stop ?? (calls.length ? 'tool_calls' : 'stop');
    const openaiUsage = {
      prompt_tokens: usage.input,
      completion_tokens: usage.output,
      total_tokens: usage.input + usage.output,
      ...(usage.cacheRead
        ? { prompt_tokens_details: { cached_tokens: usage.cacheRead } }
        : {}),
    };
    if (!stream) {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          id: `chatcmpl_${requests.length}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: request.body.model,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: turn.text ?? null,
                ...(calls.length
                  ? {
                      tool_calls: calls.map((call) => ({
                        id: call.id,
                        type: 'function',
                        function: {
                          name: call.name,
                          arguments: call.written,
                        },
                      })),
                    }
                  : {}),
              },
              finish_reason: finish,
            },
          ],
          usage: openaiUsage,
        }),
      );
      return;
    }
    response.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
    });
    const chunk = (delta: unknown, finishReason: string | null = null) =>
      response.write(
        `data: ${JSON.stringify({
          id: `chatcmpl_${requests.length}`,
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: request.body.model,
          choices: [{ index: 0, delta, finish_reason: finishReason }],
        })}\n\n`,
      );
    try {
      chunk({ role: 'assistant', content: '' });
      for (const piece of pieces(turn.text ?? '')) {
        await next();
        chunk({ content: piece });
      }
      for (const [index, call] of calls.entries()) {
        chunk({
          tool_calls: [
            {
              index,
              id: call.id,
              type: 'function',
              function: { name: call.name, arguments: '' },
            },
          ],
        });
        for (const piece of jsonPieces(call.written)) {
          await next();
          chunk({ tool_calls: [{ index, function: { arguments: piece } }] });
        }
      }
    } catch (error) {
      if (error !== FAILED) throw error;
      response.write(
        `data: ${JSON.stringify({ error: turn.failAfter!.error })}\n\n`,
      );
      response.end();
      return;
    }
    chunk({}, finish);
    if (request.body.stream_options?.include_usage)
      response.write(
        `data: ${JSON.stringify({
          id: `chatcmpl_${requests.length}`,
          object: 'chat.completion.chunk',
          choices: [],
          usage: openaiUsage,
        })}\n\n`,
      );
    response.write('data: [DONE]\n\n');
    response.end();
  }

  await new Promise<void>((resolve) =>
    server.listen(options.port ?? 0, '127.0.0.1', resolve),
  );
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    refused,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

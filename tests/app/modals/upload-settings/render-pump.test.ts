import { describe, expect, it } from 'vitest';
import { RenderPump } from '../../../../app/modals/upload-settings/render-pump';

interface Call {
  key: string;
  signal: AbortSignal;
  settled: boolean;
  resolve: (value: string) => void;
  reject: (reason: unknown) => void;
}

/** A pump over fake requests and a fake clock, both stepped by hand. */
function harness(window = 3) {
  const timers: (() => void)[] = [];
  const calls: Call[] = [];
  const results: string[] = [];
  const failures: string[] = [];
  const rendered = new Set<string>();
  const pump = new RenderPump<{ key: string }, string>({
    window,
    delayMs: 350,
    has: (key) => rendered.has(key),
    fetch: (item, signal) =>
      new Promise<string>((resolve, reject) => {
        const call: Call = {
          key: item.key,
          signal,
          settled: false,
          resolve: (value) => {
            call.settled = true;
            resolve(value);
          },
          reject: (reason) => {
            call.settled = true;
            reject(reason);
          },
        };
        calls.push(call);
        signal.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      }),
    onResult: (key, result) => {
      rendered.add(key);
      results.push(`${key}=${result}`);
    },
    onFailure: (key) => failures.push(key),
    timers: {
      set: (callback) => {
        timers.push(callback);
        return timers.length - 1;
      },
      clear: (handle) => {
        timers[handle as number] = () => {};
      },
    },
  });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  /** The debounce runs out. */
  const elapse = async () => {
    for (const callback of timers.splice(0)) callback();
    await settle();
  };
  const want = (...keys: string[]) =>
    pump.setWanted(keys.map((key) => ({ key })));
  /** Requests still waiting for an answer. */
  const open = () =>
    calls
      .filter((call) => !call.signal.aborted && !call.settled)
      .map((call) => call.key);
  const answer = async (key: string) => {
    calls
      .find(
        (call) => call.key === key && !call.signal.aborted && !call.settled,
      )!
      .resolve('ok');
    await settle();
  };
  return { pump, calls, results, failures, want, elapse, open, answer, settle };
}

describe('render pump', () => {
  it('sends a window of requests in order of worth and the next as each settles', async () => {
    const h = harness();
    h.want('a', 'b', 'c', 'd', 'e');
    expect(h.calls).toHaveLength(0);
    await h.elapse();
    expect(h.open()).toEqual(['a', 'b', 'c']);

    await h.answer('b');
    expect(h.open()).toEqual(['a', 'c', 'd']);
    expect(h.results).toEqual(['b=ok']);
    await h.answer('a');
    await h.answer('c');
    await h.answer('d');
    await h.answer('e');
    expect(h.results).toHaveLength(5);
    expect(h.calls).toHaveLength(5);
  });

  it('drops requests no longer wanted at once, and sends the new ones once the change settles', async () => {
    const h = harness();
    h.want('a', 'b', 'c', 'd');
    await h.elapse();
    expect(h.open()).toEqual(['a', 'b', 'c']);

    h.want('a', 'x', 'y');
    expect(h.calls.map((call) => call.signal.aborted)).toEqual([
      false,
      true,
      true,
    ]);
    // Nothing new until the debounce runs out, even as dropped ones settle.
    await h.settle();
    expect(h.calls).toHaveLength(3);
    await h.elapse();
    expect(h.open()).toEqual(['a', 'x', 'y']);
  });

  it('never asks again for what it has, and asks for a failure only on retry', async () => {
    const h = harness(2);
    h.want('a', 'b', 'c');
    await h.elapse();
    h.calls[0]!.reject(new Error('refused'));
    await h.settle();
    expect(h.failures).toEqual(['a']);
    expect(h.open()).toEqual(['b', 'c']);
    await h.answer('b');
    await h.answer('c');

    h.want('a', 'b', 'c', 'd');
    await h.elapse();
    // `a` failed and `b`, `c` are had: only `d` goes out.
    expect(h.open()).toEqual(['d']);
    await h.answer('d');
    h.pump.retry();
    await h.settle();
    expect(h.open()).toEqual(['a']);
  });

  it('holds one request for "Use" and resumes the rest on release', async () => {
    const h = harness();
    h.want('a', 'b', 'c', 'd');
    await h.elapse();
    h.pump.hold('a');
    expect(h.open()).toEqual(['a']);
    await h.settle();
    expect(h.calls).toHaveLength(3);
    h.want('a', 'b', 'c', 'd', 'e');
    await h.elapse();
    expect(h.calls).toHaveLength(3);

    h.pump.release();
    await h.settle();
    expect(h.open()).toEqual(['a', 'b', 'c']);
  });

  it('forgets everything on reset', async () => {
    const h = harness();
    h.want('a', 'b');
    await h.elapse();
    h.pump.reset();
    expect(h.open()).toEqual([]);
    expect(h.pump.isInflight('a')).toBe(false);
  });
});

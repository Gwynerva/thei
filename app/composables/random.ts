let _clientReady = false;

/**
 * SSR-correct seeded random utilities.
 *
 * The seed and current PRNG state live in `useState('random')` — serialized
 * into the Nuxt payload so the client receives the same seed. On the client,
 * the PRNG state is reset to the initial seed before hydration begins,
 * guaranteeing the same sequence is produced as the server render.
 *
 * A single PRNG counter is shared across all calls on the same page render,
 * so every call advances it and returns a distinct value.
 */
export function useRandom() {
  const state = useState('random', () => {
    const seed = Math.floor(Math.random() * 2 ** 32);
    return { seed, s: seed };
  });

  if (import.meta.client && !_clientReady) {
    state.value.s = state.value.seed;
    _clientReady = true;
  }

  // Mulberry32 — fast, high-quality 32-bit seeded PRNG.
  // Reads and writes state.value.s so all useRandom() callers share one counter.
  const prng = (): number => {
    const s = (state.value.s + 0x6d2b79f5) | 0;
    state.value.s = s;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  /** Drop-in replacement for `Math.random()` — returns a float in [0, 1). */
  const random = (): number => prng();

  /** Returns `true` or `false` with equal probability. */
  const randomBoolean = (): boolean => prng() < 0.5;

  /** Returns a random integer in the inclusive range [min, max]. */
  const randomInt = (min: number, max: number): number =>
    Math.floor(prng() * (max - min + 1)) + min;

  /** Returns a random float in the range [min, max). */
  const randomFloat = (min: number, max: number): number =>
    prng() * (max - min) + min;

  /** Returns a random element from the array. */
  const randomArrayElement = <T>(arr: readonly T[]): T =>
    arr[Math.floor(prng() * arr.length)]!;

  return { random, randomBoolean, randomInt, randomFloat, randomArrayElement };
}

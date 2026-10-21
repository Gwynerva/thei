// What the probe is told to let be, each with its reason. A suppression
// names one rule (or every rule, `*`) and the elements it covers: by a
// selector any element of a finding is inside, or by a piece of an
// element's signature, `role|name|path|heading` — the same text its
// fingerprint is made of.
//
// Add one only when a screen proves it: a finding a reviewer dismissed as
// what the page means, which no rule of the probe could tell apart. A rule
// that is wrong for every page is fixed in `in-page.ts` instead, with a
// decoy in `fixtures/` that keeps it fixed.
import type { ProbeRule } from '../types';

export interface Allow {
  id: string;
  rule: ProbeRule | '*';
  selector?: string;
  signature?: string;
  why: string;
}

export const ALLOW: Allow[] = [];

// How a probe finding's close-up is named in an attempt's `crops/`: the
// recorder writes it by this name, the reviews read it by this name.
// It has no imports, so the runner can take it without the review side.

/** `rule-hash8` of a fingerprint `rule:hash`: readable, short, safe on every disk. */
export function cropKey(fp: string): string {
  const colon = fp.indexOf(':');
  const rule = colon < 0 ? '' : fp.slice(0, colon);
  const hash = colon < 0 ? fp : fp.slice(colon + 1);
  const safe = (text: string) => text.replace(/[^A-Za-z0-9-]+/g, '-');
  return `${rule ? `${safe(rule)}-` : ''}${safe(hash).slice(0, 8)}`;
}

/** `crops/<step NN>-<rule>-<hash8>.png`, e.g. `02-covered-control-9a0ru8lz.png`. */
export function cropName(step: number, fp: string): string {
  return `${String(step).padStart(2, '0')}-${cropKey(fp)}.png`;
}

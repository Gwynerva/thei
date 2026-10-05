/**
 * The outline of a card that is one end of a period going on beyond it: a
 * box with round corners and, on the side the period goes on to, an edge
 * that ripples — torn from a longer strip rather than cut to size. Up for a
 * start, whose period runs on to newer days above it; down for an end, whose
 * period began on older days below.
 *
 * The ripples stay inside the box, within `depth` of its edge, and a whole
 * number of them fits the width, so both corners of that side meet it at the
 * same height whatever the card's size.
 */
export function continuationOutlinePath(
  width: number,
  height: number,
  side: 'up' | 'down',
  radius: number,
  { wave = 22, depth = 8 }: { wave?: number; depth?: number } = {},
): string {
  if (width <= 0 || height <= depth) return '';
  const r = Math.max(0, Math.min(radius, width / 2, (height - depth) / 2));
  const halves = Math.max(1, Math.round(width / wave)) * 2;
  const step = width / halves;
  const n = (value: number) => Number(value.toFixed(2));
  const crest = (index: number, top: number, bottom: number) =>
    index % 2 ? bottom : top;

  if (side === 'up') {
    const middle = depth / 2;
    let path = `M0 ${n(middle)}`;
    for (let index = 0; index < halves; index++)
      path += `Q${n((index + 0.5) * step)} ${n(crest(index, 0, depth))} ${n((index + 1) * step)} ${n(middle)}`;
    return `${path}V${n(height - r)}A${n(r)} ${n(r)} 0 0 1 ${n(width - r)} ${n(height)}H${n(r)}A${n(r)} ${n(r)} 0 0 1 0 ${n(height - r)}Z`;
  }

  const middle = height - depth / 2;
  let path = `M0 ${n(r)}A${n(r)} ${n(r)} 0 0 1 ${n(r)} 0H${n(width - r)}A${n(r)} ${n(r)} 0 0 1 ${n(width)} ${n(r)}V${n(middle)}`;
  for (let index = 0; index < halves; index++)
    path += `Q${n(width - (index + 0.5) * step)} ${n(crest(index, height, height - depth))} ${n(width - (index + 1) * step)} ${n(middle)}`;
  return `${path}Z`;
}

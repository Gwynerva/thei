import type { OgNode } from './render';

/**
 * Fitting a card's words into the space its layout gives them.
 *
 * A layout describes its text column as a stack — a chip row, a title, a
 * summary, a row of facts — and a ladder of concessions it is willing to
 * make, in order, when the stack is too tall: a line less of the summary, a
 * smaller title, no tags. Everything is measured once, in a single probe
 * render (`measure.ts`); the solver here is pure arithmetic over those
 * numbers, which is what lets tests drive it through any amount of data and
 * prove the result fits.
 *
 * The last word always belongs to the title: when the ladder runs out, the
 * title keeps its smallest size and as many lines as the space leaves, with
 * an ellipsis, and at least one line.
 */
export interface OgTextItem {
  kind: 'text';
  key: string;
  text: string;
  /** Candidate sizes, largest first. */
  sizes: number[];
  lineHeight: number;
  weight: 400 | 600 | 700;
  italic?: boolean;
  /** At most this many lines, at any size. */
  maxLines: number;
  /** Titles are balanced across their lines, the way headlines are set. */
  balance?: boolean;
  /**
   * Only the smallest size may break a word that is wider than the column:
   * a broken word reads worse than smaller type.
   */
  keepWords?: boolean;
  required?: boolean;
  /** Space above the item when something precedes it. */
  gapBefore: number;
  /**
   * A picture drawn at the start of the text's line — a project's icon
   * beside its title. The text takes the width that is left, and the line
   * is at least as tall as the picture.
   */
  lead?: OgTextLead;
}

export interface OgTextLead {
  /** What the painter draws, as a block by this key. */
  key: string;
  width: number;
  height: number;
  gap: number;
}

/** The width a text is set in: the column's, less a picture beside it. */
export function textWidth(plan: Pick<OgStackPlan, 'width'>, item: OgTextItem) {
  return plan.width - (item.lead ? item.lead.width + item.lead.gap : 0);
}

export interface OgRowItem {
  key: string;
  node: OgNode;
  /** Wider than this, the item is drawn cut off with an ellipsis. */
  maxWidth?: number;
}

export interface OgRowSpec {
  kind: 'row';
  key: string;
  height: number;
  gap: number;
  /** In order of importance, which is also the order they are drawn in. */
  items: OgRowItem[];
  /**
   * What stands for the items that did not fit: "+3". Without it the rest is
   * simply left out.
   */
  plus?: (count: number) => OgNode;
  /** Items beyond the list that exist but were never going to be drawn. */
  hiddenCount?: number;
  required?: boolean;
  gapBefore: number;
}

/** Something of a known height: a line with an icon, a spacer. */
export interface OgBlockSpec {
  kind: 'block';
  key: string;
  height: number;
  required?: boolean;
  gapBefore: number;
}

export type OgStackItem = OgTextItem | OgRowSpec | OgBlockSpec;

export type OgFitStep =
  | { op: 'lines'; key: string; to: number }
  | { op: 'size'; key: string }
  | { op: 'drop'; key: string };

export interface OgStackPlan {
  width: number;
  height: number;
  items: OgStackItem[];
  ladder: OgFitStep[];
  /** How the stack lines up: along its left edge, or down its middle. */
  align?: 'start' | 'center';
}

/** What the probe render found; see `measureStack`. */
export interface OgMeasurements {
  /** Natural height of each text at each size, laid out at the column width. */
  textHeight: Map<string, number>;
  /** Width of the widest unbreakable word of each text at each size. */
  wordWidth: Map<string, number>;
  /**
   * Height of one line of each text at each size. Satori rounds a line to
   * whole pixels, so arithmetic from the line height drifts a pixel every few
   * lines; a measured line does not.
   */
  lineHeight: Map<string, number>;
  /** Natural width of each row item, and of the "+N" chips. */
  itemWidth: Map<string, number>;
}

export function textKey(key: string, size: number) {
  return `${key}@${size}`;
}

export function plusKey(rowKey: string, digits: number) {
  return `${rowKey}/+${digits}`;
}

export interface OgFittedText {
  kind: 'text';
  key: string;
  size: number;
  lines: number;
  /** Fewer lines than the text would take: draw it clamped. */
  clamped: boolean;
  /** The one size allowed to break a word, and it has to. */
  breakWords: boolean;
  height: number;
}

export interface OgFittedRow {
  kind: 'row';
  key: string;
  shown: number;
  plus: number;
  widths: number[];
  plusWidth: number;
  height: number;
}

export interface OgFittedBlock {
  kind: 'block';
  key: string;
  height: number;
}

export type OgFittedItem = OgFittedText | OgFittedRow | OgFittedBlock;

export interface OgFittedStack {
  items: Map<string, OgFittedItem>;
  /** Present items in drawing order, with the gap above each. */
  order: { key: string; gapBefore: number }[];
  height: number;
  /** The concessions made, for the gallery and for tests. */
  steps: string[];
  fits: boolean;
}

interface TextState {
  sizeIndex: number;
  lines: number;
}

/**
 * Items that fit a row, in order, leaving room for the "+N" that counts the
 * rest.
 */
export function packRow(
  widths: number[],
  gap: number,
  available: number,
  plusWidth?: (count: number) => number,
  hiddenCount = 0,
): { shown: number; plus: number } {
  const total = widths.length + hiddenCount;
  for (let shown = widths.length; shown >= 0; shown--) {
    const rest = total - shown;
    let used = widths
      .slice(0, shown)
      .reduce((sum, width, index) => sum + width + (index ? gap : 0), 0);
    if (rest > 0 && plusWidth) used += (shown ? gap : 0) + plusWidth(rest);
    if (used <= available) return { shown, plus: plusWidth ? rest : 0 };
  }
  return { shown: 0, plus: plusWidth ? total : 0 };
}

export function digitsOf(count: number) {
  return String(Math.max(1, Math.floor(count))).length;
}

export function solveStack(
  plan: OgStackPlan,
  measurements: OgMeasurements,
): OgFittedStack {
  const texts = new Map<string, TextState>();
  const dropped = new Set<string>();
  const steps: string[] = [];

  const acceptable = (item: OgTextItem, index: number) =>
    !item.keepWords ||
    index === item.sizes.length - 1 ||
    (measurements.wordWidth.get(textKey(item.key, item.sizes[index]!)) ?? 0) <=
      textWidth(plan, item);

  /** Whether a title has to break a word at this size to fit the line. */
  const breaks = (item: OgTextItem, size: number) =>
    Boolean(item.keepWords) &&
    (measurements.wordWidth.get(textKey(item.key, size)) ?? 0) >
      textWidth(plan, item);

  const heightAt = (item: OgTextItem, size: number) => {
    const key = textKey(item.key, size);
    return (
      (breaks(item, size)
        ? measurements.textHeight.get(`${key}!break`)
        : undefined) ??
      measurements.textHeight.get(key) ??
      0
    );
  };

  const linePixels = (item: OgTextItem, size: number) =>
    measurements.lineHeight.get(textKey(item.key, size)) ||
    size * item.lineHeight;

  const naturalLines = (item: OgTextItem, size: number) =>
    Math.max(1, Math.round(heightAt(item, size) / linePixels(item, size)));

  // Each text starts at the largest size it fits whole at: a title too long
  // for its lines at one size is set smaller before it is cut short.
  for (const item of plan.items) {
    if (item.kind !== 'text') continue;
    let index = 0;
    while (!acceptable(item, index)) index++;
    let whole = index;
    while (
      whole < item.sizes.length - 1 &&
      (!acceptable(item, whole) ||
        naturalLines(item, item.sizes[whole]!) > item.maxLines)
    )
      whole++;
    const fits =
      acceptable(item, whole) &&
      naturalLines(item, item.sizes[whole]!) <= item.maxLines;
    texts.set(item.key, {
      sizeIndex: fits ? whole : item.sizes.length - 1,
      lines: item.maxLines,
    });
  }

  const fitText = (item: OgTextItem): OgFittedText => {
    const state = texts.get(item.key)!;
    const size = item.sizes[state.sizeIndex]!;
    const measured = heightAt(item, size);
    const natural = naturalLines(item, size);
    const lines = Math.max(1, Math.min(natural, state.lines));
    const clamped = lines < natural;
    const breakWords = breaks(item, size);
    return {
      kind: 'text',
      key: item.key,
      size,
      lines,
      clamped,
      breakWords,
      height: Math.max(
        Math.ceil(
          clamped || !measured ? lines * linePixels(item, size) : measured,
        ),
        item.lead?.height ?? 0,
      ),
    };
  };

  const fitRow = (item: OgRowSpec): OgFittedRow => {
    const widths = item.items.map((entry) =>
      Math.min(
        measurements.itemWidth.get(`${item.key}/${entry.key}`) ?? 0,
        entry.maxWidth ?? plan.width,
      ),
    );
    const plusWidth = item.plus
      ? (count: number) =>
          measurements.itemWidth.get(plusKey(item.key, digitsOf(count))) ?? 0
      : undefined;
    const { shown, plus } = packRow(
      widths,
      item.gap,
      plan.width,
      plusWidth,
      item.hiddenCount,
    );
    return {
      kind: 'row',
      key: item.key,
      shown,
      plus,
      widths: widths.slice(0, shown),
      plusWidth: plus && plusWidth ? plusWidth(plus) : 0,
      height: item.height,
    };
  };

  const layout = () => {
    const fitted = new Map<string, OgFittedItem>();
    const order: { key: string; gapBefore: number }[] = [];
    let height = 0;
    for (const item of plan.items) {
      if (dropped.has(item.key)) continue;
      const result =
        item.kind === 'text'
          ? fitText(item)
          : item.kind === 'row'
            ? fitRow(item)
            : ({ kind: 'block', key: item.key, height: item.height } as const);
      // A row with nothing left in it is not drawn, and takes no gap.
      if (result.kind === 'row' && !result.shown && !result.plus) continue;
      fitted.set(item.key, result);
      const gapBefore = order.length ? item.gapBefore : 0;
      order.push({ key: item.key, gapBefore });
      height += gapBefore + result.height;
    }
    return { fitted, order, height };
  };

  const byKey = new Map(plan.items.map((item) => [item.key, item]));
  let current = layout();
  for (const step of plan.ladder) {
    if (current.height <= plan.height) break;
    const item = byKey.get(step.key);
    if (!item || dropped.has(step.key)) continue;
    if (step.op === 'drop') {
      if (item.required) continue;
      dropped.add(step.key);
      steps.push(`drop ${step.key}`);
    } else if (item.kind === 'text') {
      const state = texts.get(item.key)!;
      if (step.op === 'lines') {
        const natural = naturalLines(item, item.sizes[state.sizeIndex]!);
        if (Math.min(natural, state.lines) <= step.to) continue;
        state.lines = step.to;
        steps.push(`${step.key} ${step.to} lines`);
      } else {
        let next = state.sizeIndex + 1;
        while (next < item.sizes.length && !acceptable(item, next)) next++;
        if (next >= item.sizes.length) continue;
        state.sizeIndex = next;
        steps.push(`${step.key} ${item.sizes[next]}px`);
      }
    }
    current = layout();
  }

  // The last resort, for more data than the ladder foresaw. Optional texts
  // give up size and lines first; then whatever is optional goes, from the
  // bottom up; and only then does a required text — the title — give up
  // lines, keeping at least one. A layout whose required items alone
  // overflow is a bug its tests catch.
  const clampText = (item: OgTextItem) => {
    const state = texts.get(item.key)!;
    state.sizeIndex = item.sizes.length - 1;
    current = layout();
    while (current.height > plan.height && state.lines > 1) {
      const fitted = current.fitted.get(item.key) as OgFittedText;
      state.lines = Math.min(state.lines, fitted.lines) - 1;
      current = layout();
    }
    steps.push(`${item.key} clamped to ${state.lines}`);
  };
  const reversed = [...plan.items].reverse();
  for (const item of reversed) {
    if (current.height <= plan.height) break;
    if (item.kind === 'text' && !item.required && !dropped.has(item.key))
      clampText(item);
  }
  for (const item of reversed) {
    if (current.height <= plan.height) break;
    if (item.required || dropped.has(item.key)) continue;
    dropped.add(item.key);
    steps.push(`drop ${item.key}`);
    current = layout();
  }
  for (const item of reversed) {
    if (current.height <= plan.height) break;
    if (item.kind === 'text' && item.required) clampText(item);
  }

  return {
    items: current.fitted,
    order: current.order,
    height: current.height,
    steps,
    fits: current.height <= plan.height,
  };
}

/**
 * Chips of different widths and heights laid into rows, the way a tag cloud
 * wraps: in order, as many as fit, and a "+N" at the end of the last row for
 * the rest. The "+N" takes the place of as many chips as it needs.
 */
export function packCloud(
  items: { width: number; height: number }[],
  options: {
    width: number;
    height: number;
    gap: number;
    rowGap: number;
    plusWidth: (count: number) => number;
    plusHeight: number;
    hiddenCount?: number;
  },
): { rows: number[][]; plus: number; height: number } {
  const total = items.length + (options.hiddenCount ?? 0);
  const rows: number[][] = [];
  const rowHeight = (row: number[], withPlus = false) =>
    Math.max(
      withPlus ? options.plusHeight : 0,
      ...row.map((index) => items[index]!.height),
    );
  const rowWidth = (row: number[]) =>
    row.reduce(
      (sum, index, position) =>
        sum + items[index]!.width + (position ? options.gap : 0),
      0,
    );
  const heightOf = (all: number[][], plusInLast = false) =>
    all.reduce(
      (sum, row, index) =>
        sum +
        rowHeight(row, plusInLast && index === all.length - 1) +
        (index ? options.rowGap : 0),
      0,
    );

  for (let index = 0; index < items.length; index++) {
    const item = items[index]!;
    if (item.width > options.width) continue;
    const last = rows.at(-1);
    if (last && rowWidth(last) + options.gap + item.width <= options.width) {
      last.push(index);
      if (heightOf(rows) > options.height) {
        last.pop();
        break;
      }
      continue;
    }
    rows.push([index]);
    if (heightOf(rows) > options.height) {
      rows.pop();
      break;
    }
  }

  const shown = () => rows.reduce((sum, row) => sum + row.length, 0);
  let plus = total - shown();
  // Room for the count: taken from the end of the last row, or a row of
  // its own when there is height for one.
  while (plus > 0) {
    const last = rows.at(-1);
    const width = options.plusWidth(plus);
    if (last && rowWidth(last) + options.gap + width <= options.width) {
      if (heightOf(rows, true) <= options.height) break;
    } else if (
      heightOf([...rows, []], true) <= options.height &&
      width <= options.width
    ) {
      rows.push([]);
      break;
    }
    if (!last) break;
    last.pop();
    if (!last.length) rows.pop();
    plus = total - shown();
  }
  return { rows, plus, height: heightOf(rows, plus > 0) };
}

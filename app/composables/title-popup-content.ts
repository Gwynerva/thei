/**
 * What a title popup says. Kept free of Vue and auto-imports so the date
 * formatters and the tests can build popup content without a Nuxt context.
 *
 * An anchor always carries its text as plain `data-title-popup`, one line per
 * `\n`, which is also how a native `title` breaks lines. Formatting is opt-in
 * through `data-title-popup-rich`: the text is often the owner's own words, so
 * it is never parsed for markup.
 */

export type TitlePopupSpan = {
  text: string;
  italic?: boolean;
  bold?: boolean;
  /** Cuts the whole line to a few lines with an ellipsis. */
  clamp?: boolean;
};

/** A short break that sets the lines after it apart from those before. */
export type TitlePopupGap = { gap: true };

export type TitlePopupLine =
  string | TitlePopupSpan | (string | TitlePopupSpan)[] | TitlePopupGap;

export type TitlePopupInput = TitlePopupLine | false | null | undefined;

export type TitlePopupTextLine = {
  spans: Omit<TitlePopupSpan, 'clamp'>[];
  clamp?: boolean;
};

export type TitlePopupContentLine = TitlePopupTextLine | TitlePopupGap;

export type TitlePopupAttrs = {
  'data-title-popup': string | undefined;
  'data-title-popup-rich': string | undefined;
};

export const TITLE_POPUP_GAP: TitlePopupGap = Object.freeze({ gap: true });

export function isTitlePopupGap(line: unknown): line is TitlePopupGap {
  return (
    typeof line === 'object' &&
    line !== null &&
    (line as Partial<TitlePopupGap>).gap === true
  );
}

function normalizeLine(
  line: Exclude<TitlePopupLine, TitlePopupGap>,
): TitlePopupTextLine {
  const spans = (Array.isArray(line) ? line : [line])
    .map((span) => (typeof span === 'string' ? { text: span } : span))
    .filter((span) => span.text);
  const clamp = spans.some((span) => span.clamp);
  return {
    spans: spans.map(({ text, italic, bold }) => ({
      text,
      ...(italic && { italic }),
      ...(bold && { bold }),
    })),
    ...(clamp && { clamp }),
  };
}

function isFormatted(line: TitlePopupContentLine) {
  return (
    !isTitlePopupGap(line) &&
    (line.clamp || line.spans.some((span) => span.italic || span.bold))
  );
}

/**
 * The attributes of a popup, for `v-bind`. Empty lines are dropped, so a line
 * can be written as `note && { text: note, italic: true }`; with nothing left
 * there is no popup at all. A gap only survives between two lines with text,
 * so it disappears together with the line it introduces.
 */
export function titlePopup(...lines: TitlePopupInput[]): TitlePopupAttrs {
  const content: TitlePopupContentLine[] = [];
  let gap = false;
  for (const line of lines) {
    if (isTitlePopupGap(line)) {
      gap = content.length > 0;
      continue;
    }
    if (!line) continue;
    const normalized = normalizeLine(line);
    if (!normalized.spans.length) continue;
    if (gap) content.push(TITLE_POPUP_GAP);
    gap = false;
    content.push(normalized);
  }
  return {
    // A gap is a blank line in plain text, as a native `title` would show it.
    'data-title-popup': content.length
      ? content
          .map((line) =>
            isTitlePopupGap(line)
              ? ''
              : line.spans.map((span) => span.text).join(''),
          )
          .join('\n')
      : undefined,
    'data-title-popup-rich': content.some(isFormatted)
      ? JSON.stringify(content)
      : undefined,
  };
}

/**
 * The badge on an entity with a reminder: the reminder follows after a gap,
 * cut short.
 */
export function reminderTitlePopup(
  badge: string,
  reminder: string | null | undefined,
): TitlePopupAttrs {
  return titlePopup(
    badge,
    TITLE_POPUP_GAP,
    reminder && { text: reminder, italic: true, clamp: true },
  );
}

function parseRich(rich: string): TitlePopupContentLine[] | null {
  try {
    const parsed: unknown = JSON.parse(rich);
    if (!Array.isArray(parsed)) return null;
    return parsed.map((line) =>
      isTitlePopupGap(line)
        ? TITLE_POPUP_GAP
        : {
            ...normalizeLine(Array.isArray(line?.spans) ? line.spans : []),
            ...(line?.clamp === true && { clamp: true }),
          },
    );
  } catch {
    return null;
  }
}

/**
 * Reads what an anchor asks to show: the rich form when it is present and
 * readable, the plain text otherwise, where a blank line reads as a gap.
 * `null` when the element is no anchor.
 */
export function readTitlePopup(
  plain: string | undefined,
  rich: string | undefined,
): TitlePopupContentLine[] | null {
  if (plain === undefined) return null;
  const content =
    (rich && parseRich(rich)) ||
    plain
      .split('\n')
      .map((text) => (text ? { spans: [{ text }] } : TITLE_POPUP_GAP));
  return content.some((line) => !isTitlePopupGap(line) && line.spans.length)
    ? content
    : [];
}

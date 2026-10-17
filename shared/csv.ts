/**
 * Tables written as text, CSV and TSV, read as RFC 4180 does: a field in
 * double quotes may hold the delimiter, a line break and a doubled quote.
 */

const DELIMITERS = [',', ';', '\t', '|'] as const;

/**
 * The delimiter a table is written with: the one its first line holds most
 * often outside quotes. A spreadsheet in many languages writes `;`, a TSV
 * file a tab; a tie goes to `preferred`, the one the file's kind names.
 */
export function detectCsvDelimiter(text: string, preferred = ','): string {
  const counts = new Map<string, number>();
  let quoted = false;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === '\n' || char === '\r')) break;
    else if (!quoted && (DELIMITERS as readonly string[]).includes(char))
      counts.set(char, (counts.get(char) ?? 0) + 1);
  }
  let best = preferred;
  let most = counts.get(preferred) ?? 0;
  for (const delimiter of DELIMITERS) {
    const count = counts.get(delimiter) ?? 0;
    if (count > most) {
      best = delimiter;
      most = count;
    }
  }
  return best;
}

export interface CsvRows {
  rows: string[][];
  /** More rows follow than were read. */
  more: boolean;
}

/** The rows of a table's text, up to `maxRows`. */
export function parseCsv(
  text: string,
  delimiter: string,
  maxRows = Infinity,
): CsvRows {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;

  const endRow = () => {
    row.push(field);
    field = '';
    // A blank line between rows is no row.
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
  };

  for (; i < text.length; i++) {
    const char = text[i]!;
    if (quoted) {
      if (char !== '"') field += char;
      else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (char === '"' && field === '') quoted = true;
    else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      endRow();
      if (rows.length >= maxRows) return { rows, more: i + 1 < text.length };
    } else field += char;
  }
  if (field !== '' || row.length) endRow();
  return { rows: rows.slice(0, maxRows), more: rows.length > maxRows };
}

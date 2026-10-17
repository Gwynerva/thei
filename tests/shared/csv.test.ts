import { describe, expect, it } from 'vitest';
import { detectCsvDelimiter, parseCsv } from '../../shared/csv';

describe('csv', () => {
  it('finds the delimiter the first line uses', () => {
    expect(detectCsvDelimiter('a,b,c\n1,2,3')).toBe(',');
    expect(detectCsvDelimiter('Дата;Сумма;"Место, город"\n')).toBe(';');
    expect(detectCsvDelimiter('a\tb\n')).toBe('\t');
    expect(detectCsvDelimiter('one column')).toBe(',');
  });

  it('settles a tie by the delimiter the kind of file names', () => {
    const line = ['id', 'name, x', 'note, y'].join('\t');
    expect(detectCsvDelimiter(line)).toBe(',');
    expect(detectCsvDelimiter(line, '\t')).toBe('\t');
    // More of another still wins.
    expect(detectCsvDelimiter('a;b;c', '\t')).toBe(';');
  });

  it('reads quotes, doubled quotes and line breaks inside them', () => {
    const text =
      '\ufeffname;note\r\n"Шуя";"порог ""Бесовец""; легко"\n"Кумса";"обнос\nполдня"\n\n';
    expect(parseCsv(text, ';')).toEqual({
      rows: [
        ['name', 'note'],
        ['Шуя', 'порог "Бесовец"; легко'],
        ['Кумса', 'обнос\nполдня'],
      ],
      more: false,
    });
  });

  it('keeps a last row without a line break and empty fields', () => {
    expect(parseCsv('a,,c\n1,2,', ',').rows).toEqual([
      ['a', '', 'c'],
      ['1', '2', ''],
    ]);
  });

  it('stops after the rows asked for and says more follow', () => {
    const { rows, more } = parseCsv('h\n1\n2\n3\n', ',', 2);
    expect(rows).toEqual([['h'], ['1']]);
    expect(more).toBe(true);
  });
});

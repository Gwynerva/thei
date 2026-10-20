// Reading, checking and converting an archive: the conformance archive is
// clean, and each way of breaking the format is caught with its file named.
import { cpSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { addDays, resolveDay } from './dates';
import { convertText, scanText } from './dialect';
import { readArchive } from './read';
import { archiveSource } from './source';
import { validateArchive } from './validate';

const SEED_DAY = '2026-10-20';
const conformance = archiveSource('conformance').dir;
const made: string[] = [];

afterEach(() => {
  for (const dir of made.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

/** The conformance archive with some files written over. */
function archiveWith(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'thei-lab-archive-'));
  made.push(dir);
  cpSync(conformance, dir, { recursive: true });
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  const read = readArchive(dir);
  const validation = validateArchive(read.archive, { seedDay: SEED_DAY });
  return [...read.issues, ...validation.issues].map(
    (issue) => `${issue.file}: ${issue.message}`,
  );
}

describe('the conformance archive', () => {
  it('reads and checks without a single issue', () => {
    expect(archiveWith({})).toEqual([]);
  });
});

describe('what breaks the format is named', () => {
  const cases: [string, Record<string, string>, RegExp][] = [
    [
      'an unknown key',
      {
        'pages/x.md': '---\ntitle: X\nsummary: Y\ncolour: red\n---\n\nWords.\n',
      },
      /pages\/x\.md: unknown key colour/,
    ],
    [
      'a diary entry with a title',
      { 'diary/2022/2022-02-02.md': '---\ntitle: A day\n---\n\nWords.\n' },
      /a diary entry has no title/,
    ],
    [
      'a section with relations',
      {
        'projects/lamp/sections/09-x.md':
          '---\ntitle: X\nrelations:\n  - to: event:fair\n---\n\nWords.\n',
      },
      /a section has no relations/,
    ],
    [
      'a bad id',
      {
        'events/2021/Big_Fair.md':
          '---\ntitle: X\nsummary: Y\nperiods: [2021-01-01]\n---\n\nWords.\n',
      },
      /id "Big_Fair" is not/,
    ],
    [
      'a missing summary',
      {
        'events/2021/no-summary.md':
          '---\ntitle: X\nperiods: [2021-01-01]\n---\n\nWords.\n',
      },
      /summary is required/,
    ],
    [
      'a period that ends first',
      {
        'events/2021/back.md':
          '---\ntitle: X\nsummary: Y\nperiods: [2021-05-02..2021-05-01]\n---\n\nWords.\n',
      },
      /starts 2021-05-02 after it ends/,
    ],
    [
      'an event in another year',
      {
        'events/2022/wrong-year.md':
          '---\ntitle: X\nsummary: Y\nperiods: [2021-01-01]\n---\n\nWords.\n',
      },
      /starts in 2021, not 2022/,
    ],
    [
      'a relation to a section',
      {
        'diary/2022/2022-02-03.md':
          '---\nrelations:\n  - to: section:lamp/idea\n---\n\nWords.\n',
      },
      /only projects, events and diary entries are related/,
    ],
    [
      'a pair related twice',
      {
        'events/2021/fair.md':
          '---\ntitle: X\nsummary: Y\nperiods: [2021-05-15]\nrelations:\n  - to: project:lamp\n---\n\nWords.\n',
      },
      /already related/,
    ],
    [
      'a ref to nothing',
      { 'diary/2022/2022-02-04.md': 'About [nothing](ref:event:nowhere).\n' },
      /"event:nowhere" is not in the archive/,
    ],
    [
      'a missing heading',
      {
        'diary/2022/2022-02-05.md':
          'About [the idea](<ref:section:lamp/idea#h:No such heading>).\n',
      },
      /has no heading "No such heading"/,
    ],
    [
      'a recording where a picture stands',
      { 'diary/2022/2022-02-06.md': '::media{file="tone-mp3"}\n' },
      /file "tone-mp3" is audio, where a picture or a video stands/,
    ],
    [
      'a picture as a recording',
      { 'diary/2022/2022-02-07.md': '::audio{file="photo-a"}\n' },
      /file "photo-a" is image, where a recording stands/,
    ],
    [
      'a file that is not there',
      { 'diary/2022/2022-02-08.md': '::file{file="ghost"}\n' },
      /file "ghost" is not in files\//,
    ],
    [
      'a picture in Markdown',
      { 'diary/2022/2022-02-09.md': '![x](y.png)\n' },
      /never !\[\]\(\)/,
    ],
    [
      'a kind against its extension',
      {
        'files/odd.yaml':
          'kind: image\next: mp3\ntitle: X\nlicence: CC0-1.0\norigin: generated\n',
      },
      /kind image does not agree with \.mp3/,
    ],
    [
      'an action without a target',
      {
        'projects/garden/project.md':
          '---\ntitle: X\nsummary: Y\naction:\n  text: Press me\n---\n\nWords.\n',
      },
      /a link or a file, one of them/,
    ],
  ];
  for (const [what, files, pattern] of cases)
    it(what, () => {
      const issues = archiveWith(files);
      expect(issues.join('\n')).toMatch(pattern);
    });

  it('a relative day on an absolute one', () => {
    const day = addDays(SEED_DAY, 3);
    const issues = archiveWith({
      'diary/relative/today+3.md': 'Words.\n',
      [`diary/${day.slice(0, 4)}/${day}.md`]: 'Words.\n',
    });
    expect(issues.join('\n')).toMatch(
      new RegExp(`${day} already has an entry`),
    );
  });
});

describe('relative days', () => {
  it('are counted from the seed day', () => {
    expect(resolveDay('today', SEED_DAY)).toBe(SEED_DAY);
    expect(resolveDay('today+12', SEED_DAY)).toBe('2026-11-01');
    expect(resolveDay('today-20', SEED_DAY)).toBe('2026-09-30');
    expect(resolveDay('2019-05-04', SEED_DAY)).toBe('2019-05-04');
  });
});

describe('Lab Markdown into blocks', () => {
  const context = {
    owner: 'diary:2021-03-04',
    slot: 'body',
    file: (id: string) =>
      id === 'pic'
        ? { assetUuid: 'asset-1', kind: 'image' as const }
        : undefined,
    entity: (ref: string) =>
      ref === 'event:fair' ? { uuid: 'event-1' } : undefined,
    anchor: (_ref: string, words: string) =>
      words === 'Summary' ? 'summary' : undefined,
  };

  it('gives the same blocks, ids too, every time', () => {
    const text =
      '## Summary\n\nWords of [the fair](ref:event:fair).\n\n:::gallery\n::media{file="pic"}\n::media{file="pic"}\n:::\n\n:::private\nA secret.\n:::\n';
    expect(convertText(text, context)).toEqual(convertText(text, context));
    const { data } = convertText(text, context);
    expect(
      data.blocks.every(
        (block) => typeof block.id === 'string' && block.id.length === 10,
      ),
    ).toBe(true);
    expect(JSON.stringify(data)).toContain('"sectionId":"private-1"');
    expect(JSON.stringify(data)).toContain('"id":"g2"');
  });

  it('keeps only the words of a link to what the site has not yet', () => {
    const { data, problems } = convertText(
      'About [the lamp](ref:project:lamp "a note").',
      context,
    );
    expect(problems).toEqual([]);
    expect((data.blocks[0]!.data as { text: string }).text).toBe(
      'About the lamp.',
    );
  });

  it('turns a heading by its words into its anchor', () => {
    const { data } = convertText(
      '[Summary](<ref:event:fair#h:Summary>)',
      context,
    );
    expect((data.blocks[0]!.data as { text: string }).text).toContain(
      'data-entity-fragment="summary"',
    );
  });

  it('leaves out a card to what the site has not yet, and says nothing', () => {
    const { data, problems } = convertText(
      '::card{to="ref:page:about"}\n\nThen.',
      context,
    );
    expect(problems).toEqual([]);
    expect(data.blocks.map((block) => block.type)).toEqual(['paragraph']);
  });

  it('counts what a text uses', () => {
    const scan = scanText('**b** and :hint[h]{note="n"}\n\n- [x] yes\n');
    expect(Object.fromEntries(scan.constructs)).toMatchObject({
      bold: 1,
      hint: 1,
      'list-checklist': 1,
    });
  });
});

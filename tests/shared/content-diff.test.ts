import { describe, expect, it } from 'vitest';
import {
  diffContentBlocks,
  diffContentText,
  type ContentDiffItem,
} from '../../shared/content-diff';
import type {
  ContentOutputBlock,
  ContentOutputData,
} from '../../shared/content';

function paragraph(id: string | undefined, text: string): ContentOutputBlock {
  return { ...(id ? { id } : {}), type: 'paragraph', data: { text } };
}

/** Paragraphs as `id=text`, or plain text for a block without an id. */
function doc(...blocks: string[]): ContentOutputData {
  return {
    blocks: blocks.map((value) => {
      const [id, text] = value.includes('=') ? value.split('=') : [, value];
      return paragraph(id, text!);
    }),
  };
}

function summary(items: ContentDiffItem[]) {
  return items.map((item) =>
    item.kind === 'changed'
      ? `changed:${item.previous.data.text}>${item.block.data.text}`
      : `${item.kind}:${item.block.data.text}`,
  );
}

function diff(current: ContentOutputData, version: ContentOutputData) {
  return summary(diffContentBlocks(current, version));
}

describe('content diff', () => {
  it('keeps what both texts share, whatever their ids', () => {
    expect(diff(doc('a=A', 'b=B'), doc('x=A', 'y=B'))).toEqual([
      'same:A',
      'same:B',
    ]);
  });

  it('shows blocks that would go and blocks that would come', () => {
    expect(diff(doc('a=A', 'b=B', 'c=C'), doc('a=A', 'c=C'))).toEqual([
      'same:A',
      'removed:B',
      'same:C',
    ]);
    expect(diff(doc('a=A', 'c=C'), doc('a=A', 'b=B', 'c=C'))).toEqual([
      'same:A',
      'added:B',
      'same:C',
    ]);
  });

  it('knows a rewritten block by its id, among blocks added and removed', () => {
    // Every paragraph edited, one written in between and one deleted: each
    // edited paragraph is still itself, not whichever block sits beside it.
    const current = doc(
      'p1=First draft of the opening',
      'new=A thought added later',
      'p2=Second paragraph as it is now',
      'p3=Third paragraph, rewritten',
    );
    const version = doc(
      'p1=First version of the opening',
      'p2=Second paragraph as it was',
      'gone=A paragraph deleted since',
      'p3=Third paragraph',
    );
    expect(diff(current, version)).toEqual([
      'changed:First draft of the opening>First version of the opening',
      'removed:A thought added later',
      'changed:Second paragraph as it is now>Second paragraph as it was',
      'added:A paragraph deleted since',
      'changed:Third paragraph, rewritten>Third paragraph',
    ]);
  });

  it('pairs blocks without shared ids by their words', () => {
    // Split off with Enter or pasted: the ids differ, the words mostly agree.
    expect(
      diff(
        doc('Opening', 'a=The quick brown fox jumps', 'Ending'),
        doc('Opening', 'b=The slow brown fox jumps', 'Ending'),
      ),
    ).toEqual([
      'same:Opening',
      'changed:The quick brown fox jumps>The slow brown fox jumps',
      'same:Ending',
    ]);
    // Words that have nothing in common are one block gone, another come.
    expect(diff(doc('a=Apples'), doc('b=Oranges'))).toEqual([
      'removed:Apples',
      'added:Oranges',
    ]);
  });

  it('keeps a replacement of another kind as a removal and an addition', () => {
    const current = doc('a=A', 'b=Heading text');
    const version: ContentOutputData = {
      blocks: [
        current.blocks[0]!,
        { id: 'h', type: 'header', data: { text: 'Heading text', level: 2 } },
      ],
    };
    expect(
      diffContentBlocks(current, version).map((item) => item.kind),
    ).toEqual(['same', 'removed', 'added']);
  });

  it('compares the words of a rewritten block of text', () => {
    const [item] = diffContentBlocks(
      doc('p=The quick brown fox'),
      doc('p=The slow brown fox'),
    );
    expect(item).toMatchObject({
      kind: 'changed',
      words: [
        { kind: 'same', text: 'The ' },
        { kind: 'removed', text: 'quick' },
        { kind: 'added', text: 'slow' },
        { kind: 'same', text: ' brown fox' },
      ],
    });
  });

  it('shows both states of a block changed other than in its words', () => {
    const [styled] = diffContentBlocks(
      doc('p=Plain words'),
      doc('p=Plain <b>words</b>'),
    );
    expect(styled).toMatchObject({ kind: 'changed' });
    expect(styled).not.toHaveProperty('words');

    const media = (caption: string, assetUuid = 'file'): ContentOutputData => ({
      blocks: [
        {
          id: 'm',
          type: 'contentMedia',
          data: { layout: 'centered', caption, asset: { assetUuid } },
        },
      ],
    });
    const [captioned] = diffContentBlocks(media('Old'), media('New'));
    expect(captioned).toMatchObject({ kind: 'changed' });
    expect(captioned).not.toHaveProperty('words');
  });

  it('handles an empty side', () => {
    expect(diff(doc(), doc('a=A'))).toEqual(['added:A']);
    expect(diff(doc('a=A'), doc())).toEqual(['removed:A']);
  });

  it('stays quick on long texts', () => {
    const long = (prefix: string) =>
      doc(
        ...Array.from(
          { length: 3_000 },
          (_, index) => `${prefix}${index}=Paragraph ${prefix} ${index}`,
        ),
      );
    const started = performance.now();
    const items = diffContentBlocks(long('a'), long('b'));
    expect(items).toHaveLength(6_000);
    expect(performance.now() - started).toBeLessThan(2_000);
  });
});

describe('text diff', () => {
  it('reads a rewritten phrase as one phrase gone and one come', () => {
    expect(
      diffContentText('say one two three now', 'say four five six now'),
    ).toEqual([
      { kind: 'same', text: 'say ' },
      { kind: 'removed', text: 'one two three' },
      { kind: 'added', text: 'four five six' },
      { kind: 'same', text: ' now' },
    ]);
  });

  it('keeps punctuation apart from words', () => {
    expect(diffContentText('Hello, world', 'Hello world!')).toEqual([
      { kind: 'same', text: 'Hello' },
      { kind: 'removed', text: ',' },
      { kind: 'same', text: ' world' },
      { kind: 'added', text: '!' },
    ]);
  });
});

/**
 * What a text would look like, rebuilt from the diff: blocks that stay, go or
 * are rewritten read as the text now; blocks that stay, come or are rewritten
 * read as the version. Whatever the diff decides, neither text may lose,
 * gain or reorder a block.
 */
function sides(items: ContentDiffItem[]) {
  const text = (block: ContentOutputBlock) =>
    `${block.id ?? ''}:${block.type}:${JSON.stringify(block.data)}`;
  return {
    current: items.flatMap((item) =>
      item.kind === 'added'
        ? []
        : [text(item.kind === 'changed' ? item.previous : item.block)],
    ),
    version: items.flatMap((item) =>
      item.kind === 'removed' ? [] : [text(item.block)],
    ),
  };
}

function expectBothTextsKept(
  current: ContentOutputData,
  version: ContentOutputData,
) {
  const rebuilt = sides(diffContentBlocks(current, version));
  // A block that stays is shown as the version has it, so only the content
  // is compared there, not the id.
  const content = (value: string) => value.replace(/^[^:]*:/, '');
  expect(rebuilt.current.map(content)).toEqual(
    current.blocks.map((block) =>
      content(`${block.id ?? ''}:${block.type}:${JSON.stringify(block.data)}`),
    ),
  );
  expect(rebuilt.version).toEqual(
    version.blocks.map(
      (block) =>
        `${block.id ?? ''}:${block.type}:${JSON.stringify(block.data)}`,
    ),
  );
}

function boundary(id: string, sectionId: string, edge: 'start' | 'end') {
  return {
    id,
    type: 'privateSectionBoundary' as const,
    data: { sectionId, edge },
  };
}

describe('content diff: a rewritten block among other changes', () => {
  it('after blocks that would go', () => {
    expect(
      diff(
        doc(
          'a=Intro',
          'r1=Written today',
          'r2=Also written today',
          'b=Body now',
        ),
        doc('a=Intro', 'b=Body before'),
      ),
    ).toEqual([
      'same:Intro',
      'removed:Written today',
      'removed:Also written today',
      'changed:Body now>Body before',
    ]);
  });

  it('after blocks that would come', () => {
    expect(
      diff(
        doc('a=Intro', 'b=Body now'),
        doc(
          'a=Intro',
          'n1=Deleted since',
          'n2=Also deleted since',
          'b=Body before',
        ),
      ),
    ).toEqual([
      'same:Intro',
      'added:Deleted since',
      'added:Also deleted since',
      'changed:Body now>Body before',
    ]);
  });

  it('after blocks that would go and blocks that would come in one place', () => {
    expect(
      diff(
        doc('a=Intro', 'r=Written now', 'b=Body now'),
        doc('a=Intro', 'n=Lost since', 'b=Body before'),
      ),
    ).toEqual([
      'same:Intro',
      'removed:Written now',
      'added:Lost since',
      'changed:Body now>Body before',
    ]);
  });

  it('at the very start, with nothing unchanged before it', () => {
    expect(
      diff(doc('b=Body now', 'r=Added later'), doc('b=Body before')),
    ).toEqual(['changed:Body now>Body before', 'removed:Added later']);
    expect(
      diff(doc('n=Written first', 'b=Body now'), doc('b=Body before')),
    ).toEqual(['removed:Written first', 'changed:Body now>Body before']);
  });

  it('several in a row after a block that would go', () => {
    expect(
      diff(
        doc('r=Gone', 'p1=One now', 'p2=Two now', 'p3=Three now'),
        doc('p1=One then', 'p2=Two then', 'p3=Three then'),
      ),
    ).toEqual([
      'removed:Gone',
      'changed:One now>One then',
      'changed:Two now>Two then',
      'changed:Three now>Three then',
    ]);
  });

  it('with every other block around it changed too', () => {
    expect(
      diff(
        doc('p1=First now', 'x=Inserted', 'p2=Second now', 'p3=Third now'),
        doc(
          'y=Restored',
          'p1=First then',
          'p2=Second then',
          'z=Lost',
          'p3=Third then',
        ),
      ),
    ).toEqual([
      'added:Restored',
      'changed:First now>First then',
      'removed:Inserted',
      'changed:Second now>Second then',
      'added:Lost',
      'changed:Third now>Third then',
    ]);
  });

  it('when blocks around it have no ids to go by', () => {
    // Pasted text keeps no ids: the words decide, and an unrelated block that
    // goes is never taken for the rewritten one just because it comes first.
    expect(
      diff(
        doc('Intro', 'Something pasted in', 'The meeting ran long today'),
        doc('Intro', 'The meeting ran late today'),
      ),
    ).toEqual([
      'same:Intro',
      'removed:Something pasted in',
      'changed:The meeting ran long today>The meeting ran late today',
    ]);
  });

  it('does not take short lines sharing half their words for one another', () => {
    expect(diff(doc('Only now'), doc('Only then'))).toEqual([
      'removed:Only now',
      'added:Only then',
    ]);
  });

  it('pairs a block with its closest match, not the first one alike', () => {
    expect(
      diff(
        doc(
          'Morning walk by the river with the dog',
          'Morning walk by the river with the dog and two friend',
        ),
        doc('Morning walk by the river with the dog and two friends'),
      ),
    ).toEqual([
      'removed:Morning walk by the river with the dog',
      'changed:Morning walk by the river with the dog and two friend>Morning walk by the river with the dog and two friends',
    ]);
  });

  it('after a block moved elsewhere', () => {
    expect(
      diff(
        doc('m=Moved', 'a=Intro', 'b=Body now'),
        doc('a=Intro', 'b=Body before', 'm=Moved'),
      ),
    ).toEqual([
      'removed:Moved',
      'same:Intro',
      'changed:Body now>Body before',
      'added:Moved',
    ]);
  });

  it('after a block converted to another kind', () => {
    const current: ContentOutputData = {
      blocks: [
        paragraph('a', 'Intro'),
        { id: 'h', type: 'header', data: { text: 'Title', level: 2 } },
        paragraph('b', 'Body now'),
      ],
    };
    const version = doc('a=Intro', 'p=Title', 'b=Body before');
    expect(
      diffContentBlocks(current, version).map((item) => item.kind),
    ).toEqual(['same', 'removed', 'added', 'changed']);
  });

  it('after a paragraph split in two', () => {
    // Enter keeps the id on the first half and gives the second a new one.
    expect(
      diff(
        doc('p=One two three', 's=four five six', 'b=Body now'),
        doc('p=One two three four five six', 'b=Body before'),
      ),
    ).toEqual([
      'changed:One two three>One two three four five six',
      'removed:four five six',
      'changed:Body now>Body before',
    ]);
  });

  it('after a private section that would go', () => {
    const current: ContentOutputData = {
      blocks: [
        paragraph('a', 'Intro'),
        boundary('s', 'secret', 'start'),
        paragraph('x', 'Hidden thought'),
        boundary('e', 'secret', 'end'),
        paragraph('b', 'Body now'),
      ],
    };
    const items = diffContentBlocks(current, doc('a=Intro', 'b=Body before'));
    expect(items.map((item) => item.kind)).toEqual([
      'same',
      'removed',
      'removed',
      'removed',
      'changed',
    ]);
  });

  it('with ids that repeat inside one text', () => {
    // An id seen twice names no block; the content decides.
    expect(diff(doc('a=One', 'a=Two'), doc('a=One'))).toEqual([
      'same:One',
      'removed:Two',
    ]);
  });

  it('and shows its words compared after blocks that would go', () => {
    const items = diffContentBlocks(
      doc('r=Gone', 'b=We walked to the old bridge'),
      doc('b=We walked to the new bridge'),
    );
    expect(items[1]).toMatchObject({
      kind: 'changed',
      words: [
        { kind: 'same', text: 'We walked to the ' },
        { kind: 'removed', text: 'old' },
        { kind: 'added', text: 'new' },
        { kind: 'same', text: ' bridge' },
      ],
    });
  });
});

/** A small generator, so failures repeat. */
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

const VOCABULARY =
  'river bridge morning evening dog friend walk rain letter garden window road'.split(
    ' ',
  );

function sentence(next: () => number, length = 3 + Math.floor(next() * 6)) {
  return Array.from(
    { length },
    () => VOCABULARY[Math.floor(next() * VOCABULARY.length)],
  ).join(' ');
}

/**
 * A text and a version of it written some edits earlier: paragraphs typed
 * in, deleted and reworded, and with `moves` also moved around.
 */
function editedPair(seed: number, moves: boolean) {
  const next = random(seed);
  let counter = 0;
  const fresh = () =>
    paragraph(`n${seed}-${counter++}`, `${sentence(next)} ${counter}`);
  const version = Array.from({ length: 2 + Math.floor(next() * 8) }, fresh);
  const current = version.map((block) => ({
    ...block,
    data: { ...block.data },
  }));
  const edits = 1 + Math.floor(next() * 6);
  for (let edit = 0; edit < edits; edit++) {
    const roll = next();
    const at = Math.floor(next() * (current.length + 1));
    if (roll < 0.3) current.splice(at, 0, fresh());
    else if (roll < 0.5 && current.length)
      current.splice(at % current.length, 1);
    else if (roll < 0.85 && current.length) {
      const block = current[at % current.length]!;
      const words = String(block.data.text).split(' ');
      words.splice(Math.floor(next() * words.length), 1, VOCABULARY[edit]!);
      block.data = { text: words.join(' ') };
    } else if (moves && current.length > 1) {
      const [moved] = current.splice(at % current.length, 1);
      current.splice(Math.floor(next() * current.length), 0, moved!);
    }
  }
  return {
    current: { blocks: current } as ContentOutputData,
    version: { blocks: version } as ContentOutputData,
  };
}

describe('content diff on many generated edits', () => {
  it('never loses, adds or reorders a block of either text', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const { current, version } = editedPair(seed, true);
      expectBothTextsKept(current, version);
    }
  });

  it('shows a reworded block that was not moved as rewritten, wherever it is', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const { current, version } = editedPair(seed, false);
      const items = diffContentBlocks(current, version);
      const previous = new Map(
        version.blocks.map((block) => [block.id, block.data.text]),
      );
      for (const block of current.blocks) {
        const before = previous.get(block.id);
        if (before === undefined) continue;
        const item = items.find(
          (entry) =>
            (entry.kind === 'changed' ? entry.previous : entry.block).id ===
              block.id && entry.kind !== 'added',
        );
        expect(item?.kind, `seed ${seed}, block ${block.id}`).toBe(
          before === block.data.text ? 'same' : 'changed',
        );
      }
    }
  });
});

describe('text diff on many generated edits', () => {
  it('rebuilds both texts exactly from what it shows', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const next = random(seed);
      const before = sentence(next, 1 + Math.floor(next() * 20));
      const tokens = before.split(' ');
      for (let edit = 0; edit < 1 + Math.floor(next() * 4); edit++) {
        const at = Math.floor(next() * (tokens.length + 1));
        if (next() < 0.5) tokens.splice(at, 1);
        else tokens.splice(at, 0, `${VOCABULARY[edit]!},`);
      }
      const after = tokens.join(' ');
      const parts = diffContentText(before, after);
      const read = (skip: 'added' | 'removed') =>
        parts
          .filter((part) => part.kind !== skip)
          .map((part) => part.text)
          .join('');
      expect(read('added'), `seed ${seed}`).toBe(before);
      expect(read('removed'), `seed ${seed}`).toBe(after);
      // Nothing is shown twice in a row as the same kind.
      parts.forEach((part, index) =>
        expect(part.kind).not.toBe(parts[index - 1]?.kind),
      );
    }
  });

  it('handles Cyrillic, emoji and a text emptied or written from nothing', () => {
    expect(diffContentText('Привет, мир', 'Привет, мир! 👋')).toEqual([
      { kind: 'same', text: 'Привет, мир' },
      { kind: 'added', text: '! 👋' },
    ]);
    expect(diffContentText('', 'Новое')).toEqual([
      { kind: 'added', text: 'Новое' },
    ]);
    expect(diffContentText('Старое', '')).toEqual([
      { kind: 'removed', text: 'Старое' },
    ]);
  });
});

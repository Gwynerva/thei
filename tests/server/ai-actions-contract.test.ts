import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AI_ACTION_INFO,
  AI_ACTION_KINDS,
  AI_FIELD_ACTIONS,
} from '../../shared/ai-actions';
import { AI_ENTITY_TYPES, type AiActionItem } from '../../shared/ai';
import { ENTITY_KINDS } from '../../server/thei/entity-kinds';
import {
  diaryChanges,
  eventChanges,
  FORM_FIELDS,
  FORM_REFERENCE,
  pageChanges,
  profileChanges,
  projectChanges,
  tagChanges,
} from '../../server/thei/ai/forms/changes';
import { FORM_KEYS } from '../../server/thei/ai/forms/keys';
import { FIELD_PLACES } from '../../server/thei/ai/entity-panel';
import { AI_ACTION_DEFS } from '../../server/thei/ai/actions/registry';
import { takeInto } from '../../app/composables/entity-ai';
import enModule from '../../shared/language/list/en';
import ruModule from '../../shared/language/list/ru';

/**
 * Every kind of action is whole: the site knows how to check it, apply it,
 * tell where it stands and say what it proposes, and the cards know how to
 * show it. A new kind, or a new field of an entity, that misses one fails
 * here. A video's poster frame is no field and has no action, by the
 * owner's word: it is chosen by eye (`registry.ts`).
 */
describe('the kinds of action', () => {
  it('each have everything the site needs of them', () => {
    expect(Object.keys(AI_ACTION_DEFS).sort()).toEqual(
      [...AI_ACTION_KINDS].sort(),
    );
    for (const kind of AI_ACTION_KINDS) {
      const def = AI_ACTION_DEFS[kind];
      expect(def.kind).toBe(kind);
      expect(typeof def.schema.safeParse).toBe('function');
      expect(typeof def.prepare).toBe('function');
      expect(typeof def.apply).toBe('function');
      expect(typeof def.evaluate).toBe('function');
      expect(typeof def.summary).toBe('function');
      expect(typeof def.identity).toBe('function');
      // Every kind is about some entity — or a file — but a word of the
      // dictionary.
      if (kind !== 'term') expect(def.targets.length).toBeGreaterThan(0);
      for (const target of def.targets) {
        // A file is named as `asset:<id>` and is no entity of the archive.
        if (target !== 'asset') expect(ENTITY_KINDS).toContain(target);
        expect(AI_ENTITY_TYPES).toContain(target);
      }
      expect(AI_ACTION_INFO[kind]).toBeDefined();
      expect(def.reference.length).toBeGreaterThan(40);
    }
  });

  it('keep a file out of the entities, and its description in its kind', () => {
    expect(ENTITY_KINDS).not.toContain('asset');
    const fileKinds = AI_ACTION_KINDS.filter((kind) =>
      (AI_ACTION_DEFS[kind].targets as readonly string[]).includes('asset'),
    );
    expect(fileKinds).toEqual(['describe']);
    expect(AI_ACTION_INFO.describe.group).toBe('media');
  });

  it('name every kind in both languages', () => {
    for (const language of [enModule.phrases, ruModule.phrases])
      for (const kind of AI_ACTION_KINDS)
        expect(
          (language.ai_action_kinds as Record<string, string> | undefined)?.[
            kind
          ],
        ).toBeTruthy();
  });

  it('leave a final one to the owner, always', () => {
    for (const kind of AI_ACTION_KINDS) {
      const info = AI_ACTION_INFO[kind];
      if (info.final) expect(info.alwaysUnsure).toBe(true);
    }
  });

  it('set on their own only fields an entity has', () => {
    for (const [kind, fields] of Object.entries(AI_FIELD_ACTIONS)) {
      const form = FORM_FIELDS[
        kind as keyof typeof FORM_FIELDS
      ] as readonly string[];
      for (const field of fields) expect(form).toContain(field);
    }
  });

  it('reach every field of every form, through a change of it', () => {
    // `update` lays any change a form takes over it; its kinds are the forms'.
    expect([...AI_ACTION_DEFS.update.targets].sort()).toEqual(
      Object.keys(FORM_FIELDS).sort(),
    );
  });

  it('are shown in a card, whatever their kind', () => {
    // A kind the card says nothing of would show a bare head.
    const card = readFileSync(
      new URL('../../app/components/ai/AiActionChange.vue', import.meta.url),
      'utf8',
    );
    for (const kind of AI_ACTION_KINDS) expect(card).toContain(`'${kind}'`);
  });
});

/**
 * Where a form answers each kind's accept: laid into its fields, applied at
 * once — what the AI remembers is no part of the form — or opened elsewhere,
 * in its session or, a text edit, on its text's review. A new kind is placed
 * here; one said to be laid into a form is laid by `takeInto`.
 */
describe('a proposal in a form', () => {
  const self = 'project:p-1';
  const other = {
    ref: 'event:e-1',
    type: 'event',
    id: 'e-1',
    title: 'Ice walk',
  } as const;
  const action = (kind: string, payload: unknown, more = {}) =>
    ({
      kind,
      payload,
      base: null,
      refs: {},
      target: { ref: self, type: 'project', id: 'p-1', title: 'Parapet' },
      atomic: false,
      bundleUuid: null,
      ...more,
    }) as unknown as AiActionItem;

  /** Each kind laid into a form: a form that has its field, and a change of it. */
  const TAKEN: Record<
    string,
    { form: Record<string, unknown>; action: AiActionItem; key: string }
  > = {
    field: {
      form: { title: 'Parapet' },
      action: action('field', { field: 'title', value: 'Parapet II' }),
      key: 'title',
    },
    periods: {
      form: { periods: [] },
      action: action('periods', {
        periods: [{ startDate: '2020-01-01', endDate: '2020-01-02' }],
      }),
      key: 'periods',
    },
    access: {
      form: { access: 'private' },
      action: action('access', { access: 'public' }),
      key: 'access',
    },
    tags: {
      form: { tags: [] },
      action: action('tags', { add: [{ title: 'Games' }], remove: [] }),
      key: 'tags',
    },
    relation: {
      form: { relations: [] },
      action: action(
        'relation',
        { op: 'add', other: other.ref, relation: 'related' },
        { refs: { [other.ref]: other } },
      ),
      key: 'relations',
    },
    update: {
      form: { summary: 'Before' },
      action: action(
        'update',
        { changes: { summary: 'After' } },
        { base: { fields: ['summary'], after: { summary: 'After' } } },
      ),
      key: 'summary',
    },
    describe: {
      form: { description: '' },
      action: action('describe', { text: 'A lighthouse' }),
      key: 'description',
    },
  };
  /** What changes only the AI's memory: applied from the form at once. */
  const APPLIED = ['remember', 'term', 'memory-compact'];
  /** What a form cannot take: its session, or a text's own review. */
  const ELSEWHERE = ['note', 'write', 'revise', 'create', 'delete'];

  it('is laid in, applied or opened elsewhere, every kind', () => {
    expect([...Object.keys(TAKEN), ...APPLIED, ...ELSEWHERE].sort()).toEqual(
      [...AI_ACTION_KINDS].sort(),
    );
  });

  it('is laid into the field it changes, and taken back', () => {
    for (const [kind, { form, action: proposed, key }] of Object.entries(
      TAKEN,
    )) {
      const before = JSON.stringify(form[key]);
      const take = takeInto(form, proposed, self);
      expect(take, kind).toBeDefined();
      expect(JSON.stringify(form[key]), kind).not.toBe(before);
      take!.undo();
      expect(JSON.stringify(form[key]), kind).toBe(before);
    }
  });

  it('is not laid in when its kind goes elsewhere', () => {
    for (const kind of [...APPLIED, ...ELSEWHERE])
      expect(
        takeInto({ text: '', title: '' }, action(kind, {}), self),
        kind,
      ).toBeUndefined();
  });
});

describe('the fields of a form', () => {
  const kinds = Object.keys(FORM_FIELDS) as (keyof typeof FORM_FIELDS)[];

  it('are every key of the form a change is laid over', () => {
    // `FORM_KEYS` names each key of each form — the type check fails on a
    // key it misses — by the field a change of it names, or none.
    expect(Object.keys(FORM_KEYS).sort()).toEqual([...kinds].sort());
    for (const kind of kinds) {
      const named = Object.values(FORM_KEYS[kind] as Record<string, unknown>)
        .flat()
        .filter((field): field is string => typeof field === 'string');
      expect([...new Set(named)].sort(), kind).toEqual(
        [...FORM_FIELDS[kind]].sort(),
      );
    }
  });

  it('are told to a model, each in its kind’s line', () => {
    const lines = FORM_REFERENCE.split('\n');
    for (const kind of kinds) {
      const line = lines.find((text) => text.startsWith(`- ${kind}: `));
      expect(line, kind).toBeDefined();
      for (const field of FORM_FIELDS[kind])
        expect(line, `${kind}.${field}`).toMatch(
          new RegExp(`(?<![\\w-])${field}(?![\\w-])`),
        );
    }
  });

  it('are each laid over their form by its change', async () => {
    // A wrong value is refused by the field's own check, never as a field
    // the form does not take.
    const refusal = async (change: () => unknown) => {
      try {
        await change();
        return '';
      } catch (error) {
        return String((error as Error)?.message ?? error);
      }
    };
    const key = { kind: 'project', id: 'p-1' } as never;
    const section = { sectionUuid: 's-1', title: 'One', periods: [] };
    const change: Record<(typeof kinds)[number], (field: string) => unknown> = {
      project: (field) => projectChanges({} as never, { [field]: 42 }, key),
      'project-section': (field) =>
        projectChanges(
          { sections: [section] } as never,
          { sections: [{ id: 's-1', [field]: 42 }] },
          key,
        ),
      event: (field) => eventChanges({} as never, { [field]: 42 }, key),
      'diary-entry': (field) => diaryChanges({} as never, { [field]: 42 }, key),
      page: (field) => pageChanges({} as never, { [field]: 42 }),
      tag: (field) => tagChanges({} as never, { [field]: 42 }),
      profile: (field) => profileChanges({} as never, { [field]: 42 }),
    };
    for (const kind of kinds)
      for (const field of FORM_FIELDS[kind])
        expect(
          await refusal(() => change[kind](field)),
          `${kind}.${field}`,
        ).not.toMatch(/has no field/);
  });

  it('each have a place in their form, where a change of them waits', () => {
    for (const kind of kinds) {
      const places = FIELD_PLACES[kind] as Record<string, string>;
      expect(Object.keys(places).sort()).toEqual([...FORM_FIELDS[kind]].sort());
      for (const place of Object.values(places))
        expect(place).toMatch(
          /^(field:[a-z]+|periods|access|tags|relations|form)$/,
        );
    }
    // A field set on its own waits at its own label.
    for (const [kind, fields] of Object.entries(AI_FIELD_ACTIONS))
      for (const field of fields)
        expect([`field:${field}`, 'form']).toContain(
          (
            FIELD_PLACES[kind as keyof typeof FIELD_PLACES] as Record<
              string,
              string
            >
          )[field],
        );
  });

  it('are named in both languages, as a card of a change says them', () => {
    const fields = new Set(kinds.flatMap((kind) => FORM_FIELDS[kind]));
    for (const language of [enModule.phrases, ruModule.phrases])
      for (const field of fields)
        expect(
          (language.ai_action_fields as Record<string, string>)[field],
        ).toBeTruthy();
  });

  it('refuse a field their form does not take, rather than pass it over', async () => {
    const key = { kind: 'project', id: 'p-1' } as never;
    const changes = { colour: 'red' };
    await expect(projectChanges({} as never, changes, key)).rejects.toThrow(
      /no field "colour"/,
    );
    await expect(eventChanges({} as never, changes, key)).rejects.toThrow(
      /no field "colour"/,
    );
    await expect(diaryChanges({} as never, changes, key)).rejects.toThrow(
      /no field "colour"/,
    );
    await expect(pageChanges({} as never, changes)).rejects.toThrow(
      /no field "colour"/,
    );
    await expect(profileChanges({} as never, changes)).rejects.toThrow(
      /no field "colour"/,
    );
    expect(() => tagChanges({} as never, changes)).toThrow(/no field "colour"/);
  });
});

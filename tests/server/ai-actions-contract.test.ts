import { describe, expect, it } from 'vitest';
import {
  AI_ACTION_INFO,
  AI_ACTION_KINDS,
  AI_FIELD_ACTIONS,
} from '../../shared/ai-actions';
import { AI_ENTITY_TYPES } from '../../shared/ai';
import { ENTITY_KINDS } from '../../server/thei/entity-kinds';
import {
  diaryChanges,
  eventChanges,
  FORM_FIELDS,
  pageChanges,
  profileChanges,
  projectChanges,
  tagChanges,
} from '../../server/thei/ai/forms/changes';
import { FIELD_PLACES } from '../../server/thei/ai/entity-panel';
import { AI_ACTION_DEFS } from '../../server/thei/ai/actions/registry';
import enModule from '../../shared/language/list/en';
import ruModule from '../../shared/language/list/ru';

/**
 * Every kind of action is whole: the site knows how to check it, apply it,
 * tell where it stands and say what it proposes, and the cards know how to
 * show it. A new kind, or a new field of an entity, that misses one fails
 * here.
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
});

describe('the fields of a form', () => {
  const kinds = Object.keys(FORM_FIELDS) as (keyof typeof FORM_FIELDS)[];

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

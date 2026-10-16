import { describe, expect, it } from 'vitest';
import {
  AI_ACTION_INFO,
  AI_ACTION_KINDS,
  AI_FIELD_ACTIONS,
} from '../../shared/ai-actions';
import { AI_ENTITY_TYPES } from '../../shared/ai';
import { ENTITY_KINDS } from '../../server/thei/entity-kinds';
import { FORM_FIELDS } from '../../server/thei/ai/forms/changes';
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

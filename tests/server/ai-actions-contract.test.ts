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
      // Every kind is about some entity but a word of the dictionary.
      if (kind !== 'term') expect(def.targets.length).toBeGreaterThan(0);
      for (const target of def.targets) {
        expect(ENTITY_KINDS).toContain(target);
        expect(AI_ENTITY_TYPES).toContain(target);
      }
      expect(AI_ACTION_INFO[kind]).toBeDefined();
    }
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

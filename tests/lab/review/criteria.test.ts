import { describe, expect, it } from 'vitest';
import {
  CRITERIA,
  criteriaFor,
  DEFAULT_BAR,
  resolveBar,
  SEVERITIES,
  variantCode,
} from './criteria';

const ids = (list: ReturnType<typeof criteriaFor>) =>
  Object.fromEntries(
    list.map(({ criterion, variants }) => [criterion.id, variants]),
  );

describe('criteria', () => {
  it('are defined once, with unique ids and a label and meaning each', () => {
    expect(new Set(CRITERIA.map((c) => c.id)).size).toBe(CRITERIA.length);
    for (const c of CRITERIA) {
      expect(c.label).toBeTruthy();
      expect(c.meaning.length).toBeGreaterThan(20);
    }
    expect(SEVERITIES.map((s) => s.label)).toEqual([
      'blocker',
      'serious',
      'minor',
      'taste',
    ]);
  });

  it('give a novice owner the persona lens, the phone only on phones', () => {
    const list = ids(
      criteriaFor({ lens: 'persona', role: 'owner', experience: 'novice' }, [
        'dd',
        'pl',
      ]),
    );
    expect(Object.keys(list)).toEqual([
      'findability',
      'proximity',
      'feedback',
      'control',
      'wording',
      'trust',
      'consistency',
      'errors',
      'phone',
      'tidiness',
    ]);
    expect(list.phone).toEqual(['pl']);
    expect(list.tidiness).toEqual(['dd', 'pl']);
  });

  it('add the keyboard on computers and the routine for an expert', () => {
    const list = ids(
      criteriaFor({ lens: 'persona', role: 'owner', experience: 'expert' }, [
        'dd',
        'pl',
      ]),
    );
    expect(list.keyboard).toEqual(['dd']);
    expect(list['routine-speed']).toEqual(['dd', 'pl']);
    // A phone-only expert has no keyboard to judge.
    expect(
      ids(
        criteriaFor({ lens: 'persona', role: 'owner', experience: 'expert' }, [
          'pl',
        ]),
      ).keyboard,
    ).toBeUndefined();
    // A regular reader knows the site, but has no routine of an owner.
    const reader = ids(
      criteriaFor({ lens: 'persona', role: 'visitor', experience: 'expert' }, [
        'dd',
        'pl',
      ]),
    );
    expect(reader.keyboard).toBeUndefined();
    expect(reader['routine-speed']).toBeUndefined();
  });

  it('give the designer its own lens', () => {
    const list = ids(
      criteriaFor({ lens: 'designer' }, ['dd', 'dl', 'pd', 'pl']),
    );
    expect(Object.keys(list)).toEqual([
      'composition',
      'alignment',
      'spacing-rhythm',
      'overlaps',
      'typography',
      'component-consistency',
      'themes',
      'layout-phone',
    ]);
    expect(list['layout-phone']).toEqual(['pd', 'pl']);
  });

  it("follow a study's additions and omissions", () => {
    const list = ids(
      criteriaFor({ lens: 'persona', experience: 'novice' }, ['dd', 'pl'], {
        add: ['keyboard', 'composition'],
        skip: ['trust'],
      }),
    );
    expect(list.keyboard).toEqual(['dd']);
    expect(list.trust).toBeUndefined();
    // A criterion of the other lens stays with it.
    expect(list.composition).toBeUndefined();
    expect(() =>
      criteriaFor({ lens: 'persona' }, ['dd'], { add: ['speed'] }),
    ).toThrow(/Unknown criterion "speed"/);
  });

  it('fill the bar from the default', () => {
    expect(resolveBar()).toEqual(DEFAULT_BAR);
    expect(resolveBar({ minScore: 7 })).toEqual({
      ...DEFAULT_BAR,
      minScore: 7,
    });
    expect(variantCode({ viewport: 'phone', theme: 'light' })).toBe('pl');
  });
});

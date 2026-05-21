import { describe, it, expect } from 'vitest';
import ruModule, { plural } from '../../../../shared/language/list/ru';

const { normalize } = ruModule;

describe('normalize', () => {
  it('replaces ... with ellipsis', () => {
    expect(normalize!('Подождите...')).toBe('Подождите\u2026');
  });

  it('replaces -- with em dash', () => {
    expect(normalize!('один -- два')).toBe('один \u2014 два');
  });

  it('converts straight double quotes to guillemets', () => {
    expect(normalize!('"text"')).toBe('\u00ABtext\u00BB');
  });
});

describe('plural (славянские правила)', () => {
  it('1 → проект', () =>
    expect(plural(1, 'проект', 'проекта', 'проектов')).toBe('1 проект'));
  it('2 → проекта', () =>
    expect(plural(2, 'проект', 'проекта', 'проектов')).toBe('2 проекта'));
  it('5 → проектов', () =>
    expect(plural(5, 'проект', 'проекта', 'проектов')).toBe('5 проектов'));
  it('11 → проектов (подростковые)', () =>
    expect(plural(11, 'проект', 'проекта', 'проектов')).toBe('11 проектов'));
  it('12 → проектов (подростковые)', () =>
    expect(plural(12, 'проект', 'проекта', 'проектов')).toBe('12 проектов'));
  it('21 → проект (оканчивается на 1)', () =>
    expect(plural(21, 'проект', 'проекта', 'проектов')).toBe('21 проект'));
  it('22 → проекта (оканчивается на 2)', () =>
    expect(plural(22, 'проект', 'проекта', 'проектов')).toBe('22 проекта'));
  it('100 → проектов', () =>
    expect(plural(100, 'проект', 'проекта', 'проектов')).toBe('100 проектов'));
  it('includeNumber=false опускает число', () =>
    expect(plural(1, 'проект', 'проекта', 'проектов', false)).toBe('проект'));
});

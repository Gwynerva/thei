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

describe('Editor.js phrases', () => {
  it('provides Russian block names and controls', () => {
    expect(ruModule.phrases.content_editor_i18n).toMatchObject({
      text: 'Текст',
      media: 'Медиа',
      gallery: 'Галерея',
      file: 'Файл',
      add: 'Добавить',
      filter: 'Фильтр',
      click_to_delete: 'Точно удалить?',
      move_down: 'Спустить',
    });
    expect(ruModule.phrases.content_private_block).toBe('Приватный блок');
    expect(ruModule.phrases.content_private_section_start).toBe(
      'Начало приватной секции',
    );
    expect(ruModule.phrases.content_private_section_end).toBe(
      'Конец приватной секции',
    );
    expect(ruModule.phrases.content_snapshots).toBe('История версий');
    expect(ruModule.phrases.content_media_stretch).toBe('Растянуть');
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

describe('tag deletion usage', () => {
  it.each([
    [0, 0, 'нигде не используется'],
    [1, 0, '1 проекте'],
    [0, 1, '1 событии'],
    [2, 5, '2 проектах и 5 событиях'],
  ])('describes %s projects and %s events', (projects, events, expected) => {
    expect(
      ruModule.phrases.tag_delete_usage_warning(projects, events),
    ).toContain(expected);
  });
});

import { describe, it, expect } from 'vitest';
import enModule, { plural } from '../../../../shared/language/list/en';

const { normalize } = enModule;

describe('normalize', () => {
  it('replaces ... with ellipsis', () => {
    expect(normalize!('Wait...')).toBe('Wait\u2026');
  });

  it('replaces -- with em dash', () => {
    expect(normalize!('one -- two')).toBe('one \u2014 two');
  });

  it('converts straight double quotes to curly', () => {
    expect(normalize!('"hello"')).toBe('\u201Chello\u201D');
  });

  it('converts apostrophes in contractions to smart apostrophe', () => {
    expect(normalize!("don't")).toBe('don\u2019t');
  });
});

describe('Editor.js phrases', () => {
  it('provides English block names and controls', () => {
    expect(enModule.phrases.content_editor_i18n).toMatchObject({
      text: 'Text',
      media: 'Media',
      gallery: 'Gallery',
      file: 'File',
      add: 'Add',
      filter: 'Filter',
      click_to_delete: 'Really delete?',
      move_down: 'Move down',
    });
    expect(enModule.phrases.content_private_block).toBe('Private block');
    expect(enModule.phrases.content_private_section_start).toBe(
      'Start of private section',
    );
    expect(enModule.phrases.content_private_section_end).toBe(
      'End of private section',
    );
    expect(enModule.phrases.content_snapshots).toBe('Version history');
    expect(enModule.phrases.content_media_stretch).toBe('Stretch');
  });
});

describe('plural', () => {
  it('1 → one form', () =>
    expect(plural(1, 'project', 'projects')).toBe('1 project'));
  it('2 → few form', () =>
    expect(plural(2, 'project', 'projects')).toBe('2 projects'));
  it('0 → few form', () =>
    expect(plural(0, 'project', 'projects')).toBe('0 projects'));
  it('includeNumber=false omits count', () =>
    expect(plural(1, 'project', 'projects', false)).toBe('project'));
});

describe('tag deletion usage', () => {
  it.each([
    [0, 0, 'not in use'],
    [1, 0, '1 project'],
    [0, 1, '1 event'],
    [2, 5, '2 projects and 5 events'],
  ])('describes %s projects and %s events', (projects, events, expected) => {
    expect(
      enModule.phrases.tag_delete_usage_warning(projects, events),
    ).toContain(expected);
  });
});

import { describe, expect, it } from 'vitest';
import {
  readTitlePopup,
  reminderTitlePopup,
  titlePopup,
  TITLE_POPUP_GAP,
} from '../../../app/composables/title-popup-content';

describe('titlePopup', () => {
  it('keeps plain lines plain', () => {
    expect(titlePopup('One', 'Two')).toEqual({
      'data-title-popup': 'One\nTwo',
      'data-title-popup-rich': undefined,
    });
  });

  it('drops empty lines and leaves no popup when nothing is left', () => {
    expect(titlePopup('One', '', false, null, undefined)).toEqual({
      'data-title-popup': 'One',
      'data-title-popup-rich': undefined,
    });
    expect(titlePopup('', false)).toEqual({
      'data-title-popup': undefined,
      'data-title-popup-rich': undefined,
    });
  });

  it('carries formatting beside the plain text', () => {
    const attrs = titlePopup('Level', [
      { text: 'a ', bold: true },
      { text: 'note', italic: true },
    ]);
    expect(attrs['data-title-popup']).toBe('Level\na note');
    expect(
      readTitlePopup(attrs['data-title-popup'], attrs['data-title-popup-rich']),
    ).toEqual([
      { spans: [{ text: 'Level' }] },
      {
        spans: [
          { text: 'a ', bold: true },
          { text: 'note', italic: true },
        ],
      },
    ]);
  });

  it('puts a reminder on its own clamped italic line after a gap', () => {
    const attrs = reminderTitlePopup('Reminder', 'Call *mom*');
    expect(attrs['data-title-popup']).toBe('Reminder\n\nCall *mom*');
    expect(
      readTitlePopup(attrs['data-title-popup'], attrs['data-title-popup-rich']),
    ).toEqual([
      { spans: [{ text: 'Reminder' }] },
      { gap: true },
      { spans: [{ text: 'Call *mom*', italic: true }], clamp: true },
    ]);
  });

  it('keeps a gap only between two lines with text', () => {
    expect(
      titlePopup(TITLE_POPUP_GAP, 'a', TITLE_POPUP_GAP, TITLE_POPUP_GAP, 'b')[
        'data-title-popup'
      ],
    ).toBe('a\n\nb');
    expect(
      titlePopup('a', TITLE_POPUP_GAP, '', TITLE_POPUP_GAP)['data-title-popup'],
    ).toBe('a');
    expect(reminderTitlePopup('Reminder', '')['data-title-popup']).toBe(
      'Reminder',
    );
  });
});

describe('readTitlePopup', () => {
  it('is null for an element that is no anchor', () => {
    expect(readTitlePopup(undefined, undefined)).toBeNull();
  });

  it('breaks plain text on new lines and reads a blank one as a gap', () => {
    expect(readTitlePopup('a\n\nb', undefined)).toEqual([
      { spans: [{ text: 'a' }] },
      { gap: true },
      { spans: [{ text: 'b' }] },
    ]);
  });

  it('falls back to the plain text when the rich form is unreadable', () => {
    expect(readTitlePopup('a', '{oops')).toEqual([{ spans: [{ text: 'a' }] }]);
    expect(readTitlePopup('a', '{"spans":1}')).toEqual([
      { spans: [{ text: 'a' }] },
    ]);
  });

  it('shows nothing for an empty text', () => {
    expect(readTitlePopup('', undefined)).toEqual([]);
  });
});

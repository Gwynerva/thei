import { onBeforeUnmount, onMounted } from 'vue';
import { activeOpenDialog, modalStack, modalWait } from './modal';

/**
 * Keyboard shortcuts, one way for the whole site.
 *
 * A chord is matched by the physical key (`KeyboardEvent.code`), so Ctrl+K is
 * the same key in any layout — on a Russian one it types «л». It is pressed
 * with the platform's primary modifier: Cmd on a Mac, Ctrl elsewhere. A key
 * that stands for its character, as "/" does, is matched by what it types.
 * Typing in a field and a modal on top keep the keys their own.
 */

/** Whether Cmd, rather than Ctrl, is the modifier of shortcuts here. */
export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } })
      .userAgentData?.platform || navigator.platform;
  return /mac|iphone|ipad|ipod/i.test(platform ?? '');
}

/** A physical key pressed with the primary modifier, and Shift or not. */
export interface Chord {
  code: string;
  shift?: boolean;
}

/** A key that belongs to an input method putting a character together. */
function composing(event: KeyboardEvent) {
  return event.isComposing || event.keyCode === 229;
}

/** Alt, or AltGr, with which a layout types characters of its own. */
function alternate(event: KeyboardEvent) {
  return event.altKey || Boolean(event.getModifierState?.('AltGraph'));
}

export function matchChord(event: KeyboardEvent, chord: Chord): boolean {
  if (composing(event) || alternate(event)) return false;
  const mac = isMacPlatform();
  const primary = mac ? event.metaKey : event.ctrlKey;
  const other = mac ? event.ctrlKey : event.metaKey;
  return (
    primary &&
    !other &&
    event.shiftKey === (chord.shift ?? false) &&
    event.code === chord.code
  );
}

/**
 * Undo and redo: the primary modifier with Z, and Shift for redo, which
 * Windows also takes as Ctrl+Y.
 */
export function historyKey(event: KeyboardEvent): 'undo' | 'redo' | undefined {
  if (matchChord(event, { code: 'KeyZ' })) return 'undo';
  if (matchChord(event, { code: 'KeyZ', shift: true })) return 'redo';
  if (!isMacPlatform() && matchChord(event, { code: 'KeyY' })) return 'redo';
  return undefined;
}

/**
 * "/" typed on its own. Layouts put it on different keys — Shift+7 on a
 * German one, Shift+\ on a Russian one — so it is read by the character; the
 * Russian layout of Windows types "." on the key of "/", which counts too.
 * That key types other characters elsewhere — "-" on a German layout, "!" on
 * a French one — and those are not "/".
 */
export function matchSlash(event: KeyboardEvent): boolean {
  if (composing(event) || alternate(event)) return false;
  if (event.ctrlKey || event.metaKey) return false;
  return event.key === '/' || (event.code === 'Slash' && event.key === '.');
}

/** What the keyboard types into: its keys are the text's. */
const EDITABLE_SELECTOR = [
  'input:not([type="checkbox"], [type="radio"], [type="button"], [type="submit"], [type="reset"], [type="range"], [type="color"], [type="file"])',
  'textarea',
  'select',
  '[contenteditable]:not([contenteditable="false"])',
].join(', ');

/** The nearest of the target and its ancestors that matches. */
function closest(target: EventTarget | null | undefined, selector: string) {
  return (target as Partial<Element> | null | undefined)?.closest?.(selector);
}

export function isEditableTarget(target: EventTarget | null): boolean {
  return Boolean(closest(target, EDITABLE_SELECTOR));
}

/** Whether a modal is in front of the page, or the event came from one. */
export function isModalOpen(event?: Event): boolean {
  if (modalStack.value.length > 0 || modalWait.value) return true;
  if (typeof document !== 'undefined' && activeOpenDialog()) return true;
  return Boolean(closest(event?.target, 'dialog'));
}

/**
 * Runs `handler` for the keys `match` accepts, while the component is
 * mounted. It stays away from a key already taken, from typing in a field
 * and from a modal on top, unless `options` let it in; there the browser
 * keeps its own meaning of the key. A key it takes is the page's: its
 * default is prevented, and a key held down acts once.
 */
export function useShortcut(
  match: (event: KeyboardEvent) => boolean,
  handler: (event: KeyboardEvent) => void,
  options: {
    allowInEditable?: boolean;
    allowInModal?: boolean;
    capture?: boolean;
  } = {},
): void {
  const capture = options.capture ?? false;

  function onKeyDown(event: KeyboardEvent) {
    if (event.defaultPrevented || !match(event)) return;
    if (!options.allowInEditable && isEditableTarget(event.target)) return;
    if (!options.allowInModal && isModalOpen(event)) return;
    // The repeats of a held key are kept from the browser too, or they would
    // reach its own shortcut on the same keys.
    event.preventDefault();
    if (!event.repeat) handler(event);
  }

  onMounted(() => window.addEventListener('keydown', onKeyDown, capture));
  onBeforeUnmount(() =>
    window.removeEventListener('keydown', onKeyDown, capture),
  );
}

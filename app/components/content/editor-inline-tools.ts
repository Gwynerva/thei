import type {
  API,
  InlineTool,
  InlineToolConstructorOptions,
} from '@editorjs/editorjs';
import type { MenuConfig } from '@editorjs/editorjs/types/tools/menu-config';
import type { VirtualElement } from '@floating-ui/vue';
import {
  contentEntityReference,
  contentInlineLinkSanitizeConfig,
} from '#layers/thei/shared/content-link';
import type {
  ContentHintRequest,
  ContentInlineLinkRequest,
  ContentInlineMarkupRequest,
} from './editor-inline-links';
import { editorIcon } from './editor-icons';
import {
  applyLinkAttributes,
  placeCaretAfter,
  unwrapNestedLinks,
  type InlineLinkAttributes,
} from './editor-inline-link-dom';
import {
  copyInlineLinkRect,
  inlineLinkPopupAnchorRect,
  translateInlineLinkRect,
  trimCurrentInlineSelection,
} from './editor-inline-selection';

export class ContentBoldTool implements InlineTool {
  static isInline = true as const;
  static title = 'Bold';
  static sanitize = { b: {}, strong: {} };

  constructor(_options: InlineToolConstructorOptions) {}

  get shortcut() {
    return 'CMD+B';
  }

  render(): MenuConfig {
    return {
      name: 'contentBold',
      icon: editorIcon('bold'),
      onActivate: () => runInlineCommand('bold'),
      isActive: () => document.queryCommandState('bold'),
    };
  }
}

export class ContentItalicTool implements InlineTool {
  static isInline = true as const;
  static title = 'Italic';
  static sanitize = { i: {}, em: {} };

  constructor(_options: InlineToolConstructorOptions) {}

  get shortcut() {
    return 'CMD+I';
  }

  render(): MenuConfig {
    return {
      name: 'contentItalic',
      icon: editorIcon('italic'),
      onActivate: () => runInlineCommand('italic'),
      isActive: () => document.queryCommandState('italic'),
    };
  }
}

export class ContentStrikeTool implements InlineTool {
  static isInline = true as const;
  static title = 'Strikethrough';
  // `execCommand` still emits the ancient `strike`; normalization rewrites it
  // to `s`, so both are accepted on the way in.
  static sanitize = { s: {}, strike: {} };

  constructor(_options: InlineToolConstructorOptions) {}

  get shortcut() {
    return 'CMD+SHIFT+X';
  }

  render(): MenuConfig {
    return {
      name: 'contentStrike',
      icon: editorIcon('strikethrough'),
      onActivate: () => runInlineCommand('strikeThrough'),
      isActive: () => document.queryCommandState('strikeThrough'),
    };
  }
}

/**
 * An inline tool that marks a span of text with one element — a link, a
 * hint — and edits that element through a popup of its own.
 *
 * The shape is the same for every kind: the selection is trimmed to the
 * text, highlighted and remembered, the popup opens beside the toolbar, and
 * whatever it decides is written back into the remembered selection. The
 * subclasses only say what element they look for and what the popup needs.
 */
abstract class ContentInlineMarkupTool<
  Request extends ContentInlineMarkupRequest,
> implements InlineTool {
  static isInline = true as const;

  protected existing?: HTMLElement;
  private highlighted = false;

  constructor(
    protected options: {
      api: API;
      config: { open: (request: Request) => void };
    },
  ) {}

  protected abstract readonly menuName: string;
  protected abstract readonly menuIcon: string;
  protected abstract findExisting(): HTMLElement | undefined;
  protected abstract createRequest(base: ContentInlineMarkupRequest): Request;

  render(): MenuConfig {
    this.existing = this.findExisting();
    return {
      name: this.menuName,
      icon: this.menuIcon,
      isActive: this.menuActive(),
      onActivate: (_item, event) => this.openControls(event),
    };
  }

  /** Whether the toolbar shows the tool as applied to the selection. */
  protected menuActive() {
    return Boolean(this.existing);
  }

  private openControls(event?: PointerEvent) {
    const eventElement =
      event?.currentTarget instanceof HTMLElement
        ? event.currentTarget
        : event?.target instanceof HTMLElement
          ? event.target
          : undefined;
    const trigger =
      eventElement?.closest<HTMLElement>('button, [role="button"]') ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement.closest<HTMLElement>('button, [role="button"]')
        : null);
    if (!trigger) return;
    if (!this.existing && !trimCurrentInlineSelection()) return;

    const anchor = createInlineLinkAnchor(trigger);
    this.options.api.selection.setFakeBackground();
    this.options.api.selection.save();
    this.highlighted = true;
    const request = this.createRequest({
      anchor,
      existing: Boolean(this.existing),
      remove: () => this.remove(),
      restore: () => this.restoreSelection(),
    });
    // Trimming changes the native selection, so Editor.js closes its inline
    // toolbar during this click. Open our popup after that selection cycle.
    queueMicrotask(() => this.options.config.open(request));
  }

  private restoreSelection() {
    if (!this.highlighted) return;
    this.options.api.selection.restore();
    this.options.api.selection.removeFakeBackground();
    this.highlighted = false;
  }

  /**
   * The element the outcome is written to: the existing one, or a new one
   * wrapped around the remembered selection. Nothing when there is neither.
   */
  protected wrapSelection(
    create: () => HTMLElement,
    emptyContent?: string,
  ): HTMLElement | undefined {
    this.restoreSelection();
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : undefined;
    if (!range) return undefined;
    if (this.existing) return this.existing;
    if (range.collapsed && !emptyContent) return undefined;
    const element = create();
    if (range.collapsed) element.textContent = emptyContent!;
    else element.append(range.extractContents());
    range.insertNode(element);
    return element;
  }

  /** Done: the caret goes after the element and the toolbar closes. */
  protected finish(element: Element) {
    placeCaretAfter(element);
    this.options.api.inlineToolbar.close();
  }

  protected remove() {
    this.restoreSelection();
    const element = this.existing;
    if (!element) return;
    element.replaceWith(...Array.from(element.childNodes));
    this.options.api.inlineToolbar.close();
  }
}

/** A note attached to a span of text: dotted underline, explanation on hover. */
export class ContentHintTool extends ContentInlineMarkupTool<ContentHintRequest> {
  static title = 'Hint';
  static sanitize = { abbr: { 'data-content-hint': true } };

  protected readonly menuName = 'contentHint';
  protected readonly menuIcon = editorIcon('hint');

  protected findExisting() {
    const found = this.options.api.selection.findParentTag('ABBR');
    return found instanceof HTMLElement &&
      found.dataset.contentHint !== undefined
      ? found
      : undefined;
  }

  protected createRequest(
    base: ContentInlineMarkupRequest,
  ): ContentHintRequest {
    return {
      ...base,
      initialText: this.existing?.dataset.contentHint ?? '',
      apply: (text) => this.applyHint(text),
    };
  }

  private applyHint(text: string) {
    const value = text.trim();
    if (!value) {
      this.remove();
      return;
    }
    const element = this.wrapSelection(() => document.createElement('abbr'));
    if (!element) return;
    element.dataset.contentHint = value;
    this.finish(element);
  }
}

abstract class ContentInlineLinkTool extends ContentInlineMarkupTool<ContentInlineLinkRequest> {
  static sanitize = { a: contentInlineLinkSanitizeConfig() };

  protected abstract matches(link: HTMLAnchorElement): boolean;

  /**
   * Any link the selection is in, of either kind: a link is never nested in
   * a link, so the other kind's tool rewrites the same element instead.
   * Only a link of its own kind lights the tool up in the toolbar, though.
   */
  protected findExisting() {
    const link = this.options.api.selection.findParentTag('A');
    return link instanceof HTMLAnchorElement ? link : undefined;
  }

  protected override menuActive() {
    return (
      this.existing instanceof HTMLAnchorElement && this.matches(this.existing)
    );
  }

  protected createRequest(
    base: ContentInlineMarkupRequest,
  ): ContentInlineLinkRequest {
    const existing = this.existing;
    return {
      ...base,
      initialUrl: existing?.getAttribute('href') ?? undefined,
      initialNote: existing?.getAttribute('data-content-note') ?? undefined,
      initialEntity:
        existing?.dataset.contentLink === 'entity'
          ? contentEntityReference(
              existing.dataset.entityType,
              existing.dataset.entityId,
            )
          : undefined,
      apply: (label, attributes) => this.applyLink(label, attributes),
    };
  }

  private applyLink(label: string, attributes: InlineLinkAttributes) {
    const link = this.wrapSelection(() => document.createElement('a'), label);
    if (!(link instanceof HTMLAnchorElement)) return;
    unwrapNestedLinks(link);
    applyLinkAttributes(link, attributes);
    if (!link.textContent?.trim()) link.textContent = label;
    this.finish(link);
  }
}

export class ContentEntityLinkTool extends ContentInlineLinkTool {
  static title = 'Internal link';
  protected readonly menuName = 'contentEntityLink';
  protected readonly menuIcon = editorIcon('link');

  protected matches(link: HTMLAnchorElement) {
    return link.dataset.contentLink === 'entity';
  }
}

export class ContentExternalInlineLinkTool extends ContentInlineLinkTool {
  static title = 'External link';
  protected readonly menuName = 'contentExternalInlineLink';
  protected readonly menuIcon = editorIcon('external-link');

  protected matches(link: HTMLAnchorElement) {
    return link.dataset.contentLink === 'external';
  }
}

function runInlineCommand(command: string) {
  if (!trimCurrentInlineSelection()) return;
  document.execCommand(command);
}

function createInlineLinkAnchor(trigger: HTMLElement): VirtualElement {
  const toolbar = trigger.closest<HTMLElement>('.ce-inline-toolbar') ?? trigger;
  const popupAnchorRect = inlineLinkPopupAnchorRect(
    copyInlineLinkRect(toolbar.getBoundingClientRect()),
  );
  const tracker = trigger.closest<HTMLElement>('.content-editor') ?? trigger;
  const trackerRect = copyInlineLinkRect(tracker.getBoundingClientRect());
  const contextElement =
    trigger.closest<HTMLElement>('.content-editor') ?? tracker;

  return {
    contextElement,
    getBoundingClientRect: () =>
      translateInlineLinkRect(
        popupAnchorRect,
        trackerRect,
        tracker.getBoundingClientRect(),
      ),
    getClientRects: () => [
      translateInlineLinkRect(
        popupAnchorRect,
        trackerRect,
        tracker.getBoundingClientRect(),
      ),
    ],
  };
}

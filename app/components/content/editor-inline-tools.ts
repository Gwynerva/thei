import type {
  API,
  InlineTool,
  InlineToolConstructorOptions,
} from '@editorjs/editorjs';
import type { MenuConfig } from '@editorjs/editorjs/types/tools/menu-config';
import type { VirtualElement } from '@floating-ui/vue';
import { contentInlineLinkSanitizeConfig } from '#layers/thei/shared/content-link';
import type { ContentInlineLinkRequest } from './editor-inline-links';
import { editorIcon } from './editor-icons';
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

  constructor(private options: InlineToolConstructorOptions) {}

  get shortcut() {
    return 'CMD+B';
  }

  render(): MenuConfig {
    return {
      name: 'contentBold',
      icon: editorIcon('bold'),
      onActivate: () => runInlineCommand(this.options, 'bold'),
      isActive: () => document.queryCommandState('bold'),
    };
  }
}

export class ContentItalicTool implements InlineTool {
  static isInline = true as const;
  static title = 'Italic';
  static sanitize = { i: {}, em: {} };

  constructor(private options: InlineToolConstructorOptions) {}

  get shortcut() {
    return 'CMD+I';
  }

  render(): MenuConfig {
    return {
      name: 'contentItalic',
      icon: editorIcon('italic'),
      onActivate: () => runInlineCommand(this.options, 'italic'),
      isActive: () => document.queryCommandState('italic'),
    };
  }
}

abstract class ContentInlineLinkTool implements InlineTool {
  static isInline = true as const;
  static sanitize = { a: contentInlineLinkSanitizeConfig() };

  protected existingLink?: HTMLAnchorElement;
  private selectionHighlighted = false;

  constructor(
    protected options: {
      api: API;
      config: {
        open: (request: ContentInlineLinkRequest) => void;
      };
    },
  ) {}

  render(): MenuConfig {
    this.existingLink = this.findMatchingLink();
    return {
      name: this.menuName,
      icon: this.menuIcon,
      isActive: Boolean(this.existingLink),
      onActivate: (_item, event) => this.openControls(event),
    };
  }

  protected abstract menuName: string;
  protected abstract menuIcon: string;
  protected abstract matches(link: HTMLAnchorElement): boolean;

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
    if (!this.existingLink && !trimCurrentInlineSelection()) return;

    const anchor = createInlineLinkAnchor(trigger);
    this.options.api.selection.setFakeBackground();
    this.options.api.selection.save();
    this.selectionHighlighted = true;
    const request: ContentInlineLinkRequest = {
      anchor,
      existing: Boolean(this.existingLink),
      initialUrl: this.existingLink?.getAttribute('href') ?? undefined,
      apply: (label, attributes) => this.applyLink(label, attributes),
      remove: () => this.removeLink(),
      restore: () => this.restoreSelection(),
    };
    // Trimming changes the native selection, so Editor.js closes its inline
    // toolbar during this click. Open our popup after that selection cycle.
    queueMicrotask(() => this.options.config.open(request));
  }

  private restoreSelection() {
    if (!this.selectionHighlighted) return;
    this.options.api.selection.restore();
    this.options.api.selection.removeFakeBackground();
    this.selectionHighlighted = false;
  }

  protected findMatchingLink() {
    const link = this.options.api.selection.findParentTag('A');
    return link instanceof HTMLAnchorElement && this.matches(link)
      ? link
      : undefined;
  }

  protected applyLink(
    label: string,
    attributes: Record<string, string | undefined>,
  ) {
    this.applyLinkNow(label, attributes);
  }

  private applyLinkNow(
    label: string,
    attributes: Record<string, string | undefined>,
  ) {
    this.restoreSelection();
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : undefined;
    if (!range) return;
    const link = this.existingLink ?? document.createElement('a');
    if (!this.existingLink) {
      if (range.collapsed) link.textContent = label;
      else link.append(range.extractContents());
      range.insertNode(link);
    }
    for (const [name, value] of Object.entries(attributes)) {
      if (value === undefined) link.removeAttribute(name);
      else link.setAttribute(name, value);
    }
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
    if (!link.textContent?.trim()) link.textContent = label;
    selection?.removeAllRanges();
    const after = document.createRange();
    after.setStartAfter(link);
    after.collapse(true);
    selection?.addRange(after);
    this.options.api.inlineToolbar.close();
  }

  protected removeLink() {
    this.removeLinkNow();
  }

  private removeLinkNow() {
    this.restoreSelection();
    const link = this.existingLink;
    if (!link) return;
    link.replaceWith(...Array.from(link.childNodes));
    this.options.api.inlineToolbar.close();
  }
}

function runInlineCommand(
  options: InlineToolConstructorOptions,
  command: string,
) {
  if (!trimCurrentInlineSelection()) return;
  document.execCommand(command);
}

export function createInlineLinkAnchor(trigger: HTMLElement): VirtualElement {
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

export class ContentEntityLinkTool extends ContentInlineLinkTool {
  static title = 'Project link';
  protected menuName = 'contentEntityLink';
  protected menuIcon = editorIcon('link');

  protected matches(link: HTMLAnchorElement) {
    return link.dataset.contentLink === 'entity';
  }
}

export class ContentExternalInlineLinkTool extends ContentInlineLinkTool {
  static title = 'External link';
  protected menuName = 'contentExternalInlineLink';
  protected menuIcon = editorIcon('external-link');

  protected matches(link: HTMLAnchorElement) {
    return link.dataset.contentLink === 'external';
  }
}

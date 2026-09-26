import type { BlockAPI, BlockTune } from '@editorjs/editorjs';
import type { MenuConfig } from '@editorjs/editorjs/types/tools/menu-config';
import { editorIcon } from './editor-icons';

export interface ContentSpoilerTuneConfig {
  /** Label of the toggle in the block settings menu, and of the badge. */
  title: string;
}

/**
 * Marks a block as a spoiler: still there, still readable, but not before the
 * reader asks for it.
 *
 * The state is written on the block's own content column, and a badge in the
 * gap above the column says so. Nothing is wrapped, so the column keeps the
 * layout Editor.js gives it, and the badge is `data-mutation-free`: adding or
 * removing it is not a change of the content — the toggle reports that
 * change itself.
 */
export class ContentSpoilerTune implements BlockTune {
  static isTune = true as const;

  private readonly block: BlockAPI;
  private readonly config: ContentSpoilerTuneConfig;
  private active: boolean;
  private content?: HTMLElement;
  private badge?: HTMLElement;

  constructor(options: {
    data?: unknown;
    block: BlockAPI;
    config?: ContentSpoilerTuneConfig;
  }) {
    this.block = options.block;
    this.config = options.config ?? { title: 'Spoiler' };
    this.active = options.data === true;
  }

  render(): MenuConfig {
    return {
      icon: editorIcon('visibility-off'),
      title: this.config.title,
      toggle: true,
      isActive: this.active,
      closeOnActivate: true,
      onActivate: () => this.toggle(),
    };
  }

  /** Not a wrapper: the column is handed back as it is, only remembered. */
  wrap(blockContent: HTMLElement): HTMLElement {
    this.content = blockContent;
    this.sync();
    return blockContent;
  }

  save() {
    return this.active ? true : undefined;
  }

  private toggle() {
    this.active = !this.active;
    this.sync();
    // Toggling a tune is a real change to the block, and the editor only
    // learns about it if the block says so.
    this.block.dispatchChange();
  }

  private sync() {
    const content = this.content;
    if (!content) return;
    if (!this.active) {
      delete content.dataset.spoiler;
      this.badge?.remove();
      return;
    }
    content.dataset.spoiler = 'true';
    this.badge ??= createSpoilerBadge(this.config.title);
    if (!this.badge.isConnected) content.append(this.badge);
  }
}

function createSpoilerBadge(title: string) {
  const badge = document.createElement('span');
  badge.className = 'content-spoiler-badge';
  badge.dataset.mutationFree = 'true';
  badge.setAttribute('aria-hidden', 'true');
  badge.innerHTML = editorIcon('visibility-off');
  badge.append(title);
  return badge;
}

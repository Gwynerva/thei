import type { BlockAPI, BlockTune } from '@editorjs/editorjs';
import type { MenuConfig } from '@editorjs/editorjs/types/tools/menu-config';
import { editorIcon } from './editor-icons';

export interface ContentSpoilerTuneConfig {
  /** Label of the toggle in the block settings menu. */
  title: string;
  /** Explanation shown when the marker in the margin is hovered. */
  markerTitle: string;
}

/**
 * Marks a block as a spoiler: still there, still readable, but not before the
 * reader asks for it.
 *
 * Every block is wrapped, spoiler or not, so a spoiler is exactly as wide as
 * its neighbours — the marker lives in the margin, out of the text flow, and
 * on a narrow screen it overlaps the block's own corner instead of pushing
 * anything aside.
 */
export class ContentSpoilerTune implements BlockTune {
  static isTune = true as const;

  private readonly block: BlockAPI;
  private readonly config: ContentSpoilerTuneConfig;
  private active: boolean;
  private wrapper?: HTMLElement;

  constructor(options: {
    data?: unknown;
    block: BlockAPI;
    config?: ContentSpoilerTuneConfig;
  }) {
    this.block = options.block;
    this.config = options.config ?? {
      title: 'Spoiler',
      markerTitle: 'Spoiler',
    };
    this.active = options.data === true;
  }

  render(): MenuConfig {
    return {
      icon: editorIcon('visibility-off'),
      title: this.config.title,
      toggle: true,
      isActive: this.active,
      onActivate: () => this.toggle(),
    };
  }

  wrap(blockContent: HTMLElement): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'content-spoiler-wrap';

    const marker = document.createElement('span');
    marker.className = 'content-spoiler-marker';
    marker.dataset.titlePopup = this.config.markerTitle;
    marker.innerHTML = editorIcon('visibility-off');

    wrapper.append(blockContent, marker);
    this.wrapper = wrapper;
    this.sync();
    return wrapper;
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
    if (!this.wrapper) return;
    this.wrapper.dataset.spoiler = this.active ? 'true' : 'false';
  }
}

import type { BlockTune } from '@editorjs/editorjs';
import type { MenuConfig } from '@editorjs/editorjs/types/tools/menu-config';

export interface ContentTextRoleTuneConfig {
  /** What the text is called, as its field and its editor are: «What was written». */
  label: string;
}

/**
 * Names a paragraph for whoever reads the screen with something other than
 * eyes. Editor.js draws one as a bare editable `div`, which assistive
 * technology announces as nothing at all; here it is a text box, of several
 * lines, called by the text it is a part of — as the other editable fields
 * of the site are (`ContentCaption.vue`).
 *
 * It is set while the block is composed, before it is in the page, so
 * Editor.js never sees it as a change of the text. The tune offers nothing in
 * the block's menu and saves nothing.
 */
export class ContentTextRoleTune implements BlockTune {
  static isTune = true as const;

  private readonly label: string;

  constructor(options: { config?: ContentTextRoleTuneConfig }) {
    this.label = options.config?.label ?? '';
  }

  render(): MenuConfig {
    return [];
  }

  wrap(blockContent: HTMLElement): HTMLElement {
    const field = blockContent.querySelector<HTMLElement>(
      ':scope > .ce-paragraph[contenteditable="true"]',
    );
    if (field) {
      field.setAttribute('role', 'textbox');
      field.setAttribute('aria-multiline', 'true');
      if (this.label) field.setAttribute('aria-label', this.label);
    }
    return blockContent;
  }
}

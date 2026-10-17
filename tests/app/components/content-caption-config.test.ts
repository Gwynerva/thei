import { describe, expect, it, vi } from 'vitest';

// Only the tools' rules are read here: what draws them is left out.
vi.mock('#layers/thei/app/components/content/editor-icons', () => ({
  editorIcon: () => '',
}));
vi.mock('#layers/thei/app/composables/popup-placement', () => ({
  rangeAnchor: () => undefined,
}));

import { CONTENT_CAPTION_SANITIZE } from '#layers/thei/app/components/content/content-caption-config';
import {
  ContentBoldTool,
  ContentHintTool,
  ContentItalicTool,
  ContentLinkTool,
  ContentStrikeTool,
} from '#layers/thei/app/components/content/editor-inline-tools';

/**
 * Editor.js cleans a field of a block — as the block is pasted, cut,
 * converted or merged — by the inline tools' rules with the field's own laid
 * over them (`Object.assign({}, inlineTools, field)`).
 */
describe('a caption cleaned by Editor.js', () => {
  const inlineTools = Object.assign(
    {},
    ...[
      ContentBoldTool,
      ContentItalicTool,
      ContentStrikeTool,
      ContentHintTool,
      ContentLinkTool,
    ].map((tool) => tool.sanitize),
  );
  const caption = Object.assign({}, inlineTools, CONTENT_CAPTION_SANITIZE);

  it('keeps everything the inline tools keep', () => {
    expect(caption).toEqual(inlineTools);
  });

  it('keeps a link’s note and a hint', () => {
    expect(caption.a).toMatchObject({ 'data-content-note': true });
    expect(caption.abbr).toMatchObject({ 'data-content-hint': true });
  });
});

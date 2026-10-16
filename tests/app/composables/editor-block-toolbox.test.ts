import { describe, expect, it } from 'vitest';
import {
  editorToolboxEntries,
  orderToolboxEntries,
} from '../../../app/composables/editor-block-toolbox';

const icon = (name: string) => `<svg data-name="${name}"></svg>`;

class MediaTool {
  static toolbox = { title: 'Media', icon: icon('media'), data: { a: 1 } };
}
class BoldTool {
  static isInline = true;
  static toolbox = { title: 'Bold', icon: icon('bold') };
}
class TuneTool {}

const tools = {
  spoiler: { class: TuneTool },
  contentBold: { class: BoldTool },
  paragraph: { toolbox: { title: 'Текст', icon: icon('paragraph') } },
  header: {
    class: class {},
    toolbox: [
      { title: 'Заголовок', icon: icon('h2'), data: { level: 2 } },
      { title: 'Подзаголовок', icon: icon('h3'), data: { level: 3 } },
    ],
  },
  contentMedia: { class: MediaTool },
  integration: { class: class {} },
  hidden: { class: MediaTool, toolbox: false },
};

describe('the tiles of the block grid', () => {
  it('are the tools’ own entries, in their order, a tool with several each its own', () => {
    const entries = editorToolboxEntries(tools, (title) =>
      title === 'Media' ? 'Медиа' : title,
    );
    expect(entries.map((entry) => [entry.key, entry.title])).toEqual([
      ['paragraph', 'Текст'],
      ['header:0', 'Заголовок'],
      ['header:1', 'Подзаголовок'],
      ['contentMedia', 'Медиа'],
    ]);
    expect(entries[1]!.data).toEqual({ level: 2 });
    expect(entries[3]).toMatchObject({ tool: 'contentMedia', data: { a: 1 } });
  });

  it('keep the order given, and put a tile it does not name after it', () => {
    const entries = editorToolboxEntries(tools, (title) => title);
    const ordered = orderToolboxEntries(entries, [
      'contentMedia',
      'gone',
      'header:1',
    ]);
    expect(ordered.map((entry) => entry.key)).toEqual([
      'contentMedia',
      'header:1',
      'paragraph',
      'header:0',
    ]);
    expect(orderToolboxEntries(entries, []).map((entry) => entry.key)).toEqual(
      entries.map((entry) => entry.key),
    );
  });
});

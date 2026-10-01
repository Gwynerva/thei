import type EditorJS from '@editorjs/editorjs';
import type { OutputBlockData } from '@editorjs/editorjs';
import {
  normalizeContentData,
  type ContentOutputData,
} from '#layers/thei/shared/content';
import { stripHydratedContentInlineLinks } from '#layers/thei/shared/content-link';

export async function readCleanEditorOutput(
  editor: EditorJS,
): Promise<ContentOutputData> {
  const blocks: OutputBlockData[] = [];
  const blockCount = editor.blocks.getBlocksCount();
  for (let index = 0; index < blockCount; index++) {
    const block = editor.blocks.getBlockByIndex(index);
    if (!block) continue;
    const saved = (await block.save()) as
      | {
          id: string;
          tool: string;
          data: OutputBlockData['data'];
          tunes?: Record<string, unknown>;
        }
      | undefined;
    if (!saved) continue;
    blocks.push({
      id: saved.id,
      type: saved.tool,
      data: stripHydratedContentInlineLinks(
        saved.data,
      ) as OutputBlockData['data'],
      // Block attributes travel beside the data, and a block that lost them on
      // the way out would look unchanged to the dirty check and be saved
      // without them.
      ...(saved.tunes ? { tunes: saved.tunes } : {}),
    });
  }
  return cleanEditorSnapshot({ blocks });
}

/** Editor output without Editor.js's own service fields (`time`, `version`). */
export function cleanEditorSnapshot(value: unknown): ContentOutputData {
  return { blocks: normalizeContentData(value).blocks };
}

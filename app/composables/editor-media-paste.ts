import type EditorJS from '@editorjs/editorjs';
import {
  audioExtensionProfile,
  getPathExtension,
  isExtensionAllowed,
} from '#layers/thei/shared/assets/extensions';

/**
 * Pictures, videos and recordings pasted into an empty paragraph become
 * media.
 *
 * One picture or video becomes a media block, several become one gallery —
 * which is why this does not go through Editor.js's own file paste: that
 * hands every file to a tool separately and would stack up one block per
 * picture. Each recording, where the editor has a block for them, becomes a
 * player of its own after them. The files are stored at the defaults, and
 * the paragraph they were pasted into is replaced; improving them is the
 * usual editing of each file afterwards.
 *
 * Anything else — text, a file pasted into a paragraph with words in it, a
 * document — is left to Editor.js.
 */
export function bindEditorMediaPaste(
  holder: HTMLElement,
  editor: EditorJS,
  options: { audio?: boolean } = {},
) {
  const onPaste = (event: ClipboardEvent) => {
    const blocks = pastedMediaBlocks(
      Array.from(event.clipboardData?.files ?? []),
      options,
    );
    if (!blocks.length) return;
    // The paragraph is the one the paste lands in, as Editor.js finds it
    // itself. Its current block lags behind a caret moved without a press —
    // a focus given back by a closing dialog — and a paste read from it would
    // be cancelled by Editor.js and go nowhere.
    const target = event.target;
    const block =
      target instanceof HTMLElement
        ? editor.blocks.getBlockByElement(target)
        : undefined;
    if (!block || block.name !== 'paragraph' || !block.isEmpty) return;
    const index = editor.blocks.getBlockIndex(block.id);
    event.preventDefault();
    event.stopImmediatePropagation();
    // The first block takes the paragraph's place, and has the caret; the
    // rest follow it.
    blocks.forEach(({ type, data }, offset) =>
      editor.blocks.insert(
        type,
        data,
        undefined,
        index + offset,
        offset === 0,
        offset === 0,
      ),
    );
  };
  // Capture, so the paste is claimed before Editor.js's own handler sees it.
  holder.addEventListener('paste', onPaste, true);
  return () => holder.removeEventListener('paste', onPaste, true);
}

export interface PastedMediaBlock {
  type: 'contentMedia' | 'contentGallery' | 'contentAudio';
  data: Record<string, unknown>;
}

/**
 * The blocks pasted files become, in order: the pictures and videos as one
 * block, then a player for each recording. Nothing for anything else.
 */
export function pastedMediaBlocks(
  files: File[],
  options: { audio?: boolean } = {},
): PastedMediaBlock[] {
  // A recording is known by its name: browsers give `.opus` or `.weba` no
  // type at all on some systems, and call an Ogg either.
  const recordings = options.audio ? files.filter(isRecording) : [];
  const visual = files.filter(
    (file) => !isRecording(file) && /^(?:image|video)\//.test(file.type),
  );
  return [
    ...(visual.length === 1
      ? [
          {
            type: 'contentMedia' as const,
            data: { layout: 'centered', files: visual },
          },
        ]
      : visual.length
        ? [
            {
              type: 'contentGallery' as const,
              data: { items: [], files: visual },
            },
          ]
        : []),
    ...recordings.map((file) => ({
      type: 'contentAudio' as const,
      data: { files: [file] },
    })),
  ];
}

function isRecording(file: File): boolean {
  return isExtensionAllowed(getPathExtension(file.name), audioExtensionProfile);
}

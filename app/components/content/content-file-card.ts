import type { PropType } from 'vue';
import type { ContentAssetData } from '#layers/thei/shared/content';
import { isAssetPreviewable } from '#layers/thei/shared/assets/preview';
import { useHumanSize } from '#layers/thei/app/composables/human-size';

/**
 * A file of a text as its own card and a row of a group are given it.
 * Declared at runtime: a component's `defineProps` may not name a type
 * from another file, which the production build cannot read.
 */
export const contentFileProps = {
  asset: { type: Object as PropType<ContentAssetData>, required: true },
  title: { type: String, default: '' },
  caption: { type: String, default: '' },
  editable: { type: Boolean, default: false },
  href: { type: String, default: undefined },
  /** What the file is called when its title is not given. */
  fallbackTitle: { type: String, default: '' },
  editLabel: { type: String, default: '' },
  titlePlaceholder: { type: String, default: '' },
  captionPlaceholder: { type: String, default: '' },
  openable: { type: Boolean, default: false },
} as const;

/** What the card and the row say back: a file to change, words typed, a press. */
export const contentFileEmits = {
  edit: () => true,
  title: (_value: string) => true,
  caption: (_value: string) => true,
  open: () => true,
};

export interface ContentFileCardProps {
  asset: ContentAssetData;
  title: string;
  editable: boolean;
  href?: string;
  fallbackTitle: string;
  openable?: boolean;
}

/**
 * Whether a file has something to show in the asset viewer — a picture, a
 * video, a text, a table, a page, a PDF, an archive's list — rather than
 * only to be downloaded.
 */
export function contentFileOpensInViewer(
  asset: Pick<ContentAssetData, 'media' | 'extension' | 'archivedOriginal'>,
): boolean {
  return (
    !!asset.media ||
    (!!asset.extension &&
      isAssetPreviewable(asset.extension, asset.archivedOriginal))
  );
}

/**
 * What a file of a text is called, the facts beside its name, and what a
 * press on it does: a file with something to show opens in the asset viewer
 * (`contentFileOpensInViewer`); any other is simply downloaded. Opening goes
 * through the viewer, which needs the file's address too. Without the
 * viewer, a picture or a video opens in a tab of its own. While the text is
 * edited, nothing opens.
 */
export function useContentFileCard(props: ContentFileCardProps) {
  const humanSize = useHumanSize();
  const viewable = computed(() => !!props.asset.media);
  const mode = computed<'static' | 'open' | 'link'>(() => {
    if (props.editable || !props.href) return 'static';
    return props.openable && contentFileOpensInViewer(props.asset)
      ? 'open'
      : 'link';
  });
  // The owner's title gets their typography; a file name stays as it is.
  const resolvedTitle = computed(
    () => publicText(props.title) || props.fallbackTitle,
  );
  const details = computed(() =>
    [
      props.asset.extension?.toUpperCase(),
      props.asset.size !== undefined ? humanSize(props.asset.size) : undefined,
    ].filter((detail): detail is string => Boolean(detail)),
  );
  /** The icon at the end of a card: what a press on it does. */
  const actionIcon = computed(() =>
    mode.value === 'open'
      ? 'expand-diagonal'
      : viewable.value
        ? 'arrow-outward'
        : 'download',
  );
  return { viewable, mode, resolvedTitle, details, actionIcon };
}

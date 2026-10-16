import type { ContentAssetData } from '#layers/thei/shared/content';
import { isAssetPreviewable } from '#layers/thei/shared/assets/preview';
import { useHumanSize } from '#layers/thei/app/composables/human-size';

export interface ContentFileCardProps {
  asset: ContentAssetData;
  title: string;
  editable: boolean;
  href?: string;
  fallbackTitle: string;
  openable?: boolean;
}

/**
 * What a file of a text is called, the facts beside its name, and what a
 * press on it does: a file with something to show — a picture, a video, a
 * text, a table, a page, a PDF, an archive's list — opens in the asset
 * viewer; any other is simply downloaded. Opening goes through the viewer,
 * which needs the file's address too. Without the viewer, a picture or a
 * video opens in a tab of its own. While the text is edited, nothing opens.
 */
export function useContentFileCard(props: ContentFileCardProps) {
  const humanSize = useHumanSize();
  const viewable = computed(() => !!props.asset.media);
  const previewable = computed(
    () =>
      viewable.value ||
      (!!props.asset.extension &&
        isAssetPreviewable(
          props.asset.extension,
          props.asset.archivedOriginal,
        )),
  );
  const mode = computed<'static' | 'open' | 'link'>(() => {
    if (props.editable || !props.href) return 'static';
    return props.openable && previewable.value ? 'open' : 'link';
  });
  // The owner's title gets their typography; a file name stays as it is.
  const resolvedTitle = computed(
    () => publicText(props.title) || props.fallbackTitle,
  );
  const details = computed(() =>
    [
      props.asset.extension?.toUpperCase(),
      props.asset.size !== undefined ? humanSize(props.asset.size) : undefined,
    ].filter(Boolean),
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

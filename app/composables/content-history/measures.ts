import type { IconName } from '#thei/icons';
import type { ContentHistoryStats } from '#layers/thei/shared/content-history';

/**
 * What a version of a text is measured by, in the order it is told: its
 * blocks, its words and its files, each with its icon and the phrase that
 * counts it.
 */
export const CONTENT_HISTORY_MEASURES: readonly {
  key: keyof ContentHistoryStats;
  icon: IconName;
  phrase: 'content_block_count' | 'content_word_count' | 'content_file_count';
}[] = [
  { key: 'blockCount', icon: 'blocks', phrase: 'content_block_count' },
  { key: 'wordCount', icon: 'text', phrase: 'content_word_count' },
  { key: 'assetCount', icon: 'files', phrase: 'content_file_count' },
];

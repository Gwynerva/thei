import { describe, expect, it } from 'vitest';
import {
  assetPreview,
  isAssetPreviewable,
  previewUrl,
} from '../../../shared/assets/preview';

describe('asset preview', () => {
  it('tells how a file is shown by its extension', () => {
    const shown = (kind: string, extension: string) => ({ kind, extension });
    expect(assetPreview('txt')).toEqual(shown('text', 'txt'));
    expect(assetPreview('LOG')).toEqual(shown('text', 'log'));
    expect(assetPreview('md')).toEqual(shown('markdown', 'md'));
    expect(assetPreview('csv')).toEqual(shown('table', 'csv'));
    expect(assetPreview('tsv')).toEqual(shown('table', 'tsv'));
    expect(assetPreview('html')).toEqual(shown('html', 'html'));
    expect(assetPreview('pdf')).toEqual(shown('pdf', 'pdf'));
    expect(assetPreview('zip')).toEqual(shown('zip', 'zip'));
    expect(assetPreview('nfo')).toEqual(shown('probe', 'nfo'));
  });

  it('leaves pictures, videos and recordings to their own viewers', () => {
    expect(assetPreview('webp')).toBeUndefined();
    expect(assetPreview('mp4')).toBeUndefined();
    expect(assetPreview('flac')).toBeUndefined();
  });

  it('shows a zipped file as its original', () => {
    const archivedOriginal = { extension: 'md', size: 120 };
    expect(assetPreview('zip', archivedOriginal)).toEqual({
      kind: 'markdown',
      extension: 'md',
      archived: archivedOriginal,
    });
  });

  it('opens in the viewer only what is known to show', () => {
    expect(isAssetPreviewable('txt')).toBe(true);
    expect(isAssetPreviewable('pdf')).toBe(true);
    expect(isAssetPreviewable('docx')).toBe(false);
    expect(isAssetPreviewable('webp')).toBe(false);
  });

  it('keeps only addresses that point somewhere', () => {
    expect(previewUrl(' https://example.com/a ', 'link')).toBe(
      'https://example.com/a',
    );
    expect(previewUrl('mailto:me@example.com', 'link')).toBe(
      'mailto:me@example.com',
    );
    expect(previewUrl('#part', 'link')).toBe('#part');
    expect(previewUrl('javascript:alert(1)', 'link')).toBeUndefined();
    expect(previewUrl('JaVaScRiPt:alert(1)', 'link')).toBeUndefined();
    expect(previewUrl('img/chart.png', 'image')).toBeUndefined();
    expect(previewUrl('/api/admin/assets', 'link')).toBeUndefined();
    expect(previewUrl('data:image/png;base64,AAAA', 'image')).toBe(
      'data:image/png;base64,AAAA',
    );
    expect(previewUrl('data:text/html,<script>', 'image')).toBeUndefined();
    expect(previewUrl('data:image/png;base64,AAAA', 'link')).toBeUndefined();
  });
});

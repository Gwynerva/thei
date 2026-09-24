import { describe, expect, it } from 'vitest';
import {
  buildQualityStops,
  stopRenderOrder,
} from '../../../../app/modals/upload-settings/quality-stops';

const labels = {
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  maximum: 'Maximum',
  lossless: 'Lossless',
};
const units = { b: 'bytes', kb: 'Kb', mb: 'Mb', gb: 'Gb' };

describe('stop render order', () => {
  it('renders the other levels nearest first, in both lossy formats for Auto', () => {
    const order = stopRenderOrder('high', 'auto');
    expect(order.map((item) => item.level)).toEqual([
      'medium',
      'medium',
      'maximum',
      'maximum',
      'low',
      'low',
      'minimal',
      'minimal',
    ]);
    expect(order.slice(0, 2).map((item) => item.format)).toEqual([
      'avif',
      'webp',
    ]);
  });

  it('renders a chosen format alone, and nothing for a kept vector', () => {
    expect(stopRenderOrder('minimal', 'webp')).toEqual([
      { level: 'low', format: 'webp' },
      { level: 'medium', format: 'webp' },
      { level: 'high', format: 'webp' },
      { level: 'maximum', format: 'webp' },
    ]);
    expect(stopRenderOrder('high', 'svg')).toEqual([]);
  });

  it('walks down from the lossless stop', () => {
    expect(
      stopRenderOrder('lossless', 'avif').map((item) => item.level),
    ).toEqual(['maximum', 'high', 'medium', 'low', 'minimal']);
  });
});

describe('quality stops', () => {
  const humanSize = (bytes: number) => `${bytes} bytes`;

  it('captions every stop with its size and keeps the share for the popup', () => {
    const sizes: Record<string, { bytes: number; approximate: boolean }> = {
      minimal: { bytes: 900 * 1024, approximate: true },
      medium: { bytes: 2 * 1024 * 1024, approximate: false },
      high: { bytes: 3.5 * 1024 * 1024, approximate: false },
    };
    const stops = buildQualityStops({
      allowLossless: true,
      labels,
      sizeOf: (stop) => sizes[stop],
      pendingOf: (stop) => stop === 'low',
      sourceSize: 7 * 1024 * 1024,
      units,
      humanSize,
    });
    expect(stops.map((stop) => stop.value)).toEqual([
      'minimal',
      'low',
      'medium',
      'high',
      'maximum',
      'lossless',
    ]);
    expect(stops[0]).toMatchObject({
      caption: '900 Kb',
      approximate: true,
      title: 'Minimal · ≈ 921600 bytes · 13%',
    });
    expect(stops[1]).toMatchObject({ value: 'low', pending: true });
    expect(stops[1]!.caption).toBeUndefined();
    expect(stops[2]).toMatchObject({ caption: '2 Mb' });
    expect(stops[2]!.approximate).toBeUndefined();
    expect(stops[3]!.title).toBe('High · 3670016 bytes · 50%');
    expect(stops[4]!.caption).toBeUndefined();
    expect(stops[4]!.pending).toBeUndefined();
  });

  it('leaves the lossless stop out where a place fixes the format', () => {
    const stops = buildQualityStops({
      allowLossless: false,
      labels,
      sizeOf: () => undefined,
      units,
      humanSize,
    });
    expect(stops).toHaveLength(5);
    expect(stops.at(-1)?.value).toBe('maximum');
  });
});

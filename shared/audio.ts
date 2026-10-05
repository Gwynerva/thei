import type { AssetMeta } from './asset';

/**
 * Recordings are stored as Opus in WebM, the codec and container video sound
 * already uses: every current browser plays it, and it is the smallest of
 * what they all play. `weba` keeps it audio by its extension, where `webm`
 * would read as a video.
 */
export const AUDIO_OUTPUT_EXTENSION = 'weba';

/**
 * Values a waveform is stored with. A player pools them into as many bars as
 * its width holds; at about a bar per 4 px, 128 fill a wide column.
 */
export const AUDIO_WAVEFORM_PEAKS = 128;

export const AUDIO_PLAYBACK_RATES = [1, 1.25, 1.5, 2] as const;

/** What a player knows of a recording before it loads any of it. */
export interface AudioDescriptor {
  /** Seconds; 0 when unknown, and the player then asks the file. */
  duration: number;
  /** Loudness from 0 to 100, start to end; empty draws a flat track. */
  peaks: number[];
  channels?: number;
}

export function audioDescriptorFromMeta(
  meta: AssetMeta | null | undefined,
): AudioDescriptor | undefined {
  if (!meta || !('peaks' in meta)) return undefined;
  return normalizeAudioDescriptor(meta);
}

export function normalizeAudioDescriptor(
  value: unknown,
): AudioDescriptor | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const { duration, peaks, channels } = value as Partial<AudioDescriptor>;
  if (typeof duration !== 'number' || !Number.isFinite(duration)) {
    return undefined;
  }
  if (duration < 0 || !Array.isArray(peaks)) return undefined;
  if (peaks.length > AUDIO_WAVEFORM_PEAKS) return undefined;
  if (
    !peaks.every((peak) => Number.isInteger(peak) && peak >= 0 && peak <= 100)
  ) {
    return undefined;
  }
  return {
    duration,
    peaks: [...peaks],
    ...(typeof channels === 'number' &&
    Number.isInteger(channels) &&
    channels > 0
      ? { channels }
      : {}),
  };
}

/** `m:ss`, or `h:mm:ss` from an hour on. */
export function formatMediaTime(seconds: number): string {
  const total =
    Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = (total % 60).toString().padStart(2, '0');
  return hours
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${rest}`
    : `${minutes}:${rest}`;
}

const LOSSLESS_AUDIO_CODECS = new Set([
  'flac',
  'alac',
  'wavpack',
  'ape',
  'tta',
  'mlp',
  'truehd',
  'shorten',
]);

/**
 * Whether a codec, as ffmpeg names it, keeps every sample: its bitrate then
 * says nothing about how much a lossy encode may spend.
 */
export function isLosslessAudioCodec(codec: string | undefined): boolean {
  if (!codec) return false;
  return codec.startsWith('pcm_') || LOSSLESS_AUDIO_CODECS.has(codec);
}

/** Pools stored peaks into `count` bars, each the loudest of its share. */
export function poolAudioPeaks(peaks: number[], count: number): number[] {
  if (!peaks.length || count <= 0) return [];
  return Array.from({ length: count }, (_, index) => {
    const from = Math.floor((index * peaks.length) / count);
    const to = Math.max(
      from + 1,
      Math.floor(((index + 1) * peaks.length) / count),
    );
    let loudest = 0;
    for (let at = from; at < to; at++) loudest = Math.max(loudest, peaks[at]!);
    return loudest;
  });
}

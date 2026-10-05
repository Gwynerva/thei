import { AUDIO_WAVEFORM_PEAKS } from '#layers/thei/shared/audio';

/** The rate a recording is decoded at to draw it: speech and music alike. */
export const WAVEFORM_SAMPLE_RATE = 8000;
/** 10 ms: short enough to show a syllable, long enough to mean loudness. */
const WINDOW_SAMPLES = WAVEFORM_SAMPLE_RATE / 100;
/**
 * Levels kept while decoding. When they run out, neighbours merge into one
 * and every later level covers twice as long, so an hour costs what a
 * minute does.
 */
const MAX_LEVELS = 2048;

/**
 * Turns 16-bit mono PCM, chunk by chunk as ffmpeg writes it, into the
 * loudness a player draws.
 *
 * Each 10 ms window is measured by its RMS, and each level keeps the loudest
 * of the windows it covers, so a short loud sound is never averaged away.
 */
export class WaveformAccumulator {
  private levels: number[] = [];
  /** Windows each level covers. */
  private span = 1;
  private spanFilled = 0;
  private spanLoudest = 0;
  private windowSquares = 0;
  private windowFilled = 0;
  private carry: number | undefined;
  /** Samples seen: the length of the recording, at `WAVEFORM_SAMPLE_RATE`. */
  samples = 0;

  push(chunk: Buffer) {
    let offset = 0;
    if (this.carry !== undefined && chunk.length) {
      this.addSample(Buffer.from([this.carry, chunk[0]!]).readInt16LE(0));
      this.carry = undefined;
      offset = 1;
    }
    for (; offset + 1 < chunk.length; offset += 2) {
      this.addSample(chunk.readInt16LE(offset));
    }
    if (offset < chunk.length) this.carry = chunk[offset];
  }

  /** The waveform: `count` values from 0 to 100, start to end. */
  finish(count = AUDIO_WAVEFORM_PEAKS): number[] {
    if (this.windowFilled) this.closeWindow();
    if (this.spanFilled) this.closeSpan();
    const levels = this.levels;
    if (!levels.length) return [];
    const pooled = Array.from({ length: count }, (_, index) => {
      const from = Math.floor((index * levels.length) / count);
      const to = Math.max(
        from + 1,
        Math.floor(((index + 1) * levels.length) / count),
      );
      let loudest = 0;
      for (let at = from; at < to; at++) {
        loudest = Math.max(loudest, levels[at]!);
      }
      return loudest;
    });
    const loudest = Math.max(...pooled);
    if (!(loudest > 0)) return pooled.map(() => 0);
    // A square root lifts quiet passages: speech next to music, or a voice
    // far from the microphone, still shows as more than a flat line.
    return pooled.map((level) => Math.round(100 * Math.sqrt(level / loudest)));
  }

  private addSample(sample: number) {
    this.samples += 1;
    this.windowSquares += sample * sample;
    this.windowFilled += 1;
    if (this.windowFilled === WINDOW_SAMPLES) this.closeWindow();
  }

  private closeWindow() {
    const rms = Math.sqrt(this.windowSquares / this.windowFilled);
    this.windowSquares = 0;
    this.windowFilled = 0;
    this.spanLoudest = Math.max(this.spanLoudest, rms);
    this.spanFilled += 1;
    if (this.spanFilled === this.span) this.closeSpan();
  }

  private closeSpan() {
    this.levels.push(this.spanLoudest);
    this.spanLoudest = 0;
    this.spanFilled = 0;
    if (this.levels.length < MAX_LEVELS) return;
    const merged: number[] = [];
    for (let index = 0; index < this.levels.length; index += 2) {
      merged.push(Math.max(this.levels[index]!, this.levels[index + 1] ?? 0));
    }
    this.levels = merged;
    this.span *= 2;
  }
}

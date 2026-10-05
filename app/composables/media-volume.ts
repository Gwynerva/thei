/** How loud a player is: its volume, and whether it is muted. */
export interface MediaVolume {
  volume: number;
  muted: boolean;
}

/**
 * A volume set on a slider: dragged all the way down is muted, anywhere
 * else is heard.
 */
export function volumeSetTo(value: number): MediaVolume {
  const volume = Math.min(1, Math.max(0, value));
  return { volume, muted: volume === 0 };
}

/**
 * The mute button pressed: unmuting what was turned all the way down plays
 * it at full volume rather than in silence.
 */
export function volumeToggled(current: MediaVolume): MediaVolume {
  const muted = !current.muted;
  return {
    muted,
    volume: !muted && current.volume === 0 ? 1 : current.volume,
  };
}

/** Puts a volume on a media element. */
export function applyMediaVolume(
  element: HTMLMediaElement,
  { volume, muted }: MediaVolume,
) {
  element.volume = volume;
  element.muted = muted;
}

let volumeSettable: boolean | undefined;

/**
 * Whether this browser lets a page set how loud a media element plays. iOS
 * does not: its volume is the device's alone, and a media element's stays
 * at 1 whatever it is told. Asked once, of an element nobody hears.
 */
export function mediaVolumeSettable(): boolean {
  if (volumeSettable === undefined) {
    const probe = document.createElement('audio');
    probe.volume = 0.5;
    volumeSettable = probe.volume === 0.5;
  }
  return volumeSettable;
}

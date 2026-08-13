export interface ContentMediaPlaybackState {
  currentTime: number;
  wantsPlayback: boolean;
}

export function preserveContentMediaPlayback(
  current: ContentMediaPlaybackState,
  video: Pick<HTMLVideoElement, 'currentTime' | 'paused'>,
  internalPause = false,
): ContentMediaPlaybackState {
  return {
    currentTime: Number.isFinite(video.currentTime)
      ? Math.max(0, video.currentTime)
      : current.currentTime,
    wantsPlayback: internalPause ? current.wantsPlayback : !video.paused,
  };
}

export function restoredContentMediaTime(
  savedTime: number,
  duration: number,
): number {
  if (!Number.isFinite(savedTime) || savedTime <= 0) return 0;
  if (!Number.isFinite(duration) || duration <= 0) return savedTime;
  return Math.min(savedTime, Math.max(0, duration - 0.01));
}

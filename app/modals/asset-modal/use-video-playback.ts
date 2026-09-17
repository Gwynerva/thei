import {
  VideoPlaybackController,
  type VideoPlaybackState,
} from './video-playback';

export function useVideoPlayback() {
  const state = shallowRef<VideoPlaybackState>({
    paused: true,
    currentTime: 0,
    duration: 0,
    muted: false,
    volume: 1,
  });
  const controller = new VideoPlaybackController((next) => {
    state.value = next;
  });
  onBeforeUnmount(() => controller.detach());
  return { state, controller };
}

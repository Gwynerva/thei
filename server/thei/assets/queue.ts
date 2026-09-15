import { cpus } from 'node:os';
import { AssetType } from '#layers/thei/shared/asset';

/**
 * Bounds how much media processing runs at once.
 *
 * Nothing used to limit this: every concurrent upload spawned its own ffmpeg,
 * each of which uses every core it can get, on a box that is also serving the
 * site. Two large videos on the 2 GB instance the installer asks for was
 * enough to take it down.
 *
 * Video is serialized outright — a VP9 encode already saturates the machine,
 * so a second one buys nothing and doubles the memory. Images get a small
 * pool, since AVIF encoding is CPU-bound but short.
 */
const IMAGE_CONCURRENCY = Math.max(1, Math.min(cpus().length - 1, 3));
const VIDEO_CONCURRENCY = 1;

type Lane = 'image' | 'video';

interface LaneState {
  limit: number;
  active: number;
  waiting: (() => void)[];
}

const lanes: Record<Lane, LaneState> = {
  image: { limit: IMAGE_CONCURRENCY, active: 0, waiting: [] },
  video: { limit: VIDEO_CONCURRENCY, active: 0, waiting: [] },
};

function laneFor(type: AssetType): Lane {
  return type === AssetType.Video ? 'video' : 'image';
}

/** True when a job of this type would have to wait for a slot. */
export function isProcessingQueued(type: AssetType): boolean {
  const lane = lanes[laneFor(type)];
  return lane.active >= lane.limit;
}

/**
 * Runs `job` once a slot in its lane is free.
 *
 * Callers are admitted in arrival order, so a queued upload cannot be starved
 * by later ones.
 */
export async function withProcessingSlot<T>(
  type: AssetType,
  job: () => Promise<T>,
): Promise<T> {
  const lane = lanes[laneFor(type)];

  if (lane.active >= lane.limit) {
    await new Promise<void>((resolve) => lane.waiting.push(resolve));
  }
  lane.active += 1;

  try {
    return await job();
  } finally {
    lane.active -= 1;
    lane.waiting.shift()?.();
  }
}

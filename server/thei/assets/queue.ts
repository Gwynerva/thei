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
 * pool, since AVIF encoding is CPU-bound but short. Probing a file is quick
 * and light, and has a lane of its own so reading a video's size never waits
 * behind a whole encode.
 */
const IMAGE_CONCURRENCY = Math.max(1, Math.min(cpus().length - 1, 3));
const VIDEO_CONCURRENCY = 1;
const PROBE_CONCURRENCY = 2;

type Lane = 'image' | 'video' | 'probe';

interface LaneState {
  limit: number;
  active: number;
  waiting: (() => void)[];
}

const lanes: Record<Lane, LaneState> = {
  image: { limit: IMAGE_CONCURRENCY, active: 0, waiting: [] },
  video: { limit: VIDEO_CONCURRENCY, active: 0, waiting: [] },
  probe: { limit: PROBE_CONCURRENCY, active: 0, waiting: [] },
};

export interface ProcessingSlotOptions {
  /** Aborting while queued gives the place up without running the job. */
  signal?: AbortSignal;
}

function laneFor(type: AssetType): Lane {
  return type === AssetType.Video ? 'video' : 'image';
}

/** True when a job of this type would have to wait for a slot. */
export function isProcessingQueued(type: AssetType): boolean {
  const lane = lanes[laneFor(type)];
  return lane.active >= lane.limit || lane.waiting.length > 0;
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
  options: ProcessingSlotOptions = {},
): Promise<T> {
  return await withLaneSlot(lanes[laneFor(type)], job, options);
}

/** Runs a quick inspection of a file, such as reading a video's size. */
export async function withProbeSlot<T>(
  job: () => Promise<T>,
  options: ProcessingSlotOptions = {},
): Promise<T> {
  return await withLaneSlot(lanes.probe, job, options);
}

async function withLaneSlot<T>(
  lane: LaneState,
  job: () => Promise<T>,
  { signal }: ProcessingSlotOptions,
): Promise<T> {
  signal?.throwIfAborted();

  if (lane.active >= lane.limit || lane.waiting.length) {
    // A freed slot is handed straight to the next waiter, still counted as
    // active, so nothing arriving in between can take it first.
    await new Promise<void>((resolve, reject) => {
      const admit = () => {
        signal?.removeEventListener('abort', leave);
        resolve();
      };
      const leave = () => {
        const index = lane.waiting.indexOf(admit);
        if (index >= 0) lane.waiting.splice(index, 1);
        reject(signal!.reason);
      };
      lane.waiting.push(admit);
      signal?.addEventListener('abort', leave, { once: true });
    });
  } else {
    lane.active += 1;
  }

  try {
    return await job();
  } finally {
    const next = lane.waiting.shift();
    if (next) next();
    else lane.active -= 1;
  }
}

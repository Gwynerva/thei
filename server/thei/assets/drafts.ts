import { randomUUID } from 'node:crypto';
import {
  mkdir,
  readdir,
  rename,
  rm,
  stat,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { createError } from 'h3';
import {
  buildAssetDraftRenderUrl,
  type AssetDraftRender,
  type AssetDraftSource,
} from '#layers/thei/shared/api/asset-draft';
import type { AssetUploadResponse } from '#layers/thei/shared/api/asset';
import { AssetType } from '#layers/thei/shared/asset';
import {
  buildAssetSettingsKey,
  type AssetImageTransformSettings,
  type AssetTransformSource,
  type AssetUploadRequest,
  type AssetUploadSettings,
} from '#layers/thei/shared/asset-upload-settings';
import { fileBytes, sha256 } from './bytes';
import {
  commitProcessedAsset,
  probeTransformSource,
  renderAsset,
  resolveAssetRequest,
  validateAssetVariantSettings,
} from './create-variant';
import type { AssetSourceFile, ProcessedAsset } from './process';
import { isProcessingQueued, withProbeSlot, withProcessingSlot } from './queue';
import { theiTempDir } from './temp';

/** How long a draft outlives its last request. */
const DRAFT_IDLE_MS = 30 * 60 * 1000;
/** Drafts held at once; the least recently used goes first. */
const MAX_DRAFTS = 4;
/**
 * Dry runs kept per draft. Every change is rendered at each quality stop in
 * each lossy format plus lossless — up to twelve — so this keeps the last
 * couple of changes whole: the render a comparison still shows is never gone
 * before the next one replaces it, and going back to earlier settings is
 * instant.
 */
export const DRAFT_MAX_RENDERS = 32;
const EXPIRY_CHECK_MS = 5 * 60 * 1000;

interface DraftRenderRecord extends AssetDraftRender {
  path: string;
}

interface InflightRender {
  promise: Promise<DraftRenderRecord>;
  controller: AbortController;
  waiters: number;
  /** Renders asked for together — one setting in every format — share one. */
  batch?: string;
}

interface DraftSession {
  id: string;
  directory: string;
  source: AssetSourceFile;
  type: AssetType;
  familyUuid: string;
  /** Known size of a media source; absent for anything else. */
  transform?: AssetTransformSource;
  lastAccess: number;
  renders: Map<string, DraftRenderRecord>;
  inflight: Map<string, InflightRender>;
}

/**
 * Drafts live in memory, like upload progress: a restart forgets them, and
 * the editor stages its file again when told its draft is gone.
 */
const drafts = new Map<string, DraftSession>();
let expiryTimer: ReturnType<typeof setInterval> | undefined;

/** Where every draft keeps its files, beside the other processing scratch. */
export function draftsDirectory(): string {
  return join(theiTempDir(), 'drafts');
}

/** A fresh draft directory, and the path its source should be staged to. */
export async function prepareDraftDirectory(extension: string) {
  const id = randomUUID();
  const directory = join(draftsDirectory(), id);
  await mkdir(directory, { recursive: true });
  return {
    id,
    directory,
    sourcePath: join(directory, `source${extension ? `.${extension}` : ''}`),
  };
}

/**
 * Registers a draft for a source that is now on disk.
 *
 * `owned` is false when the source is a file already in the library: a draft
 * then only reads it and never moves or deletes it.
 */
export async function openDraft(input: {
  id?: string;
  directory?: string;
  source: AssetSourceFile;
  type: AssetType;
  familyUuid: string;
}): Promise<AssetDraftSource> {
  const id = input.id ?? randomUUID();
  const directory = input.directory ?? join(draftsDirectory(), id);
  await mkdir(directory, { recursive: true });

  let transform: AssetTransformSource | undefined;
  if (input.type === AssetType.Image || input.type === AssetType.Video) {
    try {
      transform = await withProbeSlot(() =>
        probeTransformSource(input.source, input.type),
      );
    } catch (error) {
      await rm(directory, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
  }

  const session: DraftSession = {
    id,
    directory,
    source: input.source,
    type: input.type,
    familyUuid: input.familyUuid,
    transform,
    lastAccess: Date.now(),
    renders: new Map(),
    inflight: new Map(),
  };
  drafts.set(id, session);
  await evictOverflow();
  scheduleExpiry();
  return describeDraft(session);
}

export function describeDraft(session: DraftSession): AssetDraftSource {
  return {
    draftId: session.id,
    type: session.type,
    extension: session.source.extension,
    size: session.source.size,
    ...(session.transform
      ? {
          width: session.transform.width,
          height: session.transform.height,
          ...(session.transform.hasAudio !== undefined
            ? { hasAudio: session.transform.hasAudio }
            : {}),
          ...(session.transform.isVector ? { isVector: true } : {}),
          ...(session.transform.duration
            ? { duration: session.transform.duration }
            : {}),
          ...(session.transform.fps ? { fps: session.transform.fps } : {}),
          ...(session.transform.bitrate
            ? { bitrate: session.transform.bitrate }
            : {}),
          ...(session.transform.codec
            ? { codec: session.transform.codec }
            : {}),
        }
      : {}),
  };
}

/** The draft, freshly touched, or a 404 the editor knows to recover from. */
export function useDraft(id: string | undefined): DraftSession {
  const session = id ? drafts.get(id) : undefined;
  if (!session) {
    throw createError({
      statusCode: 404,
      message: 'Draft has expired',
      data: { draftExpired: true },
    });
  }
  session.lastAccess = Date.now();
  // The sweep judges draft directories by age; a draft in use is never old.
  void utimes(session.directory, new Date(), new Date()).catch(() => {});
  return session;
}

export async function closeDraft(id: string) {
  const session = drafts.get(id);
  if (!session) return;
  drafts.delete(id);
  for (const job of session.inflight.values()) {
    job.controller.abort(new DOMException('Draft closed', 'AbortError'));
  }
  await rm(session.directory, { recursive: true, force: true }).catch(() => {});
}

/**
 * Encodes an image from a draft for the admin to judge, without storing it.
 *
 * Asking for settings already rendered answers at once; asking for the same
 * settings twice joins the one encode. A request for other settings abandons
 * older ones still waiting in the queue: the admin has moved on from them.
 */
export async function renderDraft(
  session: DraftSession,
  request: AssetUploadRequest,
  signal: AbortSignal,
  batch?: string,
): Promise<AssetDraftRender> {
  signal.throwIfAborted();
  if (request.type !== 'image-transform') {
    throw createError({
      statusCode: 400,
      message: 'Only images are rendered in advance',
    });
  }
  validateAssetVariantSettings(session.type, session.source.extension, request);
  const settings = (await resolveAssetRequest(
    request,
    session.source,
    session.type,
    session.transform,
  )) as AssetImageTransformSettings;
  const key = buildAssetSettingsKey(settings);

  const cached = session.renders.get(key);
  if (cached) {
    // Most recently used goes to the end, so eviction takes the oldest.
    session.renders.delete(key);
    session.renders.set(key, cached);
    return publicRender(cached);
  }

  let job = session.inflight.get(key);
  if (!job) {
    for (const [otherKey, other] of session.inflight) {
      if (otherKey !== key && (!batch || other.batch !== batch)) {
        other.controller.abort(new DOMException('Superseded', 'AbortError'));
      }
    }
    const controller = new AbortController();
    const promise = withProcessingSlot(
      AssetType.Image,
      async () => await encodeDraftRender(session, settings, key),
      { signal: controller.signal },
    ).finally(() => session.inflight.delete(key));
    job = { promise, controller, waiters: 0, batch };
    session.inflight.set(key, job);
  }

  const joined = job;
  joined.waiters += 1;
  const leave = () => {
    joined.waiters -= 1;
    if (joined.waiters <= 0) joined.controller.abort(signal.reason);
  };
  signal.addEventListener('abort', leave, { once: true });
  try {
    return publicRender(await joined.promise);
  } finally {
    signal.removeEventListener('abort', leave);
  }
}

async function encodeDraftRender(
  session: DraftSession,
  settings: AssetImageTransformSettings,
  key: string,
): Promise<DraftRenderRecord> {
  const processed = await renderAsset(session.source, settings);
  const renderId = sha256(Buffer.from(key)).slice(0, 16);
  const path = join(session.directory, `${renderId}.${processed.extension}`);
  // A raster encode comes back in memory; a kept vector is already a file.
  const { bytes } = processed;
  if (bytes.buffer) await writeFile(path, bytes.buffer);
  else await rename(bytes.path, path);
  const size = bytes.buffer ? bytes.buffer.length : bytes.size;

  const record: DraftRenderRecord = {
    renderId,
    settingsKey: key,
    settings,
    extension: processed.extension,
    size,
    width: processed.dimensions.width ?? settings.dimensions.width,
    height: processed.dimensions.height ?? settings.dimensions.height,
    url: buildAssetDraftRenderUrl(session.id, renderId),
    path,
  };
  // A draft closed while this was encoding has already lost its directory.
  if (!drafts.has(session.id)) {
    await rm(path, { force: true }).catch(() => {});
    return record;
  }
  session.renders.set(key, record);
  while (session.renders.size > DRAFT_MAX_RENDERS) {
    const [oldestKey, oldest] = session.renders.entries().next().value!;
    session.renders.delete(oldestKey);
    await rm(oldest.path, { force: true }).catch(() => {});
  }
  return record;
}

export function findDraftRender(
  session: DraftSession,
  renderId: string,
): DraftRenderRecord | undefined {
  for (const record of session.renders.values()) {
    if (record.renderId === renderId) return record;
  }
  return undefined;
}

/**
 * Stores a result from a draft in the library.
 *
 * An image already rendered with these settings is stored as it is: the admin
 * gets exactly the bytes they judged, and nothing is encoded twice. Anything
 * else is produced now, video included, inside a processing slot.
 */
export async function commitDraft(
  session: DraftSession,
  request: AssetUploadRequest,
  options: {
    signal: AbortSignal;
    onQueued?: () => void;
    onProgress?: (progress: number) => void;
  },
): Promise<AssetUploadResponse> {
  validateAssetVariantSettings(session.type, session.source.extension, request);
  // The source was probed when the draft opened, so this reads no file.
  const settings = await resolveAssetRequest(
    request,
    session.source,
    session.type,
    session.transform,
  );
  // "Use" pressed while these very settings are still encoding: wait for that
  // encode rather than starting a second one.
  await session.inflight
    .get(buildAssetSettingsKey(settings))
    ?.promise.catch(() => undefined);

  if (isProcessingQueued(session.type)) options.onQueued?.();
  const result = await withProcessingSlot(
    session.type,
    async () => {
      const processed =
        (await takeRender(session, settings)) ??
        (await renderAsset(session.source, settings, {
          signal: options.signal,
          onProgress: options.onProgress,
        }));
      return await commitProcessedAsset({
        processed,
        settings,
        familyUuid: session.familyUuid,
        source: session.source,
        transformSource: session.transform,
      });
    },
    { signal: options.signal },
  );

  // Keeping the original moved the staged file into the library. The draft
  // goes on reading it from there, without owning it.
  if (request.type === 'original' && session.source.owned) {
    session.source = {
      path: THEI_SERVER.assets.filePath(result.contentHash, result.extension),
      size: result.size,
      hash: result.contentHash,
      extension: result.extension,
      owned: false,
    };
  }
  return result;
}

async function takeRender(
  session: DraftSession,
  settings: AssetUploadSettings,
): Promise<ProcessedAsset | undefined> {
  if (settings.type !== 'image-transform') return undefined;
  const key = buildAssetSettingsKey(settings);
  const record = session.renders.get(key);
  if (!record) return undefined;
  const present = await stat(record.path).catch(() => null);
  if (!present?.isFile()) return undefined;

  // Handed over, not shared: storage moves the file into the library.
  session.renders.delete(key);
  return {
    bytes: await fileBytes(record.path, true),
    extension: record.extension,
    type: AssetType.Image,
    dimensions: { width: record.width, height: record.height },
  };
}

function publicRender(record: DraftRenderRecord): AssetDraftRender {
  const { path: _path, ...render } = record;
  return render;
}

async function evictOverflow() {
  while (drafts.size > MAX_DRAFTS) {
    const oldest = [...drafts.values()].sort(
      (left, right) => left.lastAccess - right.lastAccess,
    )[0]!;
    await closeDraft(oldest.id);
  }
}

function scheduleExpiry() {
  if (expiryTimer) return;
  expiryTimer = setInterval(() => {
    void expireIdleDrafts();
  }, EXPIRY_CHECK_MS);
  expiryTimer.unref?.();
}

export async function expireIdleDrafts(now = Date.now()) {
  for (const session of [...drafts.values()]) {
    if (
      now - session.lastAccess >= DRAFT_IDLE_MS &&
      session.inflight.size === 0
    ) {
      await closeDraft(session.id);
    }
  }
  if (!drafts.size && expiryTimer) {
    clearInterval(expiryTimer);
    expiryTimer = undefined;
  }
}

/**
 * Removes draft directories no live draft owns.
 *
 * The general temp sweep only takes loose files, so a draft directory left by
 * a crash would otherwise stay forever. Only directories older than an hour
 * go, like everything else the sweep takes.
 */
export async function sweepDraftDirectories(
  cutoffMs = Date.now() - 60 * 60 * 1000,
): Promise<number> {
  const root = draftsDirectory();
  let removed = 0;
  for (const name of await readdir(root).catch(() => [] as string[])) {
    if (drafts.has(name)) continue;
    const path = join(root, name);
    const entry = await stat(path).catch(() => null);
    if (!entry?.isDirectory() || entry.mtimeMs >= cutoffMs) continue;
    await rm(path, { recursive: true, force: true }).catch(() => {});
    removed += 1;
  }
  return removed;
}

/**
 * Forgets every draft directory on start.
 *
 * Drafts live in memory, so after a restart none of them can be reached, and
 * whatever the previous process left is scratch.
 */
export async function clearDraftDirectories() {
  await rm(draftsDirectory(), { recursive: true, force: true });
}

/** For tests: forget every draft without touching the disk. */
export function resetDraftsForTests() {
  drafts.clear();
  if (expiryTimer) clearInterval(expiryTimer);
  expiryTimer = undefined;
}

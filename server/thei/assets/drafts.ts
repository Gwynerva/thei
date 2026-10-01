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
  ASSET_DRAFT_MAX_RENDERS,
  buildAssetDraftRenderUrl,
  type AssetDraftRender,
  type AssetDraftSource,
} from '#layers/thei/shared/api/asset-draft';
import type { AssetUploadResponse } from '#layers/thei/shared/api/asset';
import type { AssetUploadProgress } from '#layers/thei/shared/api/asset-upload-progress';
import { AssetType } from '#layers/thei/shared/asset';
import {
  buildAssetSettingsKey,
  createOriginalAssetSettings,
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
import { discardAssetScratch } from './storage';
import { theiTempDir } from './temp';

/** How long a draft outlives its last request. */
const DRAFT_IDLE_MS = 30 * 60 * 1000;
/** Drafts held at once; the least recently used idle one goes first. */
const MAX_DRAFTS = 4;
const EXPIRY_CHECK_MS = 5 * 60 * 1000;

interface DraftRenderRecord extends AssetDraftRender {
  path: string;
}

interface InflightRender {
  promise: Promise<DraftRenderRecord>;
  controller: AbortController;
  waiters: number;
  /** The encoder has the job; from here it runs to the end and is kept. */
  started: boolean;
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
  /** Commits under way. A busy draft is neither expired nor evicted. */
  busy: number;
  /** Closed while at work: its directory goes once the work is over. */
  closing?: boolean;
  /** The upload id of the last commit run as a job of the draft's. */
  job?: string;
  /**
   * Set while a commit may move the staged source into the library. Work
   * that reads the source waits for it: the path it would open is about to
   * stop existing, and the one that replaces it is only known afterwards.
   */
  moving?: Promise<void>;
}

/** The draft's source once no commit is moving it into the library. */
async function sourceAtRest(session: DraftSession): Promise<AssetSourceFile> {
  while (session.moving) await session.moving;
  return session.source;
}

/** Marks the source as possibly on its way into the library; returns the end. */
function holdSource(session: DraftSession): () => void {
  let release!: () => void;
  const moving = new Promise<void>((resolve) => (release = resolve));
  session.moving = moving;
  return () => {
    if (session.moving === moving) session.moving = undefined;
    release();
  };
}

/** Nothing reads the draft's files: it may go. */
function isIdle(session: DraftSession) {
  return session.busy === 0 && session.inflight.size === 0;
}

/**
 * Removes the directory of a closed draft once nothing reads it any more.
 *
 * An encode that cannot be stopped is still reading the source, and a
 * commit may be moving its result out of the directory: pulling it from
 * under them would fail them for nothing and leave their output behind.
 */
async function releaseClosedDraft(session: DraftSession) {
  if (!session.closing || !isIdle(session)) return;
  await rm(session.directory, { recursive: true, force: true }).catch(() => {});
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
    busy: 0,
  };
  drafts.set(id, session);
  await evictOverflow(id);
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
  session.closing = true;
  for (const job of session.inflight.values()) {
    job.controller.abort(new DOMException('Draft closed', 'AbortError'));
  }
  await releaseClosedDraft(session);
}

/**
 * Encodes an image from a draft for the admin to judge, without storing it.
 *
 * Asking for settings already rendered answers at once; asking for the same
 * settings twice joins the one encode. A render is dropped when its last
 * requester goes: while it still waits for a slot it leaves the queue, and
 * once the encoder has it, it runs to the end and is kept, since the next
 * request for it is then free. Dry runs wait behind everything else.
 */
export async function renderDraft(
  session: DraftSession,
  request: AssetUploadRequest,
  signal: AbortSignal,
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

  let job = joinableRender(session, key);
  if (!job) {
    const controller = new AbortController();
    const own = { controller, waiters: 0, started: false } as InflightRender;
    own.promise = withProcessingSlot(
      AssetType.Image,
      async () => {
        controller.signal.throwIfAborted();
        own.started = true;
        return await encodeDraftRender(
          session,
          settings,
          key,
          controller.signal,
        );
      },
      { signal: controller.signal, priority: 'low' },
    ).finally(() => {
      // Only its own entry: a successor may already stand under the key.
      if (session.inflight.get(key) === own) session.inflight.delete(key);
      void releaseClosedDraft(session);
    });
    job = own;
    session.inflight.set(key, own);
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

/**
 * The encode under way for these settings, if it is worth waiting for. One
 * aborted before it started is about to reject with the reason of whoever
 * left it, and a fresh job takes its place; one that has started finishes.
 */
function joinableRender(session: DraftSession, key: string) {
  const job = session.inflight.get(key);
  return job && (job.started || !job.controller.signal.aborted)
    ? job
    : undefined;
}

async function encodeDraftRender(
  session: DraftSession,
  settings: AssetImageTransformSettings,
  key: string,
  signal: AbortSignal,
): Promise<DraftRenderRecord> {
  const source = await sourceAtRest(session);
  const processed = await renderAsset(source, settings, { signal });
  return await cacheRender(session, key, settings, processed);
}

/**
 * Keeps an encode as a render of the draft, whoever asked for it: a dry run,
 * or a commit that was interrupted once its encode was done — the editor
 * then opened on the draft finds it ready.
 */
async function cacheRender(
  session: DraftSession,
  key: string,
  settings: AssetImageTransformSettings,
  processed: ProcessedAsset,
): Promise<DraftRenderRecord> {
  const renderId = sha256(Buffer.from(key)).slice(0, 16);
  const path = join(session.directory, `${renderId}.${processed.extension}`);
  const { bytes } = processed;
  const record: DraftRenderRecord = {
    renderId,
    settingsKey: key,
    settings,
    extension: processed.extension,
    size: bytes.buffer ? bytes.buffer.length : bytes.size,
    width: processed.dimensions.width ?? settings.dimensions.width,
    height: processed.dimensions.height ?? settings.dimensions.height,
    url: buildAssetDraftRenderUrl(session.id, renderId),
    path,
  };
  // A draft closed while this was encoding has no use for the result, and
  // its directory is about to go: nothing is written there.
  if (session.closing || !drafts.has(session.id)) {
    await discardAssetScratch(bytes);
    return record;
  }
  // A raster encode comes back in memory; a kept vector is already a file.
  if (bytes.buffer) await writeFile(path, bytes.buffer);
  else await rename(bytes.path, path);
  session.renders.set(key, record);
  while (session.renders.size > ASSET_DRAFT_MAX_RENDERS) {
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
 * else is produced now, video included, inside a processing slot. A new file
 * turned into a variant is kept beside it as it was uploaded (`keepOriginal`).
 */
export async function commitDraft(
  session: DraftSession,
  request: AssetUploadRequest,
  options: {
    signal: AbortSignal;
    /** Told where the job is, for a client following it. */
    onStatus?: (status: AssetUploadProgress) => void;
  },
): Promise<AssetUploadResponse> {
  validateAssetVariantSettings(session.type, session.source.extension, request);
  // Busy from the first await on: an idle draft may be evicted meanwhile.
  session.busy += 1;
  try {
    // The source was probed when the draft opened, so this reads no file.
    const settings = await resolveAssetRequest(
      request,
      session.source,
      session.type,
      session.transform,
    );
    const key = buildAssetSettingsKey(settings);
    // "Use" pressed while these very settings are still encoding: wait for
    // that encode rather than starting a second one.
    await joinableRender(session, key)?.promise.catch(() => undefined);

    if (isProcessingQueued(session.type)) {
      options.onStatus?.({ phase: 'queued' });
    }
    return await withProcessingSlot(
      session.type,
      async () => {
        options.onStatus?.({ phase: 'processing' });
        let processed = await takeRender(session, settings);
        if (!processed) {
          processed = await renderAsset(await sourceAtRest(session), settings, {
            signal: options.signal,
            onProgress: (progress) =>
              options.onStatus?.({ phase: 'processing', progress }),
          });
          if (options.signal.aborted) {
            // Nobody waits for the result, but the encode is done. A
            // picture is kept as a render of the draft, so an editor opened
            // on it has this at once; anything else is dropped.
            if (settings.type === 'image-transform') {
              await cacheRender(session, key, settings, processed);
            } else if (processed.bytes.path !== session.source.path) {
              await discardAssetScratch(processed.bytes);
            }
            options.signal.throwIfAborted();
          }
        }
        options.onStatus?.({ phase: 'finishing' });
        // Another commit of the draft may be moving the source right now;
        // this one then finds it in the library and keeps nothing more.
        await sourceAtRest(session);
        const moved = session.source.owned ? holdSource(session) : undefined;
        try {
          const variant = await commitProcessedAsset({
            processed,
            settings,
            familyUuid: session.familyUuid,
            source: session.source,
            transformSource: session.transform,
          });
          const original =
            settings.type === 'original'
              ? variant
              : await keepOriginal(session, options.signal);
          // Keeping the original moved the staged file into the library. The
          // draft goes on reading it from there, without owning it — told so
          // before anything waiting to read it goes on.
          if (original && session.source.owned) {
            session.source = {
              path: THEI_SERVER.assets.filePath(
                original.contentHash,
                original.extension,
              ),
              size: original.size,
              hash: original.contentHash,
              extension: original.extension,
              owned: false,
            };
          }
          return variant;
        } finally {
          moved?.();
        }
      },
      { signal: options.signal },
    );
  } finally {
    session.busy -= 1;
    await releaseClosedDraft(session);
  }
}

/**
 * Stores a new file as it was uploaded, beside the variant just made of it.
 *
 * Nothing uses it, so the cleanup takes it a day later; until then an editor
 * opened on the variant derives from this rather than from compressed bytes.
 * Only a draft that owns its source has one to keep: a library file is kept
 * already, and a draft that stored its original reads it from the library.
 * Nobody wants it for a draft given up meanwhile. The variant is what was
 * asked for, so a failure here is logged and the variant still returned.
 */
async function keepOriginal(
  session: DraftSession,
  signal: AbortSignal,
): Promise<AssetUploadResponse | undefined> {
  if (!session.source.owned || session.closing || signal.aborted) {
    return undefined;
  }
  const settings = createOriginalAssetSettings();
  try {
    return await commitProcessedAsset({
      processed: await renderAsset(session.source, settings),
      settings,
      familyUuid: session.familyUuid,
      source: session.source,
    });
  } catch (error) {
    console.error(
      `Could not keep the original of draft ${session.id}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    // Storage may have moved the staged file before failing, and removed it
    // after. The draft is then forgotten, and an editor still on it stages
    // its file again as for any draft gone.
    if (!(await stat(session.source.path).catch(() => null))?.isFile()) {
      await closeDraft(session.id);
    }
    return undefined;
  }
}

async function takeRender(
  session: DraftSession,
  settings: AssetUploadSettings,
): Promise<ProcessedAsset | undefined> {
  if (settings.type !== 'image-transform') return undefined;
  const key = buildAssetSettingsKey(settings);
  const record = session.renders.get(key);
  if (!record) return undefined;
  // Handed over, not shared: storage moves the file into the library. Taken
  // off the list first, so no render cached meanwhile evicts it.
  session.renders.delete(key);
  const present = await stat(record.path).catch(() => null);
  if (!present?.isFile()) return undefined;
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

/**
 * Closes the least recently used idle drafts past the limit. The draft just
 * opened is never one of them: it is idle only because nothing has asked it
 * for anything yet, and its file was staged a moment ago.
 */
async function evictOverflow(opened: string) {
  while (drafts.size > MAX_DRAFTS) {
    const oldest = [...drafts.values()]
      .filter((session) => session.id !== opened && isIdle(session))
      .sort((left, right) => left.lastAccess - right.lastAccess)[0];
    // Every other draft is at work: one too many is kept until a draft
    // opened later finds one of them idle.
    if (!oldest) return;
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
    if (now - session.lastAccess >= DRAFT_IDLE_MS && isIdle(session)) {
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

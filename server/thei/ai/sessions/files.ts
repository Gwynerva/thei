import { randomUUID } from 'node:crypto';
import { readFile, rm, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { and, eq, inArray } from 'drizzle-orm';
import { createError } from 'h3';
import sharp from 'sharp';
import { AssetType } from '#layers/thei/shared/asset';
import { TEXT_FILE_EXTENSIONS } from '#layers/thei/shared/assets/preview';
import { decodeText } from '#layers/thei/shared/text-bytes';
import type { AiMessageFile, AiMessagePart } from '#layers/thei/shared/ai';
import type { AssetVariantInfo } from '#layers/thei/shared/api/asset';
import { withProcessingSlot } from '../../assets/queue';
import { runFfmpeg } from '../../assets/ffmpeg';
import { deleteUsagesReleasing } from '../../assets/repository/usages/release';
import { theiTempPath } from '../../assets/temp';
import {
  describeStoredAsset,
  type StoredAssetRecord,
} from '../../assets/storage';
import { turnFiles, type StreamFile } from '../model/stream';
import { fileKind, fileSettings, storeStagedFile } from '../../mcp/files';
import { stageUploadStream } from '../../assets/upload-stream';
import { publishSession } from './bus';
import { findSession, touchSession } from './store';

/**
 * Files in sessions. What the owner brings along with a message goes into
 * the library like any upload, with its place there: in this session. So the
 * library shows it, cleanup leaves it, and a proposal can put it in a text by
 * its id. When the session goes — deleted, or purged a month in the archive —
 * the place goes with it, and a file nothing else holds is swept a day
 * later, as any file nothing uses.
 */

/** The most files one message brings. */
export const SESSION_FILES_MAX = 10;
const NAME_MAX = 200;

export interface SessionFile {
  assetUuid: string;
  name: string;
}

/** Refuses what the owner's page sent, saying why. */
export function refused(message: string): never {
  throw createError({ statusCode: 400, message });
}

/**
 * The files a message brings, as the page sends them: files of the library,
 * each with the name it had on the owner's computer. Refuses what is not.
 */
export function sessionFilesOf(value: unknown): SessionFile[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) refused('Files are a list');
  if (value.length > SESSION_FILES_MAX)
    refused(`A message brings at most ${SESSION_FILES_MAX} files`);
  const files = value.map((item): SessionFile => {
    const { assetUuid, name } = (item ?? {}) as Record<string, unknown>;
    if (typeof assetUuid !== 'string' || !assetUuid)
      refused('A file has no id');
    return {
      assetUuid,
      name:
        typeof name === 'string' && name.trim()
          ? name.trim().slice(0, NAME_MAX)
          : assetUuid,
    };
  });
  const known = new Set(
    findAssets(files.map((file) => file.assetUuid))
      // A preview is the engine's own, never brought along.
      .filter((asset) => asset.settings !== null)
      .map((asset) => asset.assetUuid),
  );
  const missing = files.find((file) => !known.has(file.assetUuid));
  if (missing) refused(`There is no file ${missing.assetUuid} in the library`);
  return files;
}

function findAssets(assetUuids: readonly string[]): StoredAssetRecord[] {
  if (!assetUuids.length) return [];
  const { db, schema } = THEI_SERVER.useDb();
  return db
    .select()
    .from(schema.assets)
    .where(inArray(schema.assets.assetUuid, [...new Set(assetUuids)]))
    .all() as StoredAssetRecord[];
}

/** Gives the files their place in the session, inside `tx`. */
export function placeSessionFiles(
  tx: any,
  schema: any,
  sessionUuid: string,
  assetUuids: readonly string[],
  now: number,
) {
  const unique = [...new Set(assetUuids)];
  if (!unique.length) return;
  tx.insert(schema.assetUsages)
    .values(
      unique.map((assetUuid) => ({
        assetUuid,
        containerType: 'ai-session',
        containerId: sessionUuid,
        role: 'ai-attachment',
      })),
    )
    .onConflictDoNothing()
    .run();
  tx.update(schema.assets)
    .set({ touchedAt: now })
    .where(inArray(schema.assets.assetUuid, unique))
    .run();
}

/**
 * Gives a file an app brought — uploaded, imported, re-encoded — its place
 * in the app's session, as the owner's files have theirs: kept while the
 * session lives, and shown in the library where it is.
 */
export function placeAppFile(
  sessionUuid: string,
  assetUuid: string,
  now = Date.now(),
) {
  const session = findSession(sessionUuid);
  if (!session) return;
  const { db, schema } = THEI_SERVER.useDb();
  db.transaction((tx) => {
    placeSessionFiles(tx, schema, sessionUuid, [assetUuid], now);
    touchSession(tx, schema, sessionUuid, now);
  });
  publishSession(sessionUuid, { type: 'session' });
}

/**
 * Takes the files' place in these sessions away, inside `tx`: a file nothing
 * else holds starts its last day.
 */
export function releaseSessionFiles(
  tx: any,
  schema: any,
  sessionUuids: readonly string[],
  now: number,
) {
  if (!sessionUuids.length) return;
  deleteUsagesReleasing(
    tx,
    schema,
    and(
      eq(schema.assetUsages.containerType, 'ai-session'),
      inArray(schema.assetUsages.containerId, [...sessionUuids]),
    ),
    now,
  );
}

/** The files of a message's parts, as the library describes them now. */
export function messageFiles(parts: readonly AiMessagePart[]): AiMessageFile[] {
  const named = parts.filter(
    (part): part is Extract<AiMessagePart, { type: 'file' }> =>
      part.type === 'file',
  );
  if (!named.length) return [];
  const assets = new Map(
    findAssets(named.map((part) => part.assetUuid)).map((asset) => [
      asset.assetUuid,
      asset,
    ]),
  );
  const previews = previewsOf([...assets.keys()]);
  return named.map((part) => {
    const asset = assets.get(part.assetUuid);
    return {
      name: part.name,
      asset: asset
        ? describeStoredAsset(asset, previews.get(asset.assetUuid))
        : null,
    };
  });
}

/** A library file as the page describes it, with its preview; none when gone. */
export function libraryFile(assetUuid: string): AssetVariantInfo | undefined {
  const asset = findAssets([assetUuid])[0];
  if (!asset || asset.settings === null) return undefined;
  return describeStoredAsset(asset, previewsOf([assetUuid]).get(assetUuid));
}

/** The previews of these files, by the file they are of. */
function previewsOf(assetUuids: readonly string[]): Map<string, string> {
  if (!assetUuids.length) return new Map();
  const { db, schema } = THEI_SERVER.useDb();
  return new Map(
    db
      .select({
        of: schema.assetUsages.containerId,
        preview: schema.assetUsages.assetUuid,
      })
      .from(schema.assetUsages)
      .where(
        and(
          eq(schema.assetUsages.containerType, 'asset'),
          eq(schema.assetUsages.role, 'preview'),
          inArray(schema.assetUsages.containerId, [...assetUuids]),
        ),
      )
      .all()
      .map((row: { of: string; preview: string }) => [row.of, row.preview]),
  );
}

// ---- For the model ----------------------------------------------------------------

const KINDS: Record<AssetType, string> = {
  [AssetType.Image]: 'a picture',
  [AssetType.Video]: 'a video',
  [AssetType.Audio]: 'a recording',
  [AssetType.Other]: 'a file',
};

function megabytes(size: number) {
  return size < 1024 * 1024
    ? `${Math.max(1, Math.round(size / 1024))} KB`
    : `${(size / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * What the model is told of the files a message brings: each by its name,
 * what it is and its id, and how a text takes one in.
 */
export function sessionFilesNote(files: readonly SessionFile[]): string {
  if (!files.length) return '';
  const assets = new Map(
    findAssets(files.map((file) => file.assetUuid)).map((asset) => [
      asset.assetUuid,
      asset,
    ]),
  );
  const lines = files.map((file) => {
    const asset = assets.get(file.assetUuid);
    if (!asset) return `- «${file.name}», ${file.assetUuid}`;
    const meta = (asset.meta ?? {}) as { width?: number; height?: number };
    const size =
      meta.width && meta.height ? ` ${meta.width}×${meta.height}` : '';
    return `- «${file.name}»: ${KINDS[asset.type]}${size}, ${asset.extension.toUpperCase()}, ${megabytes(asset.size)} — ${asset.assetUuid}`;
  });
  return [
    'The owner brought these files; they are in the library already, kept in this session. Pictures, PDFs, texts, recordings and videos — a frame and their sound — among them are shown to you, as far as your service takes them.',
    ...lines,
    'A text takes one in by its id: ::media[caption]{asset="…"} for a picture or a video, ::audio[caption]{asset="…" title="…"}, ::file[caption]{asset="…" title="…"} for any file; several files listed together are ::file lines inside :::files{title="…"} … :::.',
  ].join('\n');
}

// ---- Made by the model ------------------------------------------------------------

/**
 * Makes a file a model wrote — whatever it is, as its name says — into the
 * library, kept in the session like a file the owner brought. The content is
 * text, or base64 for bytes. Returns the file, or why it could not be made,
 * in words for the model. A turn stopped while it was made, or a file left
 * for taking too long — `signal` — keeps nothing: the file has no place, and
 * the library lets it go.
 */
export async function makeSessionFile(
  sessionUuid: string,
  input: { name?: unknown; content?: unknown; base64?: unknown },
  live: () => boolean = () => true,
  signal?: AbortSignal,
): Promise<{ file: SessionFile } | { refused: string }> {
  const { name, content } = input;
  if (typeof name !== 'string' || typeof content !== 'string' || !content)
    return { refused: 'A file needs its name and its content.' };
  const fileName = name.trim().slice(0, NAME_MAX);
  try {
    const kind = fileKind(fileName);
    const bytes = Buffer.from(
      content,
      input.base64 === true ? 'base64' : 'utf8',
    );
    const staged = await stageUploadStream(Readable.from([bytes]), {
      maxSizeBytes: kind.maxSizeBytes,
    });
    const { assetUuid } = await storeStagedFile(
      staged,
      { ...kind, settings: fileSettings(undefined) },
      signal,
    );
    const { db, schema } = THEI_SERVER.useDb();
    const placed = db.transaction((tx) => {
      if (!live() || signal?.aborted) return false;
      placeSessionFiles(tx, schema, sessionUuid, [assetUuid], Date.now());
      return true;
    });
    if (!placed) return { refused: 'The turn was stopped; nothing was kept.' };
    return { file: { assetUuid, name: fileName } };
  } catch (error) {
    return {
      refused: `The file could not be made: ${error instanceof Error ? error.message : String(error)}.`,
    };
  }
}

/** The longest side of a picture shown to a model. */
const PICTURE_SIDE = 1568;
/** The largest PDF given to a model whole. */
const PDF_MAX = 10 * 1024 * 1024;
/** The largest text file given to a model. */
const TEXT_MAX = 100 * 1024;
/** How much of a recording a model hears: the rest is cut, and it is told. */
const SOUND_SECONDS = 10 * 60;
/**
 * The largest sound given to a model whole: ten minutes of the MP3 made for
 * it are 2.4 MB, so only a broken encode meets it.
 */
const SOUND_MAX = 6 * 1024 * 1024;

/**
 * Files made ready for a model lately, by id: a session rereads them every
 * turn. Kept within a budget of bytes, the oldest given up first.
 */
const ready = new Map<string, { blocks: StreamFile[]; bytes: number }>();
const READY_BYTES = 48 * 1024 * 1024;
let readyBytes = 0;

/**
 * Gives up what a model was made ready to be shown of a file: a video whose
 * frame was chosen again is shown by its new frame from the next turn on.
 */
export function forgetModelFile(assetUuid: string) {
  const kept = ready.get(assetUuid);
  if (!kept) return;
  readyBytes -= kept.bytes;
  ready.delete(assetUuid);
}

function keepReady(id: string, blocks: StreamFile[]) {
  const bytes = blocks.reduce(
    (sum, block) =>
      sum + ('data' in block ? block.data.length : block.text.length),
    0,
  );
  // Made twice at once — two turns showing the same file — it is kept once.
  const before = ready.get(id);
  if (before) {
    readyBytes -= before.bytes;
    ready.delete(id);
  }
  ready.set(id, { blocks, bytes });
  readyBytes += bytes;
  while (readyBytes > READY_BYTES && ready.size > 1) {
    const oldest = ready.keys().next().value!;
    readyBytes -= ready.get(oldest)!.bytes;
    ready.delete(oldest);
  }
}

/** A picture as a model is shown it: a JPEG, no larger than it needs. */
async function picture(path: string, signal?: AbortSignal): Promise<string> {
  const data = await withProcessingSlot(
    AssetType.Image,
    () =>
      sharp(path, { animated: false })
        .autoOrient()
        .resize({
          width: PICTURE_SIDE,
          height: PICTURE_SIDE,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 80 })
        .toBuffer(),
    // A stopped turn gives its place in the queue up.
    { signal },
  );
  return data.toString('base64');
}

/**
 * The sound of a recording or of a video as a model hears it: a small MP3
 * of one channel, its first minutes at most, made in the sound lane on disk
 * and read whole only under the cap. None for a file with no sound.
 */
async function sound(
  path: string,
  name: string,
  duration: number | undefined,
  signal?: AbortSignal,
): Promise<StreamFile | null> {
  const out = theiTempPath(`model-sound-${randomUUID()}.mp3`);
  try {
    const code = await withProcessingSlot(
      AssetType.Audio,
      () =>
        runFfmpeg(
          [
            '-hide_banner',
            '-loglevel',
            'error',
            '-y',
            '-i',
            path,
            '-vn',
            '-t',
            String(SOUND_SECONDS),
            '-ac',
            '1',
            '-ar',
            '16000',
            '-b:a',
            '32k',
            '-f',
            'mp3',
            out,
          ],
          // A stopped turn kills the encode.
          { signal },
        ),
      // A stopped turn gives its place in the queue up.
      { signal },
    );
    if (code !== 0) return null;
    const { size } = await stat(out);
    if (!size || size > SOUND_MAX) return null;
    return {
      kind: 'audio',
      name,
      data: (await readFile(out)).toString('base64'),
      ...(duration && duration > SOUND_SECONDS + 1
        ? { cutAt: SOUND_SECONDS }
        : {}),
    };
  } finally {
    await rm(out, { force: true }).catch(() => {});
  }
}

/**
 * How each kind of file is shown to a model — the one table of it. A file
 * becomes the blocks a model's API takes: a photo a picture; a drawing by
 * its preview; a video its frame and its sound; a recording its sound; a
 * PDF itself; a text its words. Any other file is told of by its name and
 * id alone. Whether a model's service takes each block is for the stream to
 * find out (`model/stream.ts`): what it turns away is told in words.
 *
 * `whole` is false while a part waits for its preview — a drawing's, a
 * video's frame — so what is shown now is not kept for later turns.
 */
async function blocksOf(
  asset: StoredAssetRecord,
  name: string,
  preview: StoredAssetRecord | undefined,
  signal?: AbortSignal,
): Promise<{ blocks: StreamFile[]; whole: boolean }> {
  const path = (record: StoredAssetRecord) =>
    THEI_SERVER.assets.filePath(record.contentHash, record.extension);
  const meta = (asset.meta ?? {}) as { hasAudio?: boolean; duration?: number };
  const whole = (blocks: StreamFile[]) => ({ blocks, whole: true });
  switch (asset.type) {
    case AssetType.Image:
      if (asset.extension !== 'svg')
        return whole([
          { kind: 'image', name, data: await picture(path(asset), signal) },
        ]);
      return preview
        ? whole([
            { kind: 'image', name, data: await picture(path(preview), signal) },
          ])
        : { blocks: [], whole: false };
    case AssetType.Video: {
      const blocks: StreamFile[] = preview
        ? [{ kind: 'image', name, data: await picture(path(preview), signal) }]
        : [];
      // A video with no sound track is its frame alone.
      const track =
        meta.hasAudio === false
          ? null
          : await sound(path(asset), name, meta.duration, signal);
      return {
        blocks: track ? [...blocks, track] : blocks,
        whole: Boolean(preview),
      };
    }
    case AssetType.Audio: {
      const track = await sound(path(asset), name, meta.duration, signal);
      return whole(track ? [track] : []);
    }
    default:
      if (asset.extension === 'pdf' && asset.size <= PDF_MAX)
        return whole([
          {
            kind: 'pdf',
            name,
            data: (await readFile(path(asset))).toString('base64'),
          },
        ]);
      if (TEXT_FILE_EXTENSIONS.has(asset.extension) && asset.size <= TEXT_MAX)
        // Read in the encoding it was written in, as the owner sees it.
        return whole([
          { kind: 'text', name, text: decodeText(await readFile(path(asset))) },
        ]);
      return whole([]);
  }
}

/**
 * The files these turns show — what the owner brought, what a tool showed —
 * made ready for a model by id, each under the name it goes by here. One
 * that cannot be shown — gone, too large, of a kind no model reads — is
 * left out: the words around it still name it. `signal` stops it for a
 * stopped turn.
 */
export async function modelFiles(
  turns: readonly { role: string; files?: string[] }[],
  names: ReadonlyMap<string, string>,
  signal?: AbortSignal,
): Promise<Map<string, StreamFile[]>> {
  const ids = [...new Set(turns.flatMap(turnFiles))];
  const result = new Map<string, StreamFile[]>();
  if (!ids.length) return result;
  const assets = new Map(
    findAssets(ids).map((asset) => [asset.assetUuid, asset]),
  );
  const previewIds = previewsOf(ids);
  const previews = new Map(
    findAssets([...previewIds.values()]).map((asset) => [
      asset.assetUuid,
      asset,
    ]),
  );
  for (const id of ids) {
    const name = names.get(id) ?? id;
    const kept = ready.get(id);
    if (kept) {
      // Kept under the name it was first shown by: told by this one.
      result.set(
        id,
        kept.blocks.map((block) => ({ ...block, name })),
      );
      continue;
    }
    const asset = assets.get(id);
    if (!asset) continue;
    try {
      const made = await blocksOf(
        asset,
        name,
        previews.get(previewIds.get(id) ?? ''),
        signal,
      );
      // One not whole yet — a video's preview still on its way — is shown
      // as it is, and made again next turn.
      if (made.whole && made.blocks.length) keepReady(id, made.blocks);
      if (made.blocks.length) result.set(id, made.blocks);
    } catch (error) {
      if (signal?.aborted) throw error;
      THEI_SERVER.console
        .tag('AI')
        .warn(`A file could not be made ready for a model: ${String(error)}`);
    }
  }
  return result;
}

import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import type { AssetUploadResponse } from '#layers/thei/shared/api/asset';
import { AssetType } from '#layers/thei/shared/asset';
import { ASSET_UPLOAD_LIMITS } from '#layers/thei/shared/asset-upload-limits';
import type { AssetUploadRequest } from '#layers/thei/shared/asset-upload-settings';
import { normalizeAssetExtension } from '#layers/thei/shared/assets/formats';
import type { ApiTokenPrincipal } from '../api-tokens';
import { createAssetVariant } from '../assets/create-variant';
import { findStoredAssetByHash } from '../assets/lookup';
import { buildAssetVariantInfo } from '../assets/storage';
import { inferAssetType } from '../assets/process';
import { parseAssetUploadSettings } from '../assets/upload-request';
import { stageUploadStream, type StagedUpload } from '../assets/upload-stream';
import { openGuarded } from '../external-links/fetch';
import { refuse as fail } from '../entity-patch/text';

/**
 * Files an editor token brings into the library and re-encodes: the same
 * pipeline the admin's uploads go through, from bytes a client sends to a
 * one-time address, from an address on the web, or from a file already in
 * the library. Bytes are streamed to disk, never held whole in memory.
 */

/** How long a one-time address stays open. */
const TICKET_LIFETIME_MS = 15 * 60 * 1000;
/** Open addresses of each kind one token may hold at once. */
const TICKETS_PER_TOKEN = 20;

/**
 * One-time addresses of one kind, by the ticket in them: each serves once,
 * lapses after a few minutes, and a token holds only so many at a time.
 */
function ticketBook<T extends { tokenUuid: string }>(kind: string) {
  const tickets = new Map<string, T & { expiresAt: number }>();
  const sweep = (now = Date.now()) => {
    for (const [ticket, entry] of tickets)
      if (entry.expiresAt <= now) tickets.delete(ticket);
  };
  return {
    /** Opens an address for `entry`, or refuses when its token holds too many. */
    issue(entry: T) {
      sweep();
      const held = [...tickets.values()].filter(
        (open) => open.tokenUuid === entry.tokenUuid,
      ).length;
      if (held >= TICKETS_PER_TOKEN)
        fail(
          `Too many ${kind} addresses are open; use them or wait for them to lapse.`,
        );
      const ticket = randomBytes(24).toString('base64url');
      const expiresAt = Date.now() + TICKET_LIFETIME_MS;
      tickets.set(ticket, { ...entry, expiresAt });
      return { ticket, expiresAt };
    },
    /** Takes an address up, once. */
    take(ticket: string) {
      sweep();
      const entry = tickets.get(ticket);
      if (entry) tickets.delete(ticket);
      return entry;
    },
  };
}

interface UploadTicket {
  tokenUuid: string;
  extension: string;
  sourceType: AssetType;
  maxSizeBytes: number;
  settings: AssetUploadRequest;
  /** The session the file is brought into. */
  sessionUuid: string;
}

const uploads = ticketBook<UploadTicket>('upload');

/** What a file is by its name: its extension, its kind, how large it may be. */
export function fileKind(name: string) {
  const dot = name.lastIndexOf('.');
  const extension = dot < 0 ? '' : normalizeAssetExtension(name.slice(dot + 1));
  if (!extension)
    fail('Give the file name with its extension, such as photo.jpg.');
  const sourceType = inferAssetType(extension);
  return {
    extension,
    sourceType,
    maxSizeBytes:
      sourceType === AssetType.Other
        ? ASSET_UPLOAD_LIMITS.file
        : ASSET_UPLOAD_LIMITS.media,
  };
}

/** Settings as the asset pipeline takes them: the file as it is, unless asked. */
export function fileSettings(value: unknown): AssetUploadRequest {
  try {
    return parseAssetUploadSettings(
      JSON.stringify(value ?? { type: 'original' }),
    );
  } catch (error) {
    fail(error instanceof Error ? error.message : 'Invalid settings.');
  }
}

/** Opens a one-time address a client sends one file's bytes to. */
export function issueUploadTicket(
  principal: ApiTokenPrincipal,
  name: string,
  settings: AssetUploadRequest,
  sessionUuid: string,
) {
  return uploads.issue({
    tokenUuid: principal.tokenUuid,
    ...fileKind(name),
    settings,
    sessionUuid,
  });
}

/** Takes an upload address up, once: it serves one file. */
export function takeUploadTicket(ticket: string) {
  return uploads.take(ticket);
}

/** Stores staged bytes as a library file, as the admin's upload does. */
export async function storeStagedFile(
  staged: StagedUpload,
  kind: Pick<UploadTicket, 'extension' | 'sourceType' | 'settings'>,
  signal?: AbortSignal,
): Promise<AssetUploadResponse> {
  try {
    signal?.throwIfAborted();
    const match = await findStoredAssetByHash(staged.hash, staged.size);
    if (match && kind.settings.type === 'original')
      return { ...(await buildAssetVariantInfo(match)), created: false };
    return await createAssetVariant({
      source: {
        path: staged.path,
        size: staged.size,
        hash: staged.hash,
        extension: kind.extension,
        owned: true,
      },
      familyUuid: match?.familyUuid ?? `af-${staged.hash}`,
      sourceType: kind.sourceType,
      settings: kind.settings,
      signal,
    });
  } finally {
    await staged.discard();
  }
}

/**
 * Downloads a file from the web into the library, streamed to disk; `signal`
 * stops the download and the encoding.
 */
export async function importFile(
  url: string,
  name: string | undefined,
  settings: AssetUploadRequest,
  signal?: AbortSignal,
): Promise<AssetUploadResponse> {
  const fileName =
    name ?? decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '');
  const kind = fileKind(fileName);
  const { response } = await openGuarded(url, {
    accept: '*/*',
    deadline: Date.now() + 5 * 60 * 1000,
    signal,
  }).catch((error: unknown) =>
    fail(
      `The file could not be fetched: ${error instanceof Error ? error.message : String(error)}.`,
    ),
  );
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => {});
    fail(`The address answered ${response.status}; no file was taken.`);
  }
  const staged = await stageUploadStream(
    Readable.fromWeb(response.body as unknown as WebReadableStream<Uint8Array>),
    { maxSizeBytes: kind.maxSizeBytes },
  ).catch((error: unknown) =>
    fail(error instanceof Error ? error.message : 'The download failed.'),
  );
  return storeStagedFile(staged, { ...kind, settings }, signal);
}

/**
 * Makes a new variant of a library file with other settings — smaller,
 * cropped, another format. The file it was made from stays where it is; the
 * new one goes wherever it is put. `signal` stops the encoding.
 */
export async function reprocessFile(
  assetUuid: string,
  settings: AssetUploadRequest,
  signal?: AbortSignal,
): Promise<AssetUploadResponse> {
  const asset =
    (await THEI_SERVER.assets.findByUuid(assetUuid)) ??
    fail(`There is no file ${assetUuid}.`);
  return createAssetVariant({
    source: {
      path: THEI_SERVER.assets.filePath(asset.contentHash, asset.extension),
      size: asset.size,
      hash: asset.contentHash,
      extension: asset.extension,
      owned: false,
    },
    familyUuid: asset.familyUuid,
    sourceType: asset.type as AssetType,
    settings,
    signal,
  });
}

/** A stored file as a model is told of it. */
export function describeFile(file: AssetUploadResponse) {
  return {
    file: file.assetUuid,
    type: file.type,
    extension: file.extension,
    size: file.size,
    created: file.created,
  };
}

// ---- Downloads -------------------------------------------------------------------

const downloads = ticketBook<{ tokenUuid: string; assetUuid: string }>(
  'download',
);

/**
 * Opens a one-time address an app downloads one library file from — to
 * describe it with a model of its own, say. Like an upload address, the
 * address itself is the permission: good for one download and a few
 * minutes, closed with the token that opened it.
 */
export function issueDownloadTicket(
  principal: ApiTokenPrincipal,
  assetUuid: string,
) {
  return downloads.issue({ tokenUuid: principal.tokenUuid, assetUuid });
}

/** Takes a download address up, once: it serves one download. */
export function takeDownloadTicket(ticket: string) {
  return downloads.take(ticket);
}

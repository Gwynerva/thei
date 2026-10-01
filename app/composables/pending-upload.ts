import { markRaw, shallowRef, type ShallowRef } from 'vue';
import type { AssetVariantInfo } from '#layers/thei/shared/api/asset';
import type { AssetDraftSource } from '#layers/thei/shared/api/asset-draft';
import { pastedMediaRequest } from '#layers/thei/shared/asset-paste-defaults';
import {
  getPathExtension,
  imageExtensionProfile,
  isExtensionAllowed,
  videoExtensionProfile,
} from '#layers/thei/shared/assets/extensions';
import { errorMessage } from '#layers/thei/app/modals/upload-settings/use-draft-renders';
import type { PickedFile } from '#layers/thei/app/modals/pick-file/picked-file';
import {
  commitDraftRequest,
  deleteDraft,
  isAbortError,
  isDraftExpired,
  stageDraftFile,
  uploadOriginalFile,
  type UploadConstraints,
} from './upload-draft';
import type { UploadStatus } from './upload-progress';

/**
 * The file as the browser can already show it, before it is stored: a
 * picture or a video by its object URL; any other file only by its kind.
 */
export interface PendingUploadPreview {
  src: string;
  kind: 'image' | 'video' | 'file';
}

export interface PendingUploadOptions {
  constraints: UploadConstraints;
}

/**
 * A file on its way into the library, as a tile or a block shows it: where
 * it is, what went wrong, and the file itself for another try.
 *
 * `result` settles once: with the stored file when an attempt succeeds, or
 * with nothing once the upload is given up. It never rejects — a failure
 * waits in `error` for a retry, so a list holding such uploads never has to
 * catch anything. `status` and `error` are refs, so a tile drawn from them
 * follows on its own; a view rendered by hand re-renders when `result`
 * settles and reads the refs in between.
 */
export interface PendingUpload {
  readonly id: string;
  readonly name: string;
  readonly extension: string;
  readonly preview: PendingUploadPreview;
  readonly status: ShallowRef<UploadStatus | null>;
  /** Why the last attempt failed; nothing while one runs or succeeded. */
  readonly error: ShallowRef<string | undefined>;
  readonly result: Promise<AssetVariantInfo | undefined>;
  /** One attempt: settles when it is over, success or not. Never rejects. */
  run(): Promise<void>;
  /** Another attempt with the same file, after a failure. */
  retry(): void;
  /** Gives the upload up: stops it, frees the server's copy and the preview. */
  dispose(): void;
}

abstract class PendingUploadBase implements PendingUpload {
  readonly id = crypto.randomUUID();
  readonly name: string;
  readonly extension: string;
  readonly preview: PendingUploadPreview;
  readonly status = shallowRef<UploadStatus | null>(null);
  readonly error = shallowRef<string | undefined>();
  readonly result: Promise<AssetVariantInfo | undefined>;
  protected readonly picked: PickedFile;
  private settle!: (asset: AssetVariantInfo | undefined) => void;
  private settled = false;
  private attempt: AbortController | null = null;
  private disposed = false;

  constructor(
    file: File,
    protected readonly options: PendingUploadOptions,
  ) {
    this.name = file.name;
    this.extension = getPathExtension(file.name);
    this.picked = {
      type: 'picked-file',
      file,
      name: file.name,
      size: file.size,
      extension: this.extension,
      objectUrl: URL.createObjectURL(file),
    };
    this.preview = {
      src: this.picked.objectUrl,
      kind: isExtensionAllowed(this.extension, videoExtensionProfile)
        ? 'video'
        : isExtensionAllowed(this.extension, imageExtensionProfile)
          ? 'image'
          : 'file',
    };
    this.result = new Promise((resolve) => {
      this.settle = (asset) => {
        if (this.settled) return;
        this.settled = true;
        resolve(asset);
      };
    });
    // It holds a File and controllers: nothing a reactive proxy should walk.
    markRaw(this);
  }

  run(): Promise<void> {
    return this.start();
  }

  retry() {
    if (this.error.value === undefined) return;
    void this.start();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.abortAttempt();
    this.settle(undefined);
    this.release();
    URL.revokeObjectURL(this.picked.objectUrl);
  }

  /** Stores the file; the signal says the attempt is no longer wanted. */
  protected abstract perform(signal: AbortSignal): Promise<AssetVariantInfo>;

  /** Lets go of whatever the server holds for this upload. */
  protected release(): void {}

  protected report(status: UploadStatus | null) {
    this.status.value = status;
  }

  /** Stops the attempt under way, quietly: no error, no result. */
  protected abortAttempt() {
    this.attempt?.abort();
    this.attempt = null;
  }

  private async start() {
    if (this.settled || this.disposed) return;
    this.abortAttempt();
    const controller = new AbortController();
    this.attempt = controller;
    this.error.value = undefined;
    try {
      const asset = await this.perform(controller.signal);
      if (controller !== this.attempt) return;
      this.settle(asset);
    } catch (reason) {
      if (controller !== this.attempt || isAbortError(reason)) return;
      this.error.value = errorMessage(reason, phrase.value.upload_error_apply);
    } finally {
      if (controller === this.attempt) {
        this.attempt = null;
        this.report(null);
      }
    }
  }
}

/** A file stored as it is, the way a batch of files is added to a list. */
export class PendingOriginalUpload extends PendingUploadBase {
  private readonly send: typeof uploadOriginalFile;

  constructor(
    file: File,
    options: PendingUploadOptions & {
      /** The request itself, replaceable for tests. */
      send?: typeof uploadOriginalFile;
    },
  ) {
    super(file, options);
    this.send = options.send ?? uploadOriginalFile;
  }

  protected perform(signal: AbortSignal) {
    this.report({ phase: 'staging', progress: 0 });
    return this.send(
      this.picked.file,
      this.extension,
      this.options.constraints,
      {
        signal,
        onProgress: (progress) => this.report({ phase: 'staging', progress }),
        onStatus: (status) => this.report(status),
      },
    );
  }
}

/** The requests a pasted file makes on its way in. */
export interface PendingMediaRequests {
  stage: typeof stageDraftFile;
  commit: typeof commitDraftRequest;
  release: typeof deleteDraft;
}

/** A pasted file with the draft it is staged as, for an editor to take over. */
export interface PendingMediaHandover {
  draft: AssetDraftSource;
  file: PickedFile;
}

/**
 * A pasted file on its way into the library without anyone asking: staged
 * once, then stored at the defaults of `pastedMediaRequest`. The block shows
 * where it is meanwhile, and may hand the draft to the asset editor instead;
 * the default is then abandoned for whatever the admin settles on, or taken
 * up again if the editor is dismissed. An image encode the abandoned default
 * had finished is not lost: the server keeps it as the draft's first render.
 */
export class PendingMediaUpload extends PendingUploadBase {
  private draft: Promise<AssetDraftSource> | null = null;
  private staging: AbortController | null = null;
  /** Handed to an editor: the default is not stored until `run` again. */
  private suspended = false;
  private readonly requests: PendingMediaRequests;

  constructor(
    file: File,
    options: PendingUploadOptions & {
      /** The requests themselves, replaceable for tests. */
      requests?: Partial<PendingMediaRequests>;
    },
  ) {
    super(file, options);
    this.requests = {
      stage: stageDraftFile,
      commit: commitDraftRequest,
      release: deleteDraft,
      ...options.requests,
    };
  }

  /**
   * Stops storing the default and hands the draft over. Storing the default
   * again afterwards is `run` once more: the draft is still there, or the
   * file is staged again.
   */
  async suspend(): Promise<PendingMediaHandover> {
    this.suspended = true;
    this.abortAttempt();
    return { draft: await this.stage(), file: this.picked };
  }

  protected async perform(signal: AbortSignal): Promise<AssetVariantInfo> {
    this.suspended = false;
    const draft = await this.stage();
    // Handed over while the file was still going up: the editor decides.
    if (signal.aborted || this.suspended) throw handedOver();
    return await this.commit(draft, signal);
  }

  protected override release() {
    this.staging?.abort();
    void this.draft?.then(
      (draft) => this.requests.release(draft.draftId),
      () => {},
    );
  }

  /** Staging outlives an attempt: the editor taking over needs the draft. */
  private stage(): Promise<AssetDraftSource> {
    if (this.draft) return this.draft;
    const controller = new AbortController();
    this.staging = controller;
    this.report({ phase: 'staging', progress: 0 });
    this.draft = this.requests.stage(
      this.picked.file,
      this.extension,
      this.options.constraints,
      {
        signal: controller.signal,
        onProgress: (progress) => this.report({ phase: 'staging', progress }),
      },
    ).catch((reason: unknown) => {
      this.draft = null;
      throw reason;
    });
    return this.draft;
  }

  private async commit(
    draft: AssetDraftSource,
    signal: AbortSignal,
    restaged = false,
  ): Promise<AssetVariantInfo> {
    this.report({ phase: 'processing' });
    try {
      return await this.requests.commit(
        draft.draftId,
        pastedMediaRequest(draft),
        this.options.constraints,
        { signal, onStatus: (status) => this.report(status) },
      );
    } catch (reason) {
      // The server forgot the draft — a restart, a long pause: staged again,
      // once. A draft lost a second time is a server that cannot keep one
      // now, and sending the whole file round again would not change that:
      // the failure waits for a retry instead.
      if (isDraftExpired(reason) && !signal.aborted && !restaged) {
        this.draft = null;
        return await this.commit(await this.stage(), signal, true);
      }
      throw reason;
    }
  }
}

function handedOver() {
  return new DOMException('The upload was handed over', 'AbortError');
}

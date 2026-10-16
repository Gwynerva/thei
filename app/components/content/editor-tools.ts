import type {
  API,
  BlockTool,
  BlockToolConstructorOptions,
  BlockAPI,
} from '@editorjs/editorjs';
import { h } from 'vue';
import type { IconName } from '#thei/icons';
import { VueBlockTool } from './editor-vue-block-tool';
import { contentFileRequest } from '#layers/thei/shared/asset-paste-defaults';
import { contentAssetFromVariant } from '#layers/thei/app/composables/asset-wizard';
import type { UploadConstraints } from '#layers/thei/app/composables/upload-draft';
import {
  createPendingUploadList,
  PendingMediaUpload,
  type PendingMediaHandover,
} from '#layers/thei/app/composables/pending-upload';
import {
  insertPlacedFiles,
  placeContentFilesOf,
} from '#layers/thei/app/composables/content-files';
import type {
  ContentAssetData,
  ContentFileBlockType,
  ContentFileGroupItem,
  ContentGalleryItem,
  ContentMediaLayout,
  ContentPrivateSectionBoundaryData,
  ContentPrivateSectionEdge,
} from '#layers/thei/shared/content';
import { normalizeContentCaption } from '#layers/thei/shared/content';
import {
  contentFileBlockTakes,
  type PlacedContentFiles,
} from '#layers/thei/shared/content-file-placement';
import ContentMediaCard from '#layers/thei/app/components/content/ContentMediaCard.vue';
import ContentGallery from '#layers/thei/app/components/content/ContentGallery.vue';
import ContentAssetSkeleton from '#layers/thei/app/components/content/ContentAssetSkeleton.vue';
import ContentAttachmentCard from '#layers/thei/app/components/content/ContentAttachmentCard.vue';
import ContentAudioCard from '#layers/thei/app/components/content/ContentAudioCard.vue';
import ContentFileGroup from '#layers/thei/app/components/content/ContentFileGroup.vue';
import {
  CONTENT_CAPTION_SANITIZE,
  contentFileSanitize,
} from '#layers/thei/app/components/content/content-caption-config';
import { gallerySelectedIdAfterRemoval } from '#layers/thei/app/components/content/gallery-state';
import {
  fileGroupItems,
  landFileGroupEntry,
  orderFileGroupEntries,
  type ContentFileGroupEntry,
} from '#layers/thei/app/components/content/file-group-state';
import { contentAssetSelectionChanged } from '#layers/thei/app/components/content/content-attachment';
import ExternalLinkBlockCard from '#layers/thei/app/components/external-links/ExternalLinkBlockCard.vue';
import type { ExternalLinkStore } from '#layers/thei/app/composables/external-links';
import ContentIntegration from '#layers/thei/app/components/content/ContentIntegration.vue';
import {
  contentIntegrationPastePatterns,
  matchContentIntegration,
  normalizeContentIntegration,
  type ContentIntegrationData,
} from '#layers/thei/shared/content-integrations';
import { normalizeExternalLinkUrl } from '#layers/thei/shared/external-link';
import { editorIcon } from './editor-icons';
import type { ContentEntitySearchItem } from '#layers/thei/shared/admin/content-entity-search';
import {
  contentEntityReference,
  linkFragment,
  type ContentEntityType,
  type ContentLinkResolver,
} from '#layers/thei/shared/content-link';
import ContentEntityLinkBlock from './ContentEntityLinkBlock.vue';
import type { ContentLinkPick, ContentLinkTarget } from './link-picker/types';
import ContentLinkPreviewCard from './ContentLinkPreviewCard.vue';
export {
  ContentBoldTool,
  ContentHintTool,
  ContentLinkTool,
  ContentItalicTool,
  ContentStrikeTool,
} from './editor-inline-tools';

/** What a block's file may be: a picture or a video, a recording, any file. */
export type ContentEditorAssetKind = 'media' | 'audio' | 'any';
/**
 * Files picked for a text: those known at once — picked from the library, or
 * duplicates settled in the editor — and new ones, which the block they land
 * in stores. `media` picks pictures and videos alone, as a gallery takes.
 */
export interface ContentEditorPickedFiles {
  assets: ContentAssetData[];
  files: File[];
}
export type ContentEditorPickFiles = (
  kind: 'media' | 'any',
) => Promise<ContentEditorPickedFiles>;
export type ContentEditorEditAsset = (
  asset: ContentAssetData,
  kind: ContentEditorAssetKind,
) => Promise<ContentAssetData | null | undefined>;

interface ContentToolLabels {
  chooseMedia: string;
  addMedia: string;
  removeMedia: string;
  chooseFile: string;
  chooseAudio: string;
  showAsFile: string;
  showAsPlayer: string;
  showAsPicture: string;
  makeFileGroup: string;
  groupTitle: string;
  addFiles: string;
  removeFile: string;
  moveFile: string;
  uploadAsFile: string;
  caption: string;
  mediaCentered: string;
  mediaNatural: string;
  mediaStretch: string;
  title: string;
  fileWithExtension: (extension?: string) => string;
  privateSection: string;
  privateSectionStart: string;
  privateSectionEnd: string;
  externalLinkError: string;
  refreshExternalLink: string;
  linkNote: string;
  chooseEntity: string;
  changeLink: string;
  makeGallery: string;
  retryUpload: string;
  cancelUpload: string;
  dismissUpload: string;
}

/** How a tool stores the new files that come into it. */
export interface ContentEditorUploads {
  /** The limits of the place the files go to. */
  constraints: UploadConstraints;
  /**
   * The asset editor for a file still being stored: what the admin settled
   * on, or nothing if the editor was dismissed.
   */
  editPending: (
    pending: PendingMediaHandover,
  ) => Promise<ContentAssetData | undefined>;
  /** Counts blocks with uploads under way, so closing the editor asks first. */
  track?: (delta: 1 | -1) => void;
}

/** Every block that shows files: a picture, a gallery, a recording, a file, a group. */
interface ContentFileToolConfig {
  pickFiles: ContentEditorPickFiles;
  editAsset: ContentEditorEditAsset;
  uploads: ContentEditorUploads;
  labels: ContentToolLabels;
}

/** Opens the link picker beside a block; where it leads, or nothing. */
export type ContentEditorPickLink = (
  anchor: HTMLElement,
  initial?: ContentLinkTarget,
) => Promise<ContentLinkPick | undefined>;

interface EntityLinkToolConfig {
  pickLink: ContentEditorPickLink;
  /** The entity an address of this site opens, if it opens one. */
  findEntityByUrl: (
    url: string,
  ) => Promise<ContentEntitySearchItem | undefined>;
  resolver: ContentLinkResolver;
  labels: ContentToolLabels;
  beginTransientSelection?: () => void;
  endTransientSelection?: (persisted: boolean) => void;
}

interface PrivateSectionBoundaryToolConfig {
  labels: ContentToolLabels;
}

interface ExternalLinkToolConfig {
  labels: ContentToolLabels;
  pickLink: ContentEditorPickLink;
  /** The page's records of external links, shared with every other card on it. */
  links: ExternalLinkStore;
}

type ContentToolOptions<
  TData extends object,
  TConfig extends object,
> = BlockToolConstructorOptions<TData, TConfig>;

export class ExternalLinkTool extends VueBlockTool implements BlockTool {
  static pasteConfig = {
    patterns: { externalLink: /^https?:\/\/[^\s]+$/i },
  };

  private url = '';
  private note = '';
  private loading = false;
  private error = false;
  private version = 0;

  constructor(
    private options: ContentToolOptions<
      { url?: string; note?: string },
      ExternalLinkToolConfig
    >,
  ) {
    super(options.block);
    this.url = options.data.url ?? '';
    this.note = options.data.note ?? '';
  }

  private get config() {
    return contentToolConfig(this.options.config);
  }

  protected override afterRender() {
    // Opening an editor is not a reason to go out to the network: the record
    // of a link the content came with is already in the store, and one the
    // site has never seen is looked up once and kept. Only a link just pasted,
    // or one the person asks to refresh, is read from the site.
    if (this.url && !this.options.readOnly && !this.config.links.get(this.url))
      void this.request(() => this.config.links.lookup(this.url));
  }

  save() {
    return { url: this.url, note: this.note.trim() || undefined };
  }

  validate(data: { url?: string }) {
    try {
      return Boolean(normalizeExternalLinkUrl(data.url));
    } catch {
      return false;
    }
  }

  protected override onDestroy() {
    this.version += 1;
  }

  async onPaste(event: CustomEvent) {
    this.url = normalizeExternalLinkUrl(event.detail?.data);
    this.dispatchChange();
    void this.refresh();
  }

  renderSettings() {
    return [
      {
        icon: editorIcon('link'),
        title: this.config.labels.changeLink,
        closeOnActivate: true,
        onActivate: () => void this.change(),
      },
      {
        icon: editorIcon('refresh'),
        title: this.config.labels.refreshExternalLink,
        closeOnActivate: true,
        onActivate: () => void this.refresh(),
      },
    ];
  }

  /**
   * Points the card elsewhere with the link picker: another address, an
   * entity of the site, a video — each the block it takes.
   */
  private async change() {
    if (!this.element) return;
    const pick = await this.config.pickLink(this.element, {
      kind: 'external',
      url: this.url,
    });
    if (!pick || this.destroyed) return;
    if (pick.kind === 'external') {
      if (pick.url === this.url) return;
      this.url = pick.url;
      this.dispatchChange();
      void this.refresh();
      return;
    }
    await replaceWithPick(
      this.options.api,
      this.options.block,
      pick,
      this.note,
    );
  }

  /**
   * A deliberate re-read of the site. Presentation only: the stored block is
   * the address and the owner's note, and what the site says lives apart.
   */
  private refresh() {
    return this.request(() => this.config.links.refresh(this.url));
  }

  private async request(send: () => Promise<unknown>) {
    const version = ++this.version;
    this.loading = true;
    this.error = false;
    this.renderContent();
    try {
      await send();
    } catch {
      if (version === this.version) this.error = true;
    } finally {
      if (version === this.version) {
        this.loading = false;
        this.renderContent();
      }
    }
  }

  protected view() {
    return h(ExternalLinkBlockCard, {
      url: this.url,
      note: this.note,
      editable: !this.options.readOnly,
      notePlaceholder: this.config.labels.linkNote,
      loading: this.loading,
      errorText: this.error ? this.config.labels.externalLinkError : undefined,
      'onUpdate:note': (value: string) => {
        if (value === this.note) return;
        this.note = value;
        this.commit();
      },
    });
  }
}

/**
 * A pasted address with an interactive form, such as a YouTube video.
 *
 * Never offered in the toolbox: it only appears when a paste matches one of
 * the providers' patterns, and must be registered before `externalLink` so it
 * gets the first chance at the address.
 */
export class IntegrationTool extends VueBlockTool implements BlockTool {
  static pasteConfig = {
    patterns: contentIntegrationPastePatterns(),
  };

  static get isReadOnlySupported() {
    return true;
  }

  private data?: ContentIntegrationData;

  constructor(options: ContentToolOptions<Record<string, unknown>, object>) {
    super(options.block);
    try {
      this.data = normalizeContentIntegration(options.data);
    } catch {
      this.data = undefined;
    }
  }

  save() {
    return this.data ?? {};
  }

  validate(data: Record<string, unknown>) {
    try {
      normalizeContentIntegration(data);
      return true;
    } catch {
      return false;
    }
  }

  onPaste(event: CustomEvent) {
    const data = matchContentIntegration(event.detail?.data);
    if (!data) return;
    this.data = data;
    this.commit();
  }

  protected view() {
    return h(ContentIntegration, { data: this.data, showSource: true });
  }
}

export class EntityLinkTool extends VueBlockTool implements BlockTool {
  static toolbox = {
    title: 'Link',
    icon: editorIcon('link'),
    data: { autoOpen: true },
  };

  private entityType?: ContentEntityType;
  private entityId?: string;
  /** Where inside the entity the link leads, if anywhere. */
  private fragment?: string;
  private note = '';
  private autoOpen = false;
  private transientSelection = false;
  /** An address of this site that was pasted and is being looked up. */
  private pastedUrl?: string;

  constructor(
    private options: ContentToolOptions<
      {
        entityType?: ContentEntityType;
        entityId?: string;
        fragment?: string;
        note?: string;
        autoOpen?: boolean;
      },
      EntityLinkToolConfig
    >,
  ) {
    super(options.block);
    this.entityType = options.data.entityType;
    this.entityId = options.data.entityId;
    this.fragment = options.data.fragment;
    this.note = options.data.note ?? '';
    this.autoOpen = options.data.autoOpen === true;
    this.transientSelection =
      this.autoOpen && !this.entityType && !this.entityId && !options.readOnly;
    if (this.transientSelection)
      contentToolConfig(options.config).beginTransientSelection?.();
  }

  protected override afterRender() {
    if (this.autoOpen && !this.options.readOnly) {
      this.autoOpen = false;
      queueMicrotask(() => void this.pick());
    }
  }

  save() {
    return {
      entityType: this.entityType,
      entityId: this.entityId,
      fragment: this.fragment,
      note: this.note.trim() || undefined,
    };
  }

  validate(data: { entityType?: string; entityId?: string }) {
    return Boolean(contentEntityReference(data.entityType, data.entityId));
  }

  protected override onDestroy() {
    this.pastedUrl = undefined;
  }

  /**
   * An address of this very site, pasted into an empty paragraph.
   *
   * It is stored as a link to the entity it opens rather than as an address,
   * so it keeps working when the site moves to another domain. The paste
   * pattern only knows the address has the shape of an entity page; if the
   * site has nothing there, the block becomes the external link it would have
   * been anyway. A `#…` of the address is kept: the link leads to that place
   * inside the entity.
   */
  async onPaste(event: CustomEvent) {
    const url = String(event.detail?.data ?? '').trim();
    this.pastedUrl = url;
    this.renderContent();
    const config = contentToolConfig(this.options.config);
    const entity = await config.findEntityByUrl(url).catch(() => undefined);
    if (this.pastedUrl !== url) return;
    this.pastedUrl = undefined;
    if (!entity) {
      await replaceBlock(
        this.options.api,
        this.options.block,
        'externalLink',
        { url },
        false,
      );
      return;
    }
    this.entityType = entity.entityType;
    this.entityId = entity.entityId;
    this.fragment = linkFragment(url);
    this.commit();
  }

  renderSettings() {
    if (!this.entityType || !this.entityId) return [];
    return [
      {
        icon: editorIcon('link'),
        title: contentToolConfig(this.options.config).labels.changeLink,
        closeOnActivate: true,
        onActivate: () => void this.pick(),
      },
    ];
  }

  /**
   * The link picker, on where the block leads now. An entity, or a place in
   * it, is this block's; another site's address becomes a card of its own,
   * and an address a block of its own takes — a video — that block.
   */
  private async pick() {
    if (!this.element) return;
    const pick = await contentToolConfig(this.options.config).pickLink(
      this.element,
      this.entityType && this.entityId
        ? {
            kind: 'entity',
            entityType: this.entityType,
            entityId: this.entityId,
            ...(this.fragment ? { fragment: this.fragment } : {}),
          }
        : undefined,
    );
    if (!pick || this.destroyed) {
      // Keep the skeleton available in this editor session. Validation and
      // content normalization omit it from persisted data until it is chosen.
      this.finishTransientSelection(false);
      return;
    }
    if (pick.kind !== 'entity') {
      await replaceWithPick(
        this.options.api,
        this.options.block,
        pick,
        this.note,
      );
      // Kept once the block it became is there.
      this.finishTransientSelection(true);
      return;
    }
    const changed =
      this.entityType !== pick.entity.entityType ||
      this.entityId !== pick.entity.entityId ||
      this.fragment !== pick.fragment;
    this.entityType = pick.entity.entityType;
    this.entityId = pick.entity.entityId;
    this.fragment = pick.fragment;
    this.renderContent();
    this.finishTransientSelection(true);
    if (changed) this.dispatchChange();
  }

  private finishTransientSelection(persisted: boolean) {
    if (!this.transientSelection) return;
    this.transientSelection = false;
    contentToolConfig(this.options.config).endTransientSelection?.(persisted);
  }

  protected view() {
    const config = contentToolConfig(this.options.config);
    if (this.entityType && this.entityId)
      return h(ContentEntityLinkBlock, {
        entityType: this.entityType,
        entityId: this.entityId,
        fragment: this.fragment,
        resolver: config.resolver,
        interactive: true,
        playback: 'interaction',
        note: this.note,
        editable: !this.options.readOnly,
        notePlaceholder: config.labels.linkNote,
        'onUpdate:note': (value: string) => {
          if (value === this.note) return;
          this.note = value;
          this.commit();
        },
        onRemoveFragment: () => {
          this.fragment = undefined;
          this.commit();
        },
      });
    if (this.pastedUrl)
      return h(ContentLinkPreviewCard, {
        label: this.pastedUrl,
        loading: true,
        interactive: false,
      });
    return h(ContentAssetSkeleton, {
      icon: 'link',
      label: config.labels.chooseEntity,
      readOnly: this.options.readOnly,
      onPick: () => void this.pick(),
    });
  }
}

/**
 * The link block, claiming pasted addresses of this very site.
 *
 * Editor.js gives a paste to the first tool whose pattern matches, and reads
 * the patterns from the class — so the site's own origins, which are only
 * known at runtime, go in through a subclass made for the editor instance.
 * Register it before `externalLink`, which claims every address.
 */
export function entityLinkToolWithPaste(pattern: RegExp) {
  return class PastingEntityLinkTool extends EntityLinkTool {
    static pasteConfig = { patterns: { entityLink: pattern } };
  };
}

/**
 * Every file pasted into a text goes up through these two slots, whatever
 * block it lands in — a picture, a gallery, a recording: the server keeps
 * only a few staged files at once, one may be the editor's own, and one
 * staged too early could be dropped before its turn to be stored. A slot let
 * go of passes straight to the next in line, so none is ever taken twice.
 */
const PASTE_UPLOAD_SLOTS = 2;
let pasteUploadsRunning = 0;
const pasteUploadQueue: (() => void)[] = [];

async function withPasteUploadSlot(job: () => Promise<void>) {
  if (pasteUploadsRunning < PASTE_UPLOAD_SLOTS) pasteUploadsRunning += 1;
  else await new Promise<void>((resolve) => pasteUploadQueue.push(resolve));
  try {
    await job();
  } finally {
    const next = pasteUploadQueue.shift();
    if (next) next();
    else pasteUploadsRunning -= 1;
  }
}

type ContentFileBlockData = {
  asset?: ContentAssetData;
  autoOpen?: boolean;
};

/**
 * Where picked files go from a block: the first block they make takes this
 * one's place — this very block, given its file, when it is of that kind and
 * `take` takes it — and the others follow it, each storing its own new files.
 */
async function placeFiles(
  api: API,
  block: BlockAPI,
  placed: readonly PlacedContentFiles[],
  take: (data: Record<string, unknown>) => boolean,
) {
  const [first, ...rest] = placed;
  if (!first) return;
  const anchor =
    first.type === block.name && take(first.data)
      ? block
      : await replaceBlock(api, block, first.type, first.data, true);
  if (!anchor) return;
  const index = api.blocks.getBlockIndex(anchor.id);
  rest.forEach((next, offset) =>
    insertPlacedFiles(api.blocks, next, index + 1 + offset, false, false),
  );
}

/**
 * A block that holds one file: a picture or a video, a recording, a file to
 * download. Until a new file has landed the block is its skeleton, following
 * the upload, and the asset editor may take the draft over; the block's data
 * changes only once the file is in the library. An empty one picks files of
 * any kind, which the one rule places — in this block, when it is theirs.
 */
abstract class ContentFileBlockTool<
  TData extends ContentFileBlockData,
> extends VueBlockTool {
  protected asset: ContentAssetData | null;
  private autoOpen: boolean;
  /** The new file on its way into the library, and the file itself. */
  private pending?: PendingMediaUpload;
  private pendingFile?: File;

  protected constructor(
    protected readonly options: ContentToolOptions<
      TData,
      ContentFileToolConfig
    >,
    /** The block this tool makes, which decides how a new file is stored. */
    private readonly type: ContentFileBlockType,
    /** The files its file may be replaced with. */
    private readonly kind: ContentEditorAssetKind,
  ) {
    super(options.block);
    this.asset = options.data.asset ?? null;
    this.autoOpen = options.data.autoOpen === true;
  }

  /** What the block says of its file, which goes when the file does. */
  protected abstract clearWords(): void;

  protected override afterRender() {
    if (this.options.readOnly || !this.autoOpen) return;
    this.autoOpen = false;
    queueMicrotask(() => void this.pick());
  }

  protected override onDestroy() {
    this.dropPending();
  }

  /** The new file is let go of, its upload stopped. */
  private dropPending() {
    if (!this.pending) return;
    this.pending.dispose();
    this.pending = undefined;
    this.pendingFile = undefined;
    this.config.uploads.track?.(-1);
  }

  protected get config() {
    return contentToolConfig(this.options.config);
  }

  protected get labels() {
    return getLabels(this.config);
  }

  /**
   * New files for the block, handed to it once it is on the page: it stores
   * the first, at its own defaults (`contentFileRequest`), through the slots
   * every new file shares.
   */
  adoptFiles(files: File[]) {
    const [file] = files;
    if (!file || this.options.readOnly || this.destroyed || this.pending)
      return;
    const { uploads } = this.config;
    const pending = new PendingMediaUpload(file, {
      constraints: uploads.constraints,
      request: (draft) => contentFileRequest(this.type, draft),
    });
    this.pending = pending;
    this.pendingFile = file;
    uploads.track?.(1);
    this.renderContent();
    this.runPending(pending);
    void pending.result.then((asset) => {
      if (this.pending === pending && !this.destroyed && asset) {
        this.finishPending(contentAssetFromVariant(asset));
      }
    });
  }

  /** The block before it holds a file: a place to pick one, or an upload. */
  protected skeleton(icon: IconName, editLabel: string) {
    return h(ContentAssetSkeleton, {
      icon,
      label: this.labels.chooseFile,
      readOnly: this.options.readOnly,
      upload: this.pending,
      editLabel: this.pending ? editLabel : undefined,
      retryLabel: this.labels.retryUpload,
      fallbackLabel:
        this.type === 'contentMedia' ? this.labels.uploadAsFile : undefined,
      onPick: () => void this.pick(),
      onEdit: () => void this.editPending(),
      onRetry: () => this.pending?.retry(),
      onFallback: () => void this.uploadAsFile(),
    });
  }

  /**
   * A picture or a video that would not go in — its encode over the limit
   * a picture keeps to, say — stored as it came, in a file block in this
   * one's place, rather than tried again and again.
   */
  private async uploadAsFile() {
    const file = this.pendingFile;
    if (!file) return;
    this.dropPending();
    await replaceBlock(
      this.options.api,
      this.options.block,
      'contentAttachment',
      { files: [file] },
      true,
    );
  }

  /** Stores the new file at the defaults, once a slot is free. */
  private runPending(pending: PendingMediaUpload) {
    void withPasteUploadSlot(async () => {
      // Gone, or landed through the editor, while it waited for its turn.
      if (this.pending !== pending || this.destroyed) return;
      await pending.run();
    });
  }

  /** The file has landed: the block shows it, and that is a change. */
  private finishPending(asset: ContentAssetData) {
    const pending = this.pending;
    if (!pending) return;
    this.pending = undefined;
    this.pendingFile = undefined;
    pending.dispose();
    this.config.uploads.track?.(-1);
    this.asset = asset;
    this.commit();
  }

  /** The asset editor, on the file still being stored. */
  private async editPending() {
    const pending = this.pending;
    if (!pending) return;
    let handover: PendingMediaHandover;
    try {
      handover = await pending.suspend();
    } catch {
      // Staging failed; the skeleton shows why and offers a retry.
      return;
    }
    if (this.pending !== pending || this.destroyed) return;
    const asset = await this.config.uploads
      .editPending(handover)
      .catch(() => undefined);
    if (this.pending !== pending || this.destroyed) return;
    if (asset) this.finishPending(asset);
    else this.runPending(pending);
  }

  private async pick() {
    const picked = await this.config.pickFiles('any');
    if (this.destroyed) return;
    await placeFiles(
      this.options.api,
      this.options.block,
      placeContentFilesOf(picked.assets, picked.files),
      (data) => this.take(data),
    );
  }

  /** Files of this block's own kind, placed in it. */
  private take(data: Record<string, unknown>) {
    const files = data.files as File[] | undefined;
    if (files?.length) {
      this.adoptFiles(files);
      return true;
    }
    const asset = data.asset as ContentAssetData | undefined;
    if (!asset) return false;
    this.asset = asset;
    this.commit();
    return true;
  }

  protected async edit() {
    if (!this.asset) return;
    const asset = await this.config.editAsset(this.asset, this.kind);
    if (asset === undefined || this.destroyed) return;
    const changed = contentAssetSelectionChanged(this.asset, asset);
    this.asset = asset;
    if (asset === null) this.clearWords();
    this.renderContent();
    if (changed) this.dispatchChange();
  }

  /** The block's file shown another way, its words going along. */
  protected showAs(
    type: ContentFileBlockType,
    words: { title?: string; caption?: string },
  ) {
    if (!this.asset) return;
    void replaceBlock(
      this.options.api,
      this.options.block,
      type,
      fileShownAs(type, this.asset, words),
      true,
    );
  }

  /** A setting that shows the file another way. */
  protected showAsSetting(
    icon: IconName,
    title: string,
    type: ContentFileBlockType,
    words: { title?: string; caption?: string },
  ) {
    return {
      icon: editorIcon(icon),
      title,
      closeOnActivate: true,
      onActivate: () => this.showAs(type, words),
    };
  }
}

/**
 * A file as a block of the given kind holds it, with the words that kind has
 * a place for: every kind has the caption, a file and a recording — alone or
 * in a group — also the title. A picture's title has nowhere to go.
 */
function fileShownAs(
  type: ContentFileBlockType,
  asset: ContentAssetData,
  words: { title?: string; caption?: string },
): Record<string, unknown> {
  const title = words.title?.trim() || undefined;
  const caption = normalizeContentCaption(words.caption) || undefined;
  switch (type) {
    case 'contentMedia':
      return { asset, layout: 'centered', caption };
    case 'contentGallery':
      return { items: [{ id: crypto.randomUUID(), asset, caption }] };
    case 'contentFileGroup':
      return { items: [{ id: crypto.randomUUID(), asset, title, caption }] };
    case 'contentAudio':
    case 'contentAttachment':
      return { asset, title, caption };
  }
}

type ContentMediaData = ContentFileBlockData & {
  caption?: string;
  layout?: ContentMediaLayout;
};

export class ContentMediaTool
  extends ContentFileBlockTool<ContentMediaData>
  implements BlockTool
{
  static sanitize = contentFileSanitize({
    asset: true,
    caption: CONTENT_CAPTION_SANITIZE,
  });

  private caption = '';
  private layout: ContentMediaLayout;

  constructor(
    options: ContentToolOptions<ContentMediaData, ContentFileToolConfig>,
  ) {
    super(options, 'contentMedia', 'media');
    this.caption = normalizeContentCaption(options.data.caption);
    const layout = options.data.layout;
    const isEditorServiceInstance =
      layout === undefined && !options.data.asset && !options.data.caption;
    if (
      !isEditorServiceInstance &&
      layout !== 'centered' &&
      layout !== 'natural' &&
      layout !== 'stretch'
    ) {
      throw new Error('Content media layout is required.');
    }
    // Editor.js probes every tool once with empty data while configuring paste
    // handling. This instance never represents stored content. Real media data
    // without an explicit layout still fails above and in shared normalization.
    this.layout = isEditorServiceInstance ? 'centered' : layout!;
  }

  protected clearWords() {
    this.caption = '';
  }

  save(): Record<string, unknown> {
    return {
      asset: this.asset,
      layout: this.layout,
      caption: normalizeContentCaption(this.caption) || undefined,
    };
  }

  validate(data: {
    asset?: ContentAssetData | null;
    layout?: ContentMediaLayout;
  }): boolean {
    return Boolean(
      data.asset?.assetUuid &&
      (data.layout === 'centered' ||
        data.layout === 'natural' ||
        data.layout === 'stretch'),
    );
  }

  renderSettings() {
    return [
      {
        icon: editorIcon('media-as-is'),
        title: this.labels.mediaNatural,
        toggle: 'content-media-layout',
        isActive: () => this.layout === 'natural',
        onActivate: () => this.setLayout('natural'),
      },
      {
        icon: editorIcon('media-centered'),
        title: this.labels.mediaCentered,
        toggle: 'content-media-layout',
        isActive: () => this.layout === 'centered',
        onActivate: () => this.setLayout('centered'),
      },
      {
        icon: editorIcon('media-stretch'),
        title: this.labels.mediaStretch,
        toggle: 'content-media-layout',
        isActive: () => this.layout === 'stretch',
        onActivate: () => this.setLayout('stretch'),
      },
      // A picture that turned out to have company: the gallery starts with
      // it. One kept to download rather than look at is a file.
      ...(this.asset
        ? [
            this.showAsSetting(
              'gallery',
              this.labels.makeGallery,
              'contentGallery',
              { caption: this.caption },
            ),
            this.showAsSetting(
              'file',
              this.labels.showAsFile,
              'contentAttachment',
              {
                caption: this.caption,
              },
            ),
          ]
        : []),
    ];
  }

  protected view() {
    if (!this.asset) return this.skeleton('media', this.labels.chooseMedia);
    return h(ContentMediaCard, {
      asset: this.asset,
      layout: this.layout,
      caption: this.caption,
      editable: !this.options.readOnly,
      editLabel: this.labels.chooseMedia,
      captionPlaceholder: this.labels.caption,
      onEdit: () => void this.edit(),
      onCaption: (value: string) => {
        if (value === this.caption) return;
        this.caption = value;
        this.commit();
      },
    });
  }

  private setLayout(layout: ContentMediaLayout) {
    if (layout === this.layout) return;
    this.layout = layout;
    this.commit();
  }
}

export class ContentGalleryTool extends VueBlockTool implements BlockTool {
  static sanitize = { items: true };

  private items: ContentGalleryItem[];
  private selectedId?: string;
  /**
   * Files on their way into the library, shown as tiles of their own until
   * each lands. Never saved: a gallery with nothing landed yet is empty. The
   * block re-renders when the set of tiles changes, and dispatches a change
   * only when a file lands; while any is under way, closing the editor asks.
   */
  private readonly uploads = createPendingUploadList({
    onLanded: (asset) => this.append([contentAssetFromVariant(asset)]),
    onChange: (uploads) => {
      const track = contentToolConfig(this.options.config).uploads.track;
      if (uploads.length && !this.tracking) track?.(1);
      else if (!uploads.length && this.tracking) track?.(-1);
      this.tracking = uploads.length > 0;
      if (!this.destroyed) this.renderContent();
    },
  });
  private tracking = false;

  constructor(
    private options: ContentToolOptions<
      { items?: ContentGalleryItem[] },
      ContentFileToolConfig
    >,
  ) {
    super(options.block);
    this.items = options.data.items ?? [];
    this.selectedId = this.items[0]?.id;
  }

  protected override onDestroy() {
    this.uploads.dispose();
  }

  /**
   * New pictures and videos, stored at the defaults through the slots every
   * new file shares, a tile each until it lands.
   */
  adoptFiles(files: File[]) {
    if (!files.length || this.options.readOnly) return;
    if (this.destroyed) return;
    const { constraints } = contentToolConfig(this.options.config).uploads;
    const uploads = files.map(
      (file) =>
        new PendingMediaUpload(file, {
          constraints,
          request: (draft) => contentFileRequest('contentGallery', draft),
        }),
    );
    this.uploads.follow(uploads);
    for (const upload of uploads) void withPasteUploadSlot(() => upload.run());
  }

  save(): Record<string, unknown> {
    return { items: this.items };
  }

  validate(data: { items?: ContentGalleryItem[] }): boolean {
    return Boolean(data.items?.length);
  }

  protected view() {
    return h(ContentGallery, {
      items: this.items,
      editable: !this.options.readOnly,
      selectedId: this.selectedId,
      chooseLabel: this.labels.chooseMedia,
      addLabel: this.labels.addMedia,
      removeLabel: this.labels.removeMedia,
      captionPlaceholder: this.labels.caption,
      pending: this.uploads.uploads,
      cancelUploadLabel: this.labels.cancelUpload,
      retryUploadLabel: this.labels.retryUpload,
      dismissUploadLabel: this.labels.dismissUpload,
      'onUpdate:selectedId': (id: string | undefined) => {
        this.selectedId = id;
      },
      onCancelPending: (id: string) => {
        const upload = this.uploads.uploads.find((other) => other.id === id);
        if (upload) this.uploads.forget(upload);
      },
      onRetryPending: (id: string) =>
        this.uploads.uploads.find((other) => other.id === id)?.retry(),
      onAdd: () => void this.add(),
      onEdit: (id: string) => void this.edit(id),
      onRemove: (id: string) => this.remove(id),
      onReorder: (items: ContentGalleryItem[]) => {
        this.items = items;
        this.commit();
      },
      onCaption: (id: string, value: string) => {
        const normalized = normalizeContentCaption(value) || undefined;
        const current = this.items.find((item) => item.id === id);
        if (!current || current.caption === normalized) return;
        this.items = this.items.map((item) =>
          item.id === id ? { ...item, caption: normalized } : item,
        );
        this.commit();
      },
    });
  }

  private async add() {
    const picked = await contentToolConfig(this.options.config).pickFiles(
      'media',
    );
    if (this.destroyed) return;
    this.append(picked.assets);
    this.adoptFiles(picked.files);
  }

  private append(assets: ContentAssetData[]) {
    if (!assets.length) {
      this.renderContent();
      return;
    }
    const added = assets.map((asset) => ({
      id: crypto.randomUUID(),
      asset,
    }));
    const wasEmpty = this.items.length === 0;
    this.items = [...this.items, ...added];
    if (wasEmpty) this.selectedId = added[0]?.id;
    this.commit();
  }

  private async edit(id: string) {
    if (this.options.readOnly) return;
    const current = this.items.find((item) => item.id === id);
    if (!current) return;
    const config = contentToolConfig(this.options.config);
    const result = await config.editAsset(current.asset, 'media');
    if (result === undefined || this.destroyed) return;
    if (result === null) {
      this.remove(id);
      return;
    }
    const changed = contentAssetSelectionChanged(current.asset, result);
    this.items = this.items.map((item) =>
      item.id === id ? { ...item, asset: result } : item,
    );
    this.renderContent();
    if (changed) this.dispatchChange();
  }

  private remove(id: string) {
    if (!this.items.some((item) => item.id === id)) return;
    const next = this.items.filter((item) => item.id !== id);
    this.selectedId = gallerySelectedIdAfterRemoval(
      this.items,
      id,
      this.selectedId,
    );
    this.items = next;
    this.commit();
  }

  private get labels() {
    return getLabels(contentToolConfig(this.options.config));
  }
}

type ContentFileData = ContentFileBlockData & {
  title?: string;
  caption?: string;
};

export class ContentAudioTool
  extends ContentFileBlockTool<ContentFileData>
  implements BlockTool
{
  // The title is plain words, kept as typed: only the caption takes marks.
  static sanitize = contentFileSanitize({
    asset: true,
    title: true,
    caption: CONTENT_CAPTION_SANITIZE,
  });

  private title = '';
  private caption = '';

  constructor(
    options: ContentToolOptions<ContentFileData, ContentFileToolConfig>,
  ) {
    super(options, 'contentAudio', 'audio');
    this.title = options.data.title ?? '';
    this.caption = normalizeContentCaption(options.data.caption);
  }

  protected clearWords() {
    this.title = '';
    this.caption = '';
  }

  save(): Record<string, unknown> {
    return {
      asset: this.asset,
      title: this.title.trim() || undefined,
      caption: normalizeContentCaption(this.caption) || undefined,
    };
  }

  validate(data: { asset?: ContentAssetData | null }): boolean {
    return Boolean(data.asset?.assetUuid);
  }

  renderSettings() {
    if (!this.asset) return [];
    const words = { title: this.title, caption: this.caption };
    return [
      this.showAsSetting(
        'file',
        this.labels.showAsFile,
        'contentAttachment',
        words,
      ),
      this.showAsSetting(
        'files',
        this.labels.makeFileGroup,
        'contentFileGroup',
        words,
      ),
    ];
  }

  protected view() {
    if (!this.asset) return this.skeleton('audio', this.labels.chooseAudio);
    return h(ContentAudioCard, {
      asset: this.asset,
      title: this.title,
      caption: this.caption,
      editable: !this.options.readOnly,
      editLabel: this.labels.chooseAudio,
      titlePlaceholder: this.labels.title,
      captionPlaceholder: this.labels.caption,
      onEdit: () => void this.edit(),
      onTitle: (value: string) => {
        if (value === this.title) return;
        this.title = value;
        this.commit();
      },
      onCaption: (value: string) => {
        if (value === this.caption) return;
        this.caption = value;
        this.commit();
      },
    });
  }
}

/**
 * The file block, and the one the "+" offers for every file: picked empty,
 * it places what it is given by the one rule — a picture becomes a picture,
 * a recording a player, several files a gallery and a group — and keeps a
 * file to download itself.
 */
export class ContentAttachmentTool
  extends ContentFileBlockTool<ContentFileData>
  implements BlockTool
{
  static toolbox = {
    title: 'File',
    icon: editorIcon('file'),
    data: { autoOpen: true },
  };

  // The title is plain words, kept as typed: only the caption takes marks.
  static sanitize = contentFileSanitize({
    asset: true,
    title: true,
    caption: CONTENT_CAPTION_SANITIZE,
  });

  private title = '';
  private caption = '';

  constructor(
    options: ContentToolOptions<ContentFileData, ContentFileToolConfig>,
  ) {
    super(options, 'contentAttachment', 'any');
    this.title = options.data.title ?? '';
    this.caption = normalizeContentCaption(options.data.caption);
  }

  protected clearWords() {
    this.title = '';
    this.caption = '';
  }

  save(): Record<string, unknown> {
    return {
      asset: this.asset,
      title: this.title.trim() || undefined,
      caption: normalizeContentCaption(this.caption) || undefined,
    };
  }

  validate(data: { asset?: ContentAssetData | null }): boolean {
    return Boolean(data.asset?.assetUuid);
  }

  renderSettings() {
    if (!this.asset) return [];
    const words = { title: this.title, caption: this.caption };
    return [
      ...(contentFileBlockTakes('contentAudio', this.asset)
        ? [
            this.showAsSetting(
              'audio',
              this.labels.showAsPlayer,
              'contentAudio',
              words,
            ),
          ]
        : []),
      ...(contentFileBlockTakes('contentMedia', this.asset)
        ? [
            this.showAsSetting(
              'media',
              this.labels.showAsPicture,
              'contentMedia',
              words,
            ),
          ]
        : []),
      this.showAsSetting(
        'files',
        this.labels.makeFileGroup,
        'contentFileGroup',
        words,
      ),
    ];
  }

  protected view() {
    if (!this.asset) return this.skeleton('file', this.labels.chooseFile);
    return h(ContentAttachmentCard, {
      asset: this.asset,
      title: this.title,
      caption: this.caption,
      fallbackTitle: this.labels.fileWithExtension(this.asset.extension),
      editable: !this.options.readOnly,
      editLabel: this.labels.chooseFile,
      titlePlaceholder: this.labels.title,
      captionPlaceholder: this.labels.caption,
      onEdit: () => void this.edit(),
      onTitle: (value: string) => {
        if (value === this.title) return;
        this.title = value;
        this.commit();
      },
      onCaption: (value: string) => {
        if (value === this.caption) return;
        this.caption = value;
        this.commit();
      },
    });
  }
}

/**
 * Files listed together under one title: what several files that are not
 * pictures become, and what a single file may be turned into. Each file is
 * shown as it would be alone, and has its own title and caption; a grip
 * moves it. Files added here stay here, whatever their kind.
 *
 * A file on its way holds the place it was added at and lands there; it is
 * never saved, and only its landing is a change.
 */
export class ContentFileGroupTool extends VueBlockTool implements BlockTool {
  // The titles are plain words; the captions were made canonical as typed.
  static sanitize = { title: true, items: true };

  private title: string;
  private entries: ContentFileGroupEntry[];
  private tracking = false;

  constructor(
    private options: ContentToolOptions<
      { title?: string; items?: ContentFileGroupItem[] },
      ContentFileToolConfig
    >,
  ) {
    super(options.block);
    this.title = options.data.title ?? '';
    this.entries = (options.data.items ?? []).map((item) => ({
      id: item.id,
      item,
    }));
  }

  protected override onDestroy() {
    for (const entry of this.entries) entry.upload?.dispose();
    this.entries = this.entries.filter((entry) => entry.item);
    this.track();
  }

  /** New files for the group: each stored at its own defaults, in its place. */
  adoptFiles(files: File[]) {
    if (!files.length || this.options.readOnly || this.destroyed) return;
    const { constraints } = this.config.uploads;
    const added = files.map((file) => {
      const upload = new PendingMediaUpload(file, {
        constraints,
        request: (draft) => contentFileRequest('contentFileGroup', draft),
      });
      return { id: upload.id, upload };
    });
    this.entries = [...this.entries, ...added];
    this.track();
    this.renderContent();
    for (const { id, upload } of added) {
      void withPasteUploadSlot(async () => {
        if (!this.holds(id)) return;
        await upload.run();
      });
      void upload.result.then((asset) => {
        if (!this.holds(id) || this.destroyed) return;
        upload.dispose();
        if (!asset) {
          this.drop(id);
          return;
        }
        this.entries = landFileGroupEntry(this.entries, id, {
          id: crypto.randomUUID(),
          asset: contentAssetFromVariant(asset),
        });
        this.track();
        this.commit();
      });
    }
  }

  save(): Record<string, unknown> {
    return {
      title: this.title.trim() || undefined,
      items: fileGroupItems(this.entries),
    };
  }

  validate(data: { items?: ContentFileGroupItem[] }): boolean {
    return Boolean(data.items?.length);
  }

  protected view() {
    const labels = this.labels;
    return h(ContentFileGroup, {
      title: this.title,
      entries: this.entries,
      editable: !this.options.readOnly,
      titlePlaceholder: labels.groupTitle,
      fileTitlePlaceholder: labels.title,
      captionPlaceholder: labels.caption,
      editLabel: labels.chooseFile,
      addLabel: labels.addFiles,
      removeLabel: labels.removeFile,
      moveLabel: labels.moveFile,
      fallbackTitle: labels.fileWithExtension,
      onTitle: (value: string) => {
        if (value === this.title) return;
        this.title = value;
        this.commit();
      },
      onItemTitle: (id: string, value: string) =>
        this.change(id, (item) =>
          value === (item.title ?? '') ? item : { ...item, title: value },
        ),
      onItemCaption: (id: string, value: string) =>
        this.change(id, (item) => {
          const caption = normalizeContentCaption(value) || undefined;
          return caption === item.caption ? item : { ...item, caption };
        }),
      onEdit: (id: string) => void this.edit(id),
      onRemove: (id: string) => this.remove(id),
      onReorder: (ids: string[]) => this.reorder(ids),
      onAdd: () => void this.add(),
      onCancelPending: (id: string) => {
        this.entries.find((entry) => entry.id === id)?.upload?.dispose();
        this.drop(id);
      },
      onRetryPending: (id: string) =>
        this.entries.find((entry) => entry.id === id)?.upload?.retry(),
    });
  }

  private get config() {
    return contentToolConfig(this.options.config);
  }

  private get labels() {
    return getLabels(this.config);
  }

  private holds(id: string) {
    return this.entries.some((entry) => entry.id === id);
  }

  /** Counts the group among the blocks with uploads under way, or not. */
  private track() {
    const uploading = this.entries.some((entry) => entry.upload);
    if (uploading === this.tracking) return;
    this.tracking = uploading;
    this.config.uploads.track?.(uploading ? 1 : -1);
  }

  /** A file on its way goes: nothing saved changes. */
  private drop(id: string) {
    this.entries = this.entries.filter((entry) => entry.id !== id);
    this.track();
    this.renderContent();
  }

  private change(
    id: string,
    next: (item: ContentFileGroupItem) => ContentFileGroupItem,
  ) {
    const entry = this.entries.find((other) => other.id === id);
    if (!entry?.item) return;
    const item = next(entry.item);
    if (item === entry.item) return;
    this.entries = this.entries.map((other) =>
      other.id === id ? { id, item } : other,
    );
    this.commit();
  }

  private async add() {
    const picked = await this.config.pickFiles('any');
    if (this.destroyed) return;
    if (picked.assets.length) {
      this.entries = [
        ...this.entries,
        ...picked.assets.map((asset) => {
          const id = crypto.randomUUID();
          return { id, item: { id, asset } };
        }),
      ];
      this.commit();
    }
    this.adoptFiles(picked.files);
  }

  private async edit(id: string) {
    if (this.options.readOnly) return;
    const current = this.entries.find((entry) => entry.id === id)?.item;
    if (!current) return;
    const result = await this.config.editAsset(current.asset, 'any');
    if (result === undefined || this.destroyed) return;
    if (result === null) {
      this.remove(id);
      return;
    }
    const changed = contentAssetSelectionChanged(current.asset, result);
    this.entries = this.entries.map((entry) =>
      entry.id === id ? { id, item: { ...current, asset: result } } : entry,
    );
    this.renderContent();
    if (changed) this.dispatchChange();
  }

  private remove(id: string) {
    if (!this.entries.some((entry) => entry.id === id && entry.item)) return;
    this.entries = this.entries.filter((entry) => entry.id !== id);
    this.commit();
  }

  /** Files moved by their grips; only a move among the files is a change. */
  private reorder(ids: string[]) {
    const before = fileGroupItems(this.entries).map((item) => item.id);
    this.entries = orderFileGroupEntries(this.entries, ids);
    const after = fileGroupItems(this.entries).map((item) => item.id);
    if (after.every((id, index) => id === before[index])) this.renderContent();
    else this.commit();
  }
}

export class PrivateSectionBoundaryTool implements BlockTool {
  static toolbox = {
    title: 'Private section',
    icon: editorIcon('lock-close'),
    data: {
      edge: 'start',
      createPair: true,
    },
  };

  static get isReadOnlySupported() {
    return true;
  }

  private sectionId: string;
  private edge: ContentPrivateSectionEdge;
  private createPair: boolean;

  constructor(
    private options: ContentToolOptions<
      Partial<ContentPrivateSectionBoundaryData> & { createPair?: boolean },
      PrivateSectionBoundaryToolConfig
    >,
  ) {
    this.sectionId =
      typeof options.data.sectionId === 'string' && options.data.sectionId
        ? options.data.sectionId
        : `private-section-${crypto.randomUUID()}`;
    this.edge = options.data.edge === 'end' ? 'end' : 'start';
    this.createPair = options.data.createPair === true;
  }

  render() {
    const element = document.createElement('div');
    element.className = 'content-private-bracket';
    element.dataset.mutationFree = 'true';
    element.dataset.privateSectionId = this.sectionId;
    element.dataset.privateSectionEdge = this.edge;
    element.dataset.privateSectionStartLabel = this.labels.privateSectionStart;
    element.dataset.privateSectionEndLabel = this.labels.privateSectionEnd;
    if (this.createPair) element.dataset.privateSectionCreatePair = 'true';

    const label = document.createElement('span');
    label.className = 'content-private-bracket__label';
    label.innerHTML = `${editorIcon('lock-close')}<span>${
      this.edge === 'start'
        ? this.labels.privateSectionStart
        : this.labels.privateSectionEnd
    }</span>`;
    element.append(label);
    return element;
  }

  save(): ContentPrivateSectionBoundaryData {
    return { sectionId: this.sectionId, edge: this.edge };
  }

  private get labels() {
    return getLabels(contentToolConfig(this.options.config));
  }
}

function getLabels(
  config: { labels?: ContentToolLabels } | undefined,
): ContentToolLabels {
  return (
    config?.labels ?? {
      chooseMedia: 'Choose image or video',
      addMedia: 'Add image or video',
      removeMedia: 'Remove image or video',
      chooseFile: 'Choose file',
      chooseAudio: 'Choose audio',
      showAsFile: 'Show as a file',
      showAsPlayer: 'Show as a player',
      showAsPicture: 'Show as a picture',
      makeFileGroup: 'Turn into a group',
      groupTitle: 'Group title',
      addFiles: 'Add files',
      removeFile: 'Remove from the group',
      moveFile: 'Move',
      uploadAsFile: 'Upload as a file',
      caption: 'Caption',
      mediaCentered: 'Centered',
      mediaNatural: 'As is',
      mediaStretch: 'Stretch',
      title: 'Title',
      fileWithExtension: (extension) =>
        extension ? `File with extension ${extension.toUpperCase()}` : 'File',
      privateSection: 'Private section',
      privateSectionStart: 'Start of private section',
      privateSectionEnd: 'End of private section',
      externalLinkError: 'Could not load link preview',
      refreshExternalLink: 'Refresh link',
      linkNote: 'A note for the link',
      chooseEntity: 'Choose what to link to',
      changeLink: 'Change link',
      makeGallery: 'Turn into a gallery',
      retryUpload: 'Try again',
      cancelUpload: 'Cancel',
      dismissUpload: 'Dismiss',
    }
  );
}

function contentToolConfig<T extends object>(config: T | undefined): T {
  if (!config) throw new Error('Content editor tool config is required.');
  return config;
}

/**
 * The block a pick takes in place of the block it was made from: an
 * entity's card, a video for an address one of the integrations claims, or
 * another site's card. The note written on the block goes along.
 */
async function replaceWithPick(
  api: API,
  block: BlockAPI,
  pick: ContentLinkPick,
  note: string,
) {
  const kept = note.trim() ? { note: note.trim() } : {};
  if (pick.kind === 'entity') {
    await replaceBlock(
      api,
      block,
      'entityLink',
      {
        entityType: pick.entity.entityType,
        entityId: pick.entity.entityId,
        ...(pick.fragment ? { fragment: pick.fragment } : {}),
        ...kept,
      },
      false,
    );
    return;
  }
  if (pick.kind === 'integration') {
    const data = matchContentIntegration(pick.url);
    if (data) {
      await replaceBlock(api, block, 'integration', data, false);
      return;
    }
  }
  await replaceBlock(
    api,
    block,
    'externalLink',
    { url: pick.url, ...kept },
    false,
  );
}

/**
 * Puts a block of another kind in the place of this one, under its id and
 * with its tunes: a picture shown as a file is the same block to the history
 * and the review, and a media block turned into a gallery is still a spoiler
 * if it was one. Editor.js's `insert` with `replace` leaves the tunes behind.
 *
 * New files in `data` are handed to the block once it is the one that stays:
 * the tunes are put on by building the block again from what it saves, and
 * a block saves no file it has yet to store.
 */
async function replaceBlock(
  api: API,
  block: BlockAPI,
  type: string,
  data: Record<string, unknown>,
  needToFocus: boolean,
): Promise<BlockAPI | undefined> {
  const { files, ...rest } = data as { files?: File[] };
  const saved = (await block.save()) as
    { tunes?: Record<string, unknown> } | undefined;
  // A tune that is off still has its key, and building the block again for
  // nothing would cost it what it holds.
  const tunes = Object.fromEntries(
    Object.entries(saved?.tunes ?? {}).filter(([, value]) => value != null),
  );
  const { id } = block;
  const index = api.blocks.getBlockIndex(id);
  let inserted: BlockAPI | undefined = api.blocks.insert(
    type,
    rest,
    undefined,
    index,
    needToFocus,
    true,
    id,
  );
  if (Object.keys(tunes).length) {
    await api.blocks.update(id, undefined, tunes);
    // `update` builds a fresh block and drops this one without a word to its
    // tool, whose view would stay mounted in a detached element.
    inserted.call('destroy');
    inserted = api.blocks.getById(id) ?? undefined;
  }
  if (files?.length) inserted?.call('adoptFiles', files);
  return inserted;
}

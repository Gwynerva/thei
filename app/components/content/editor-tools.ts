import type {
  API,
  BlockTool,
  BlockToolConstructorOptions,
  BlockAPI,
} from '@editorjs/editorjs';
import { h } from 'vue';
import { VueBlockTool } from './editor-vue-block-tool';
import { AssetType } from '#layers/thei/shared/asset';
import type {
  ContentAssetData,
  ContentGalleryItem,
  ContentMediaLayout,
  ContentPrivateSectionBoundaryData,
  ContentPrivateSectionEdge,
} from '#layers/thei/shared/content';
import { normalizeContentMediaCaption } from '#layers/thei/shared/content';
import ContentMediaCard from '#layers/thei/app/components/content/ContentMediaCard.vue';
import ContentGallery from '#layers/thei/app/components/content/ContentGallery.vue';
import ContentAssetSkeleton from '#layers/thei/app/components/content/ContentAssetSkeleton.vue';
import ContentAttachmentCard from '#layers/thei/app/components/content/ContentAttachmentCard.vue';
import { CONTENT_CAPTION_SANITIZE } from '#layers/thei/app/components/content/content-caption-config';
import { gallerySelectedIdAfterRemoval } from '#layers/thei/app/components/content/gallery-state';
import {
  contentAssetSelectionChanged,
  contentAttachmentAssetChanged,
} from '#layers/thei/app/components/content/content-attachment';
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
  type ContentEntityType,
  type ContentLinkResolver,
} from '#layers/thei/shared/content-link';
import ContentEntityLinkBlock from './ContentEntityLinkBlock.vue';
import ContentLinkPreviewCard from './ContentLinkPreviewCard.vue';
export {
  ContentBoldTool,
  ContentEntityLinkTool,
  ContentExternalInlineLinkTool,
  ContentHintTool,
  ContentItalicTool,
  ContentStrikeTool,
} from './editor-inline-tools';

export type ContentEditorAssetKind = 'media' | 'any';
export type ContentEditorPickAsset = (
  kind: ContentEditorAssetKind,
) => Promise<ContentAssetData | undefined>;
export type ContentEditorPickAssets = (
  kind: ContentEditorAssetKind,
) => Promise<ContentAssetData[]>;
export type ContentEditorEditAsset = (
  asset: ContentAssetData,
  kind: ContentEditorAssetKind,
) => Promise<ContentAssetData | null | undefined>;

interface ContentToolLabels {
  chooseMedia: string;
  addMedia: string;
  removeMedia: string;
  chooseFile: string;
  caption: string;
  mediaCentered: string;
  mediaNatural: string;
  mediaStretch: string;
  title: string;
  description: string;
  fileWithExtension: (extension?: string) => string;
  privateSection: string;
  privateSectionStart: string;
  privateSectionEnd: string;
  externalLinkError: string;
  refreshExternalLink: string;
  chooseEntity: string;
  makeGallery: string;
}

/** Stores pasted files as they are and returns them as content assets. */
export type ContentEditorUploadFiles = (
  files: File[],
) => Promise<ContentAssetData[]>;

interface ContentMediaToolConfig {
  pickAsset: ContentEditorPickAsset;
  editAsset: ContentEditorEditAsset;
  uploadFiles: ContentEditorUploadFiles;
  labels: ContentToolLabels;
}

interface ContentGalleryToolConfig {
  pickAssets: ContentEditorPickAssets;
  editAsset: ContentEditorEditAsset;
  uploadFiles: ContentEditorUploadFiles;
  labels: ContentToolLabels;
}

/** A file is picked or edited, never dropped in, so there is no upload here. */
interface ContentAttachmentToolConfig {
  pickAsset: ContentEditorPickAsset;
  editAsset: ContentEditorEditAsset;
  labels: ContentToolLabels;
}

interface EntityLinkToolConfig {
  pickEntity: (
    anchor: HTMLElement,
  ) => Promise<ContentEntitySearchItem | undefined>;
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
  private loading = false;
  private error = false;
  private version = 0;

  constructor(
    private options: ContentToolOptions<
      { url?: string },
      ExternalLinkToolConfig
    >,
  ) {
    super(options.block);
    this.url = options.data.url ?? '';
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
    return { url: this.url };
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
        icon: editorIcon('refresh'),
        title: this.config.labels.refreshExternalLink,
        closeOnActivate: true,
        onActivate: () => void this.refresh(),
      },
    ];
  }

  /** A deliberate re-read of the site. Presentation only: the stored block is just the address. */
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
      loading: this.loading,
      errorText: this.error ? this.config.labels.externalLinkError : undefined,
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
    title: 'Internal link',
    icon: editorIcon('link'),
    data: { autoOpen: true },
  };

  private entityType?: ContentEntityType;
  private entityId?: string;
  private autoOpen = false;
  private transientSelection = false;
  /** An address of this site that was pasted and is being looked up. */
  private pastedUrl?: string;

  constructor(
    private options: ContentToolOptions<
      { entityType?: ContentEntityType; entityId?: string; autoOpen?: boolean },
      EntityLinkToolConfig
    >,
  ) {
    super(options.block);
    this.entityType = options.data.entityType;
    this.entityId = options.data.entityId;
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
    return { entityType: this.entityType, entityId: this.entityId };
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
   * been anyway.
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
    this.commit();
  }

  private async pick() {
    if (!this.element) return;
    const selected = await contentToolConfig(this.options.config).pickEntity(
      this.element,
    );
    if (!selected || this.destroyed) {
      // Keep the skeleton available in this editor session. Validation and
      // content normalization omit it from persisted data until it is chosen.
      this.finishTransientSelection(false);
      return;
    }
    const changed =
      this.entityType !== selected.entityType ||
      this.entityId !== selected.entityId;
    this.entityType = selected.entityType;
    this.entityId = selected.entityId;
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
        resolver: config.resolver,
        interactive: true,
        playback: 'interaction',
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

export class ContentMediaTool extends VueBlockTool implements BlockTool {
  static toolbox = {
    title: 'Media',
    icon: editorIcon('media'),
    data: { layout: 'centered', autoOpen: true },
  };

  static sanitize = {
    caption: CONTENT_CAPTION_SANITIZE,
  };

  private asset: ContentAssetData | null;
  private caption = '';
  private layout: ContentMediaLayout;
  private autoOpen: boolean;
  /** A pasted file, stored before the block shows anything. Never saved. */
  private pendingFiles?: File[];

  constructor(
    private options: ContentToolOptions<
      {
        asset?: ContentAssetData;
        caption?: string;
        layout?: ContentMediaLayout;
        autoOpen?: boolean;
        files?: File[];
      },
      ContentMediaToolConfig
    >,
  ) {
    super(options.block);
    this.asset = options.data.asset ?? null;
    this.caption = normalizeContentMediaCaption(options.data.caption);
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
    this.autoOpen = options.data.autoOpen === true;
    if (options.data.files?.length) this.pendingFiles = options.data.files;
  }

  protected override afterRender() {
    if (this.pendingFiles && !this.options.readOnly) {
      queueMicrotask(() => void this.upload());
    } else if (this.autoOpen && !this.options.readOnly) {
      this.autoOpen = false;
      queueMicrotask(() => void this.pick());
    }
  }

  save(): Record<string, unknown> {
    return {
      asset: this.asset,
      layout: this.layout,
      caption: normalizeContentMediaCaption(this.caption) || undefined,
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
      // A picture that turned out to have company: the gallery starts with it.
      ...(this.asset
        ? [
            {
              icon: editorIcon('gallery'),
              title: this.labels.makeGallery,
              closeOnActivate: true,
              onActivate: () => this.convertToGallery(),
            },
          ]
        : []),
    ];
  }

  protected view() {
    if (!this.asset)
      return h(ContentAssetSkeleton, {
        icon: 'media',
        label: this.labels.chooseMedia,
        readOnly: this.options.readOnly,
        loading: Boolean(this.pendingFiles),
        onPick: () => void this.pick(),
      });
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
        this.dispatchChange();
      },
    });
  }

  private async upload() {
    const files = this.pendingFiles;
    if (!files) return;
    const config = contentToolConfig(this.options.config);
    const [asset] = await config.uploadFiles(files).catch(() => []);
    if (this.pendingFiles !== files || this.destroyed) return;
    this.pendingFiles = undefined;
    if (asset) this.asset = asset;
    this.renderContent();
    if (asset) this.dispatchChange();
  }

  /**
   * A block's type is fixed in Editor.js, so the gallery is a new block put
   * in this one's place, with this picture and its caption as the first tile.
   */
  private convertToGallery() {
    if (!this.asset) return;
    const caption = normalizeContentMediaCaption(this.caption) || undefined;
    void replaceBlock(
      this.options.api,
      this.options.block,
      'contentGallery',
      {
        items: [
          {
            id: crypto.randomUUID(),
            asset: this.asset,
            ...(caption ? { caption } : {}),
          },
        ],
      },
      true,
    );
  }

  private async pick() {
    const config = contentToolConfig(this.options.config);
    const asset = await config.pickAsset('media');
    if (!asset || this.destroyed) return;
    this.asset = asset;
    this.commit();
  }

  private setLayout(layout: ContentMediaLayout) {
    if (layout === this.layout) return;
    this.layout = layout;
    this.commit();
  }

  private async edit() {
    if (!this.asset) return;
    const config = contentToolConfig(this.options.config);
    const asset = await config.editAsset(this.asset, 'media');
    if (asset === undefined || this.destroyed) return;
    const changed = contentAssetSelectionChanged(this.asset, asset);
    this.asset = asset;
    if (asset === null) this.caption = '';
    this.renderContent();
    if (changed) this.dispatchChange();
  }

  private get labels() {
    return getLabels(contentToolConfig(this.options.config));
  }
}

export class ContentGalleryTool extends VueBlockTool implements BlockTool {
  static toolbox = {
    title: 'Gallery',
    icon: editorIcon('gallery'),
    data: { items: [], autoOpen: true },
  };

  static sanitize = { items: true };

  private items: ContentGalleryItem[];
  private selectedId?: string;
  private autoOpen: boolean;
  /** Pasted files, stored before the tiles appear. Never saved. */
  private pendingFiles?: File[];

  constructor(
    private options: ContentToolOptions<
      { items?: ContentGalleryItem[]; autoOpen?: boolean; files?: File[] },
      ContentGalleryToolConfig
    >,
  ) {
    super(options.block);
    this.items = options.data.items ?? [];
    this.selectedId = this.items[0]?.id;
    this.autoOpen = options.data.autoOpen === true;
    if (options.data.files?.length) this.pendingFiles = options.data.files;
  }

  protected override afterRender() {
    if (this.pendingFiles && !this.options.readOnly) {
      queueMicrotask(() => void this.upload());
    } else if (this.autoOpen && !this.options.readOnly) {
      this.autoOpen = false;
      queueMicrotask(() => void this.add());
    }
  }

  private async upload() {
    const files = this.pendingFiles;
    if (!files) return;
    const config = contentToolConfig(this.options.config);
    const assets = await config.uploadFiles(files).catch(() => []);
    if (this.pendingFiles !== files || this.destroyed) return;
    this.pendingFiles = undefined;
    this.append(assets);
  }

  save(): Record<string, unknown> {
    return { items: this.items };
  }

  validate(data: { items?: ContentGalleryItem[] }): boolean {
    return Boolean(data.items?.length);
  }

  protected view() {
    if (this.pendingFiles)
      return h(ContentAssetSkeleton, {
        icon: 'gallery',
        label: this.labels.addMedia,
        loading: true,
      });
    return h(ContentGallery, {
      items: this.items,
      editable: !this.options.readOnly,
      selectedId: this.selectedId,
      chooseLabel: this.labels.chooseMedia,
      addLabel: this.labels.addMedia,
      removeLabel: this.labels.removeMedia,
      captionPlaceholder: this.labels.caption,
      'onUpdate:selectedId': (id: string | undefined) => {
        this.selectedId = id;
      },
      onAdd: () => void this.add(),
      onEdit: (id: string) => void this.edit(id),
      onRemove: (id: string) => this.remove(id),
      onReorder: (items: ContentGalleryItem[]) => {
        this.items = items;
        this.dispatchChange();
      },
      onCaption: (id: string, value: string) => {
        const normalized = normalizeContentMediaCaption(value) || undefined;
        const current = this.items.find((item) => item.id === id);
        if (!current || current.caption === normalized) return;
        this.items = this.items.map((item) =>
          item.id === id ? { ...item, caption: normalized } : item,
        );
        this.dispatchChange();
      },
    });
  }

  private async add() {
    const config = contentToolConfig(this.options.config);
    const assets = await config.pickAssets('media');
    if (this.destroyed) return;
    this.append(assets);
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

export class ContentAttachmentTool extends VueBlockTool implements BlockTool {
  static toolbox = {
    title: 'File',
    icon: editorIcon('file'),
    data: { autoOpen: true },
  };

  private asset: ContentAssetData | null;
  private title = '';
  private caption = '';
  private autoOpen: boolean;

  constructor(
    private options: ContentToolOptions<
      {
        asset?: ContentAssetData;
        title?: string;
        caption?: string;
        autoOpen?: boolean;
      },
      ContentAttachmentToolConfig
    >,
  ) {
    super(options.block);
    this.asset = options.data.asset ?? null;
    this.title = options.data.title ?? '';
    this.caption = options.data.caption ?? '';
    this.autoOpen = options.data.autoOpen === true;
  }

  protected override afterRender() {
    if (this.autoOpen && !this.options.readOnly) {
      this.autoOpen = false;
      queueMicrotask(() => void this.pick());
    }
  }

  save(): Record<string, unknown> {
    return {
      asset: this.asset,
      title: this.title.trim() || undefined,
      caption: this.caption.trim() || undefined,
    };
  }

  validate(data: { asset?: ContentAssetData | null }): boolean {
    return Boolean(data.asset?.assetUuid);
  }

  protected view() {
    if (!this.asset)
      return h(ContentAssetSkeleton, {
        icon: 'file',
        label: this.labels.chooseFile,
        readOnly: this.options.readOnly,
        onPick: () => void this.pick(),
      });
    return h(ContentAttachmentCard, {
      asset: this.asset,
      title: this.title,
      description: this.caption,
      fallbackTitle: this.labels.fileWithExtension(this.asset.extension),
      editable: !this.options.readOnly,
      editLabel: this.labels.chooseFile,
      titlePlaceholder: this.labels.title,
      descriptionPlaceholder: this.labels.description,
      onEdit: () => void this.edit(),
      onTitle: (value: string) => {
        if (value === this.title) return;
        this.title = value;
        this.dispatchChange();
      },
      onDescription: (value: string) => {
        if (value === this.caption) return;
        this.caption = value;
        this.dispatchChange();
      },
    });
  }

  private async pick() {
    const config = contentToolConfig(this.options.config);
    const asset = await config.pickAsset('any');
    if (!asset || this.destroyed) return;
    this.asset = asset;
    this.commit();
  }

  private async edit() {
    if (!this.asset) return;
    const config = contentToolConfig(this.options.config);
    const asset = await config.editAsset(this.asset, 'any');
    if (asset === undefined || this.destroyed) return;
    if (asset === null) {
      this.asset = null;
      this.title = '';
      this.caption = '';
      this.commit();
      return;
    }
    const previousTitle = this.title;
    const changed = contentAttachmentAssetChanged(this.asset, asset);
    this.asset = asset;
    this.renderContent();
    if (changed || this.title !== previousTitle) this.dispatchChange();
  }

  private get labels() {
    return getLabels(contentToolConfig(this.options.config));
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
      caption: 'Caption',
      mediaCentered: 'Centered',
      mediaNatural: 'As is',
      mediaStretch: 'Stretch',
      title: 'Title',
      description: 'Description',
      fileWithExtension: (extension) =>
        extension ? `File with extension ${extension.toUpperCase()}` : 'File',
      privateSection: 'Private section',
      privateSectionStart: 'Start of private section',
      privateSectionEnd: 'End of private section',
      externalLinkError: 'Could not load link preview',
      refreshExternalLink: 'Refresh link',
      chooseEntity: 'Choose what to link to',
      makeGallery: 'Turn into a gallery',
    }
  );
}

function contentToolConfig<T extends object>(config: T | undefined): T {
  if (!config) throw new Error('Content editor tool config is required.');
  return config;
}

/**
 * Puts a block of another kind in the place of this one, keeping its tunes:
 * a media block turned into a gallery is still a spoiler if it was one.
 * Editor.js's `insert` with `replace` leaves the tunes behind.
 */
async function replaceBlock(
  api: API,
  block: BlockAPI,
  type: string,
  data: object,
  needToFocus: boolean,
) {
  const saved = (await block.save()) as
    { tunes?: Record<string, unknown> } | undefined;
  const tunes = saved?.tunes;
  const index = api.blocks.getBlockIndex(block.id);
  api.blocks.insert(type, data, undefined, index, needToFocus, true);
  if (!tunes || !Object.keys(tunes).length) return;
  const inserted = api.blocks.getBlockByIndex(index);
  if (!inserted) return;
  await api.blocks.update(inserted.id, undefined, tunes);
  // `update` builds a fresh block and drops this one without a word to its
  // tool, whose view would stay mounted in a detached element.
  inserted.call('destroy');
}

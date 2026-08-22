import type {
  BlockTool,
  BlockToolConstructorOptions,
  BlockTune,
  BlockAPI,
} from '@editorjs/editorjs';
import { h, render as renderVue } from 'vue';
import { AssetType } from '#layers/thei/shared/asset';
import type {
  ContentAssetData,
  ContentGalleryItem,
  ContentMediaLayout,
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
  contentAttachmentSuggestedTitle,
} from '#layers/thei/app/components/content/content-attachment';
import ExternalLinkPreviewCard from '#layers/thei/app/components/external-links/ExternalLinkPreviewCard.vue';
import {
  normalizeExternalLinkUrl,
  type ExternalLink,
} from '#layers/thei/shared/external-link';
import { editorIcon } from './editor-icons';
import type { ContentEntitySearchItem } from '#layers/thei/shared/admin/content-entity-search';
import type {
  ContentEntityType,
  ContentLinkResolver,
} from '#layers/thei/shared/content-link';
import ContentEntityLinkBlock from './ContentEntityLinkBlock.vue';
export {
  ContentBoldTool,
  ContentEntityLinkTool,
  ContentExternalInlineLinkTool,
  ContentItalicTool,
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
  privateAccess: string;
  externalLinkLoading: string;
  externalLinkError: string;
}

interface ContentMediaToolConfig {
  pickAsset: ContentEditorPickAsset;
  editAsset: ContentEditorEditAsset;
  labels: ContentToolLabels;
}

interface ContentGalleryToolConfig {
  pickAssets: ContentEditorPickAssets;
  editAsset: ContentEditorEditAsset;
  labels: ContentToolLabels;
}

interface EntityLinkToolConfig {
  pickEntity: (
    anchor: HTMLElement,
  ) => Promise<ContentEntitySearchItem | undefined>;
  resolver: ContentLinkResolver;
  beginTransientSelection?: () => void;
  endTransientSelection?: (persisted: boolean) => void;
}

type ContentToolOptions<
  TData extends object,
  TConfig extends object,
> = BlockToolConstructorOptions<TData, TConfig>;

export class ExternalLinkTool implements BlockTool {
  static pasteConfig = {
    patterns: { externalLink: /^https?:\/\/[^\s]+$/i },
  };

  private url = '';
  private preview?: ExternalLink;
  private wrapper?: HTMLElement;
  private loading = false;
  private error = false;
  private version = 0;
  private controller?: AbortController;

  constructor(
    private options: ContentToolOptions<
      Partial<ExternalLink>,
      { labels: ContentToolLabels }
    >,
  ) {
    this.url = options.data.url ?? '';
    if (options.data.faviconMedia && options.data.touchedAt) {
      this.preview = options.data as ExternalLink;
    }
  }

  render() {
    this.wrapper = createToolWrapper();
    this.renderContent();
    if (this.url && !this.preview && !this.options.readOnly)
      void this.refresh();
    return this.wrapper;
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

  destroy() {
    this.version += 1;
    this.controller?.abort();
    if (this.wrapper) renderVue(null, this.wrapper);
  }

  async onPaste(event: CustomEvent) {
    this.url = normalizeExternalLinkUrl(event.detail?.data);
    this.preview = undefined;
    this.options.block.dispatchChange();
    void this.refresh();
  }

  private async refresh() {
    const version = ++this.version;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.loading = true;
    this.error = false;
    this.renderContent();
    try {
      const preview = await $fetch<ExternalLink>(
        '/api/admin/external-link-previews',
        {
          method: 'POST',
          body: { url: this.url },
          signal: controller.signal,
        },
      );
      if (version !== this.version) return;
      this.preview = preview;
    } catch (cause: any) {
      if (version !== this.version) return;
      if (cause?.name === 'AbortError') return;
      this.error = true;
    } finally {
      if (version === this.version) {
        this.controller = undefined;
        this.loading = false;
        this.renderContent();
      }
    }
  }

  private renderContent() {
    if (!this.wrapper) return;
    renderVue(
      h(ExternalLinkPreviewCard, {
        link: this.preview,
        url: this.url,
        interactive: true,
        loading: this.loading,
        errorText: this.error
          ? contentToolConfig(this.options.config).labels.externalLinkError
          : undefined,
        loadingText: contentToolConfig(this.options.config).labels
          .externalLinkLoading,
      }),
      this.wrapper,
    );
  }
}

export class EntityLinkTool implements BlockTool {
  static toolbox = {
    title: 'Internal link',
    icon: editorIcon('link'),
    data: { autoOpen: true },
  };

  private entityType?: ContentEntityType;
  private entityId?: string;
  private autoOpen = false;
  private transientSelection = false;
  private wrapper?: HTMLElement;

  constructor(
    private options: ContentToolOptions<
      { entityType?: ContentEntityType; entityId?: string; autoOpen?: boolean },
      EntityLinkToolConfig
    >,
  ) {
    this.entityType = options.data.entityType;
    this.entityId = options.data.entityId;
    this.autoOpen = options.data.autoOpen === true;
    this.transientSelection =
      this.autoOpen && !this.entityType && !this.entityId && !options.readOnly;
    if (this.transientSelection)
      contentToolConfig(options.config).beginTransientSelection?.();
  }

  render() {
    this.wrapper = createToolWrapper();
    this.renderContent();
    if (this.autoOpen && !this.options.readOnly) {
      this.autoOpen = false;
      queueMicrotask(() => void this.pick());
    }
    return this.wrapper;
  }

  save() {
    return { entityType: this.entityType, entityId: this.entityId };
  }

  validate(data: { entityType?: string; entityId?: string }) {
    return Boolean(
      (data.entityType === 'project' || data.entityType === 'event') &&
      data.entityId?.trim(),
    );
  }

  destroy() {
    if (this.wrapper) renderVue(null, this.wrapper);
  }

  private async pick() {
    if (!this.wrapper) return;
    const selected = await contentToolConfig(this.options.config).pickEntity(
      this.wrapper,
    );
    if (!selected) {
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
    if (changed) this.options.block.dispatchChange();
  }

  private finishTransientSelection(persisted: boolean) {
    if (!this.transientSelection) return;
    this.transientSelection = false;
    contentToolConfig(this.options.config).endTransientSelection?.(persisted);
  }

  private renderContent() {
    if (!this.wrapper) return;
    const config = contentToolConfig(this.options.config);
    renderVue(
      this.entityType && this.entityId
        ? h(ContentEntityLinkBlock, {
            entityType: this.entityType,
            entityId: this.entityId,
            resolver: config.resolver,
            interactive: true,
          })
        : h(ContentAssetSkeleton, {
            icon: 'link',
            label: 'Choose a project or event',
            readOnly: this.options.readOnly,
            onPick: () => void this.pick(),
          }),
      this.wrapper,
    );
  }
}

export class ContentMediaTool implements BlockTool {
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
  private wrapper?: HTMLElement;

  constructor(
    private options: ContentToolOptions<
      {
        asset?: ContentAssetData;
        caption?: string;
        layout?: ContentMediaLayout;
        autoOpen?: boolean;
      },
      ContentMediaToolConfig
    >,
  ) {
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
  }

  render(): HTMLElement {
    this.wrapper = createToolWrapper();
    this.renderContent();
    if (this.autoOpen && !this.options.readOnly) {
      this.autoOpen = false;
      queueMicrotask(() => void this.pick());
    }
    return this.wrapper;
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
    ];
  }

  private renderContent() {
    if (!this.wrapper) return;
    const content = this.asset
      ? h(ContentMediaCard, {
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
            this.options.block.dispatchChange();
          },
        })
      : h(ContentAssetSkeleton, {
          icon: 'media',
          label: this.labels.chooseMedia,
          readOnly: this.options.readOnly,
          onPick: () => void this.pick(),
        });
    renderVue(content, this.wrapper);
  }

  destroy() {
    if (this.wrapper) renderVue(null, this.wrapper);
  }

  private async pick() {
    const config = contentToolConfig(this.options.config);
    const asset = await config.pickAsset('media');
    if (!asset) return;
    this.asset = asset;
    this.renderContent();
    this.options.block.dispatchChange();
  }

  private setLayout(layout: ContentMediaLayout) {
    if (layout === this.layout) return;
    this.layout = layout;
    this.renderContent();
    this.options.block.dispatchChange();
  }

  private async edit() {
    if (!this.asset) return;
    const config = contentToolConfig(this.options.config);
    const asset = await config.editAsset(this.asset, 'media');
    if (asset === undefined) return;
    const changed = contentAssetSelectionChanged(this.asset, asset);
    this.asset = asset;
    if (asset === null) this.caption = '';
    this.renderContent();
    if (changed) this.options.block.dispatchChange();
  }

  private get labels() {
    return getLabels(contentToolConfig(this.options.config));
  }
}

export class ContentGalleryTool implements BlockTool {
  static toolbox = {
    title: 'Gallery',
    icon: editorIcon('gallery'),
    data: { items: [], autoOpen: true },
  };

  static sanitize = { items: true };

  private items: ContentGalleryItem[];
  private selectedId?: string;
  private autoOpen: boolean;
  private wrapper?: HTMLElement;

  constructor(
    private options: ContentToolOptions<
      { items?: ContentGalleryItem[]; autoOpen?: boolean },
      ContentGalleryToolConfig
    >,
  ) {
    this.items = options.data.items ?? [];
    this.selectedId = this.items[0]?.id;
    this.autoOpen = options.data.autoOpen === true;
  }

  render(): HTMLElement {
    this.wrapper = createToolWrapper();
    this.renderContent();
    if (this.autoOpen && !this.options.readOnly) {
      this.autoOpen = false;
      queueMicrotask(() => void this.add());
    }
    return this.wrapper;
  }

  save(): Record<string, unknown> {
    return { items: this.items };
  }

  validate(data: { items?: ContentGalleryItem[] }): boolean {
    return Boolean(data.items?.length);
  }

  destroy() {
    if (this.wrapper) renderVue(null, this.wrapper);
  }

  private renderContent() {
    if (!this.wrapper) return;
    renderVue(
      h(ContentGallery, {
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
          this.options.block.dispatchChange();
        },
        onCaption: (id: string, value: string) => {
          const normalized = normalizeContentMediaCaption(value) || undefined;
          const current = this.items.find((item) => item.id === id);
          if (!current || current.caption === normalized) return;
          this.items = this.items.map((item) =>
            item.id === id ? { ...item, caption: normalized } : item,
          );
          this.options.block.dispatchChange();
        },
      }),
      this.wrapper,
    );
  }

  private async add() {
    const config = contentToolConfig(this.options.config);
    const assets = await config.pickAssets('media');
    if (!assets.length) return;
    const added = assets.map((asset) => ({
      id: crypto.randomUUID(),
      asset,
    }));
    const wasEmpty = this.items.length === 0;
    this.items = [...this.items, ...added];
    if (wasEmpty) this.selectedId = added[0]?.id;
    this.renderContent();
    this.options.block.dispatchChange();
  }

  private async edit(id: string) {
    if (this.options.readOnly) return;
    const current = this.items.find((item) => item.id === id);
    if (!current) return;
    const config = contentToolConfig(this.options.config);
    const result = await config.editAsset(current.asset, 'media');
    if (result === undefined) return;
    if (result === null) {
      this.remove(id);
      return;
    }
    const changed = contentAssetSelectionChanged(current.asset, result);
    this.items = this.items.map((item) =>
      item.id === id ? { ...item, asset: result } : item,
    );
    this.renderContent();
    if (changed) this.options.block.dispatchChange();
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
    this.renderContent();
    this.options.block.dispatchChange();
  }

  private get labels() {
    return getLabels(contentToolConfig(this.options.config));
  }
}

export class ContentAttachmentTool implements BlockTool {
  static toolbox = {
    title: 'File',
    icon: editorIcon('file'),
    data: { autoOpen: true },
  };

  private asset: ContentAssetData | null;
  private title = '';
  private caption = '';
  private autoOpen: boolean;
  private wrapper?: HTMLElement;

  constructor(
    private options: ContentToolOptions<
      {
        asset?: ContentAssetData;
        title?: string;
        caption?: string;
        autoOpen?: boolean;
      },
      ContentMediaToolConfig
    >,
  ) {
    this.asset = options.data.asset ?? null;
    this.title = options.data.title ?? '';
    this.caption = options.data.caption ?? '';
    this.autoOpen = options.data.autoOpen === true;
  }

  render(): HTMLElement {
    this.wrapper = createToolWrapper();
    this.renderContent();
    if (this.autoOpen && !this.options.readOnly) {
      this.autoOpen = false;
      queueMicrotask(() => void this.pick());
    }
    return this.wrapper;
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

  private renderContent() {
    if (!this.wrapper) return;
    const content = this.asset
      ? h(ContentAttachmentCard, {
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
            this.options.block.dispatchChange();
          },
          onDescription: (value: string) => {
            if (value === this.caption) return;
            this.caption = value;
            this.options.block.dispatchChange();
          },
        })
      : h(ContentAssetSkeleton, {
          icon: 'file',
          label: this.labels.chooseFile,
          readOnly: this.options.readOnly,
          onPick: () => void this.pick(),
        });
    renderVue(content, this.wrapper);
  }

  destroy() {
    if (this.wrapper) renderVue(null, this.wrapper);
  }

  private async pick() {
    const config = contentToolConfig(this.options.config);
    const asset = await config.pickAsset('any');
    if (!asset) return;
    this.asset = asset;
    if (!this.title) this.title = contentAttachmentSuggestedTitle(asset) ?? '';
    this.renderContent();
    this.options.block.dispatchChange();
  }

  private async edit() {
    if (!this.asset) return;
    const config = contentToolConfig(this.options.config);
    const asset = await config.editAsset(this.asset, 'any');
    if (asset === undefined) return;
    if (asset === null) {
      this.asset = null;
      this.title = '';
      this.caption = '';
      this.renderContent();
      this.options.block.dispatchChange();
      return;
    }
    const previousTitle = this.title;
    const changed = contentAttachmentAssetChanged(this.asset, asset);
    this.asset = asset;
    if (!this.title) this.title = contentAttachmentSuggestedTitle(asset) ?? '';
    this.renderContent();
    if (changed || this.title !== previousTitle)
      this.options.block.dispatchChange();
  }

  private get labels() {
    return getLabels(contentToolConfig(this.options.config));
  }
}

export class PrivateAccessTune implements BlockTune {
  static isTune = true;

  private isPrivate: boolean;
  private labels: ContentToolLabels;
  private block?: BlockAPI;
  private wrapper?: HTMLElement;

  constructor(options: {
    data?: { isPrivate?: boolean };
    config?: {
      labels?: ContentToolLabels;
    };
    block?: BlockAPI;
  }) {
    this.isPrivate = options.data?.isPrivate === true;
    this.labels = getLabels(options.config);
    this.block = options.block;
  }

  render() {
    return {
      icon: editorIcon('lock-close'),
      title: this.labels.privateAccess,
      toggle: true,
      isActive: () => this.isPrivate,
      onActivate: () => {
        this.isPrivate = !this.isPrivate;
        this.syncBlockState();
        this.block?.dispatchChange();
      },
    };
  }

  wrap(content: HTMLElement): HTMLElement {
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'content-editor-private-wrap';
    const marker = document.createElement('span');
    marker.className = 'content-editor-private-marker';
    marker.setAttribute('aria-hidden', 'true');
    content.append(marker);
    this.wrapper.append(content);
    this.syncBlockState();
    return this.wrapper;
  }

  save() {
    return this.isPrivate ? { isPrivate: true } : {};
  }

  private syncBlockState() {
    if (this.isPrivate) {
      this.wrapper?.setAttribute('data-content-private', 'true');
    } else {
      this.wrapper?.removeAttribute('data-content-private');
    }
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
      privateAccess: 'Private access',
      externalLinkLoading: 'Loading link details…',
      externalLinkError: 'Could not load link preview',
    }
  );
}

function contentToolConfig<T extends object>(config: T | undefined): T {
  if (!config) throw new Error('Content editor tool config is required.');
  return config;
}

function createToolWrapper() {
  const element = document.createElement('div');
  element.className = 'my-sm flex flex-col gap-xs';
  // The custom tools explicitly report every data change via dispatchChange().
  // Their Vue-rendered previews also update asynchronously while media loads;
  // exclude those presentation-only DOM mutations from Editor.js change tracking.
  element.dataset.mutationFree = 'true';
  return element;
}

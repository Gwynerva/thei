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
import {
  createDragSort,
  moveItemById,
} from '#layers/thei/app/composables/drag-sort';
import AssetTile from '#layers/thei/app/components/AssetTile.vue';
import ContentMediaEditorPreview from '#layers/thei/app/components/content/ContentMediaEditorPreview.vue';
import ExternalLinkPreviewCard from '#layers/thei/app/components/external-links/ExternalLinkPreviewCard.vue';
import {
  normalizeExternalLinkUrl,
  type ExternalLink,
} from '#layers/thei/shared/external-link';
import { editorIcon } from './editor-icons';
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
export type ContentEditorEditGalleryItem = (
  item: ContentGalleryItem,
) => Promise<ContentGalleryItem | null | undefined>;

interface ContentToolLabels {
  chooseMedia: string;
  addMedia: string;
  chooseFile: string;
  caption: string;
  mediaCentered: string;
  mediaNatural: string;
  mediaStretch: string;
  title: string;
  description: string;
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
  editGalleryItem: ContentEditorEditGalleryItem;
  labels: ContentToolLabels;
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

export class ContentMediaTool implements BlockTool {
  static toolbox = {
    title: 'Media',
    icon: editorIcon('media'),
    data: { layout: 'centered', autoOpen: true },
  };

  static sanitize = {
    caption: {
      b: true,
      strong: true,
      i: true,
      em: true,
      a: {
        href: true,
        target: true,
        rel: true,
        'data-content-link': true,
        'data-entity-type': true,
        'data-entity-id': true,
      },
    },
  };

  private asset: ContentAssetData | null;
  private caption = '';
  private layout: ContentMediaLayout;
  private autoOpen: boolean;
  private wrapper?: HTMLElement;
  private previewRoot?: HTMLElement;
  private captionEl?: HTMLElement;

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
      caption:
        normalizeContentMediaCaption(
          this.captionEl?.innerHTML ?? this.caption,
        ) || undefined,
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
    this.unmountPreview();
    this.wrapper.replaceChildren();
    const preview = document.createElement('div');
    this.previewRoot = preview;
    renderVue(
      h(ContentMediaEditorPreview, {
        asset: this.asset,
        layout: this.layout,
        label: this.labels.chooseMedia,
        readOnly: this.options.readOnly,
        onPick: () => void this.pick(),
        onEdit: () => void this.edit(),
      }),
      preview,
    );
    this.wrapper.append(preview);

    if (this.asset) {
      const caption = createInlineCaption(
        this.labels.caption,
        this.caption,
        this.options.readOnly,
        (value) => {
          if (value === this.caption) return;
          this.caption = value;
          this.options.block.dispatchChange();
        },
      );
      this.captionEl = caption;
      this.wrapper.append(caption);
    } else {
      this.captionEl = undefined;
    }
  }

  destroy() {
    this.unmountPreview();
  }

  private unmountPreview() {
    if (this.previewRoot) renderVue(null, this.previewRoot);
    this.previewRoot = undefined;
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
    this.asset = asset;
    if (asset === null) this.caption = '';
    this.renderContent();
    this.options.block.dispatchChange();
  }

  private remove() {
    this.asset = null;
    this.caption = '';
    this.renderContent();
    this.options.block.dispatchChange();
  }

  private get labels() {
    return getLabels(contentToolConfig(this.options.config));
  }
}

export class ContentGalleryTool implements BlockTool {
  static toolbox = {
    title: 'Gallery',
    icon: editorIcon('gallery'),
  };

  private items: ContentGalleryItem[];
  private caption = '';
  private wrapper?: HTMLElement;
  private unmountTiles: Array<() => void> = [];
  private dragSort?: ReturnType<typeof createDragSort>;

  constructor(
    private options: ContentToolOptions<
      { items?: ContentGalleryItem[] },
      ContentGalleryToolConfig
    >,
  ) {
    this.items = options.data.items ?? [];
  }

  render(): HTMLElement {
    this.wrapper = createToolWrapper();
    this.renderContent();
    return this.wrapper;
  }

  save(): Record<string, unknown> {
    return { items: this.items };
  }

  validate(data: { items?: ContentGalleryItem[] }): boolean {
    return Boolean(data.items?.length);
  }

  destroy() {
    this.dragSort?.destroy();
    this.clearTiles();
  }

  private renderContent() {
    if (!this.wrapper) return;
    this.dragSort?.destroy();
    this.dragSort = undefined;
    this.clearTiles();
    this.wrapper.replaceChildren();

    const grid = document.createElement('div');
    grid.className = 'flex flex-wrap items-start gap-sm';

    this.items.forEach((item) => {
      const tile = renderAssetTile(item.asset, {
        className: 'size-18 shrink-0 cursor-grab active:cursor-grabbing',
        ariaLabel: this.labels.chooseMedia,
        onPick: this.options.readOnly
          ? undefined
          : () =>
              this.dragSort
                ? this.dragSort.guardClick(() => void this.edit(item.id))
                : void this.edit(item.id),
      });
      tile.element.dataset.dragId = item.id;
      this.unmountTiles.push(tile.unmount);
      grid.append(tile.element);
    });

    if (!this.options.readOnly) {
      const addTile = renderAssetTile(null, {
        className: 'size-18 shrink-0 cursor-pointer',
        ariaLabel: this.labels.addMedia,
        onPick: () => this.add(),
      });
      this.unmountTiles.push(addTile.unmount);
      grid.append(addTile.element);
    }

    this.wrapper.append(grid);
    if (!this.options.readOnly) {
      this.dragSort = createDragSort(grid, {
        onDrop: ({ id, newIndex }) => {
          this.items = moveItemById(
            this.items,
            id,
            newIndex,
            (item) => item.id,
          );
          this.options.block.dispatchChange();
          this.renderContent();
        },
      });
    }
  }

  private clearTiles() {
    this.unmountTiles.forEach((unmount) => unmount());
    this.unmountTiles = [];
  }

  private async add() {
    const config = contentToolConfig(this.options.config);
    const assets = await config.pickAssets('media');
    if (!assets.length) return;
    this.items = [
      ...this.items,
      ...assets.map((asset) => ({
        id: crypto.randomUUID(),
        asset,
      })),
    ];
    this.renderContent();
    this.options.block.dispatchChange();
  }

  private async edit(id: string) {
    if (this.options.readOnly) return;
    const current = this.items.find((item) => item.id === id);
    if (!current) return;
    const config = contentToolConfig(this.options.config);
    const result = await config.editGalleryItem(current);
    if (result === undefined) return;
    this.items =
      result === null
        ? this.items.filter((item) => item.id !== id)
        : this.items.map((item) => (item.id === id ? result : item));
    this.renderContent();
    this.options.block.dispatchChange();
  }

  private remove(id: string) {
    this.items = this.items.filter((item) => item.id !== id);
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
  };

  private asset: ContentAssetData | null;
  private title = '';
  private caption = '';
  private wrapper?: HTMLElement;
  private unmountTiles: Array<() => void> = [];

  constructor(
    private options: ContentToolOptions<
      {
        asset?: ContentAssetData;
        title?: string;
        caption?: string;
      },
      ContentMediaToolConfig
    >,
  ) {
    this.asset = options.data.asset ?? null;
    this.title = options.data.title ?? '';
    this.caption = options.data.caption ?? '';
  }

  render(): HTMLElement {
    this.wrapper = createToolWrapper();
    this.renderContent();
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
    this.clearTiles();
    this.wrapper.replaceChildren();
    const tile = renderAssetTile(this.asset, {
      className: this.asset ? 'h-34 w-full' : 'size-18 self-start',
      ariaLabel: this.labels.chooseFile,
      onPick: this.options.readOnly
        ? undefined
        : () => (this.asset ? this.edit() : this.pick()),
      showExtension: true,
    });
    this.unmountTiles.push(tile.unmount);
    this.wrapper.append(tile.element);

    if (this.asset) {
      this.wrapper.append(
        createTextInput(
          this.labels.title,
          this.title,
          'attachment-title',
          (value) => {
            this.title = value;
            this.options.block.dispatchChange();
          },
        ),
        createTextInput(
          this.labels.description,
          this.caption,
          'attachment-caption',
          (value) => {
            this.caption = value;
            this.options.block.dispatchChange();
          },
        ),
      );
    }
  }

  destroy() {
    this.clearTiles();
  }

  private clearTiles() {
    this.unmountTiles.forEach((unmount) => unmount());
    this.unmountTiles = [];
  }

  private async pick() {
    const config = contentToolConfig(this.options.config);
    const asset = await config.pickAsset('any');
    if (!asset) return;
    this.asset = asset;
    if (!this.title) this.title = assetTitle(asset);
    this.renderContent();
    this.options.block.dispatchChange();
  }

  private async edit() {
    if (!this.asset) return;
    const config = contentToolConfig(this.options.config);
    const asset = await config.editAsset(this.asset, 'any');
    if (asset === undefined) return;
    this.asset = asset;
    if (asset === null) {
      this.title = '';
      this.caption = '';
    }
    this.renderContent();
    this.options.block.dispatchChange();
  }

  private remove() {
    this.asset = null;
    this.title = '';
    this.caption = '';
    this.renderContent();
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
      chooseFile: 'Choose file',
      caption: 'Caption',
      mediaCentered: 'Centered',
      mediaNatural: 'As is',
      mediaStretch: 'Stretch',
      title: 'Title',
      description: 'Description',
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

function renderAssetTile(
  asset: ContentAssetData | null,
  options: {
    className: string;
    ariaLabel: string;
    onPick?: () => void;
    showExtension?: boolean;
  },
) {
  const element = document.createElement('div');
  element.className = options.className;

  renderVue(
    h(AssetTile, {
      media: asset?.media,
      size: asset?.size,
      extension: asset?.extension,
      showExtension: options.showExtension,
      class: 'size-full',
      'aria-label': options.ariaLabel,
      onClick: options.onPick,
    }),
    element,
  );

  return {
    element,
    unmount: () => renderVue(null, element),
  };
}

function createTextInput(
  placeholder: string,
  value: string,
  _field: string,
  onInput: (value: string) => void,
) {
  const input = document.createElement('input');
  input.className =
    'w-full rounded-normal border border-border-1 bg-bg-1 px-sm py-xs text-sm outline-none transition hocus:border-border-3';
  input.placeholder = placeholder;
  input.value = value;
  input.addEventListener('input', () => onInput(input.value));
  return input;
}

function createInlineCaption(
  placeholder: string,
  value: string,
  readOnly: boolean,
  onInput: (value: string) => void,
) {
  const caption = document.createElement('div');
  caption.className =
    'mt-xs min-h-6 w-full text-sm text-text-2 outline-none empty:before:pointer-events-none empty:before:text-text-3 empty:before:content-[attr(data-placeholder)] focus:before:hidden';
  caption.contentEditable = readOnly ? 'false' : 'true';
  caption.spellcheck = true;
  caption.setAttribute('role', 'textbox');
  caption.setAttribute('aria-label', placeholder);
  caption.setAttribute('aria-multiline', 'false');
  caption.dataset.placeholder = placeholder;
  caption.innerHTML = value;

  const sync = () => onInput(normalizeContentMediaCaption(caption.innerHTML));
  caption.addEventListener('input', sync);
  caption.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
  });
  caption.addEventListener('beforeinput', (event) => {
    if (
      event.inputType !== 'insertParagraph' &&
      event.inputType !== 'insertLineBreak'
    ) {
      return;
    }
    event.preventDefault();
  });
  caption.addEventListener('paste', (event) => {
    event.preventDefault();
    const text = event.clipboardData
      ?.getData('text/plain')
      .replace(/[\r\n]+/g, ' ')
      .replace(/\s+/g, ' ');
    if (text) document.execCommand('insertText', false, text);
  });
  caption.addEventListener('blur', () => {
    const normalized = normalizeContentMediaCaption(caption.innerHTML);
    if (caption.innerHTML !== normalized) caption.innerHTML = normalized;
    onInput(normalized);
  });
  return caption;
}

function assetTitle(asset: ContentAssetData): string {
  return (
    asset.name?.replace(/\.[^.]+$/, '') ||
    asset.extension?.toUpperCase() ||
    asset.assetUuid
  );
}

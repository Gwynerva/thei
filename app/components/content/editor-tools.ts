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
} from '#layers/thei/shared/content';
import {
  createDragSort,
  moveItemById,
} from '#layers/thei/app/composables/drag-sort';
import AssetTile from '#layers/thei/app/components/AssetTile.vue';
import ExternalLinkPreviewCard from '#layers/thei/app/components/external-links/ExternalLinkPreviewCard.vue';
import {
  normalizeExternalLinkUrl,
  type ExternalLink,
} from '#layers/thei/shared/external-link';

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
  title: string;
  description: string;
  privateAccess: string;
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

const icons = {
  image:
    '<svg width="17" height="15" viewBox="0 0 17 15"><path d="M15 0H2C.9 0 0 .9 0 2v11c0 1.1.9 2 2 2h13c1.1 0 2-.9 2-2V2c0-1.1-.9-2-2-2ZM2 2h13v7.2l-2.8-2.8a1 1 0 0 0-1.4 0L8 9.2 6.2 7.4a1 1 0 0 0-1.4 0L2 10.2V2Zm0 11v-.8l3.5-3.5L10 13H2Zm13 0h-2.2L9.4 9.6l2.1-2.1L15 11v2Z"/></svg>',
  gallery:
    '<svg width="17" height="15" viewBox="0 0 17 15"><path d="M2 2h10v8H2V2Zm1 1v6h8V3H3Zm2 10h10V5h-1v7H5v1Zm2 2h10V7h-1v7H7v1Z"/></svg>',
  file: '<svg width="14" height="17" viewBox="0 0 14 17"><path d="M8 0H2C.9 0 0 .9 0 2v13c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V6L8 0Zm0 2.2L11.8 6H8V2.2ZM2 15V2h4v6h6v7H2Z"/></svg>',
  lock: '<svg width="15" height="17" viewBox="0 0 15 17"><path d="M12 7V5A4.5 4.5 0 0 0 3 5v2H1v10h13V7h-2ZM5 5a2.5 2.5 0 0 1 5 0v2H5V5Zm7 10H3V9h9v6Z"/></svg>',
};

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
      Record<string, never>
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
    await this.refresh();
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
      this.url = preview.url;
      this.preview = preview;
      this.options.block.dispatchChange();
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
        loading: this.loading,
        errorText: this.error ? 'Could not load link preview' : undefined,
        loadingText: 'Loading link details…',
      }),
      this.wrapper,
    );
  }
}

export class ContentMediaTool implements BlockTool {
  static toolbox = {
    title: 'Media',
    icon: icons.image,
  };

  private asset: ContentAssetData | null;
  private caption = '';
  private wrapper?: HTMLElement;
  private unmountTiles: Array<() => void> = [];

  constructor(
    private options: ContentToolOptions<
      {
        asset?: ContentAssetData;
        caption?: string;
      },
      ContentMediaToolConfig
    >,
  ) {
    this.asset = options.data.asset ?? null;
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
      className: this.asset
        ? 'aspect-video min-h-34 w-full'
        : 'size-18 self-start',
      ariaLabel: this.labels.chooseMedia,
      onPick: this.options.readOnly
        ? undefined
        : () => (this.asset ? this.edit() : this.pick()),
    });
    this.unmountTiles.push(tile.unmount);
    this.wrapper.append(tile.element);

    if (this.asset) {
      const caption = createTextInput(
        this.labels.caption,
        this.caption,
        (value) => {
          this.caption = value;
          this.options.block.dispatchChange();
        },
      );
      this.wrapper.append(caption);
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
    const asset = await this.options.config?.pickAsset('media');
    if (!asset) return;
    this.asset = asset;
    this.renderContent();
    this.options.block.dispatchChange();
  }

  private async edit() {
    if (!this.asset) return;
    const asset = await this.options.config?.editAsset(this.asset, 'media');
    if (asset === undefined) return;
    if (asset === null) {
      this.remove();
      return;
    }
    this.asset = asset;
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
    return getLabels(this.options.config);
  }
}

export class ContentGalleryTool implements BlockTool {
  static toolbox = {
    title: 'Gallery',
    icon: icons.gallery,
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
    const assets = await this.options.config?.pickAssets('media');
    if (!assets?.length) return;
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
    const result = await this.options.config?.editGalleryItem(current);
    if (result === undefined) return;
    if (result === null) {
      this.remove(id);
      return;
    }
    this.items = this.items.map((item) => (item.id === id ? result : item));
    this.renderContent();
    this.options.block.dispatchChange();
  }

  private remove(id: string) {
    this.items = this.items.filter((item) => item.id !== id);
    this.renderContent();
    this.options.block.dispatchChange();
  }

  private get labels() {
    return getLabels(this.options.config);
  }
}

export class ContentAttachmentTool implements BlockTool {
  static toolbox = {
    title: 'File',
    icon: icons.file,
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
        createTextInput(this.labels.title, this.title, (value) => {
          this.title = value;
          this.options.block.dispatchChange();
        }),
        createTextInput(this.labels.description, this.caption, (value) => {
          this.caption = value;
          this.options.block.dispatchChange();
        }),
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
    const asset = await this.options.config?.pickAsset('any');
    if (!asset) return;
    this.asset = asset;
    if (!this.title) this.title = assetTitle(asset);
    this.renderContent();
    this.options.block.dispatchChange();
  }

  private async edit() {
    if (!this.asset) return;
    const asset = await this.options.config?.editAsset(this.asset, 'any');
    if (asset === undefined) return;
    if (asset === null) {
      this.remove();
      return;
    }
    this.asset = asset;
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
    return getLabels(this.options.config);
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
    config?: { labels?: ContentToolLabels };
    block?: BlockAPI;
  }) {
    this.isPrivate = options.data?.isPrivate === true;
    this.labels = getLabels(options.config);
    this.block = options.block;
  }

  render() {
    return {
      icon: icons.lock,
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
      title: 'Title',
      description: 'Description',
      privateAccess: 'Private access',
    }
  );
}

function createToolWrapper() {
  const element = document.createElement('div');
  element.className = 'my-sm flex flex-col gap-xs';
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

function assetTitle(asset: ContentAssetData): string {
  return (
    asset.name?.replace(/\.[^.]+$/, '') ||
    asset.extension?.toUpperCase() ||
    asset.assetUuid
  );
}

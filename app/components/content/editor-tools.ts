import type {
  BlockTool,
  BlockToolConstructorOptions,
  BlockTune,
  MenuConfig,
  BlockAPI,
} from '@editorjs/editorjs';
import { AssetType } from '#layers/thei/shared/asset';
import type { ContentAssetData } from '#layers/thei/shared/content';

export type ContentEditorAssetKind = 'media' | 'any';
export type ContentEditorPickAsset = (
  kind: ContentEditorAssetKind,
) => Promise<ContentAssetData | undefined>;

interface ContentToolConfig {
  pickAsset: ContentEditorPickAsset;
  labels: {
    chooseMedia: string;
    addMedia: string;
    chooseFile: string;
    caption: string;
    galleryCaption: string;
    title: string;
    description: string;
    remove: string;
    privateAccess: string;
  };
}

type ContentToolOptions<TData extends object> = BlockToolConstructorOptions<
  TData,
  ContentToolConfig
>;

const icons = {
  image:
    '<svg width="17" height="15" viewBox="0 0 17 15"><path d="M15 0H2C.9 0 0 .9 0 2v11c0 1.1.9 2 2 2h13c1.1 0 2-.9 2-2V2c0-1.1-.9-2-2-2ZM2 2h13v7.2l-2.8-2.8a1 1 0 0 0-1.4 0L8 9.2 6.2 7.4a1 1 0 0 0-1.4 0L2 10.2V2Zm0 11v-.8l3.5-3.5L10 13H2Zm13 0h-2.2L9.4 9.6l2.1-2.1L15 11v2Z"/></svg>',
  gallery:
    '<svg width="17" height="15" viewBox="0 0 17 15"><path d="M2 2h10v8H2V2Zm1 1v6h8V3H3Zm2 10h10V5h-1v7H5v1Zm2 2h10V7h-1v7H7v1Z"/></svg>',
  file: '<svg width="14" height="17" viewBox="0 0 14 17"><path d="M8 0H2C.9 0 0 .9 0 2v13c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V6L8 0Zm0 2.2L11.8 6H8V2.2ZM2 15V2h4v6h6v7H2Z"/></svg>',
  lock: '<svg width="15" height="17" viewBox="0 0 15 17"><path d="M12 7V5A4.5 4.5 0 0 0 3 5v2H1v10h13V7h-2ZM5 5a2.5 2.5 0 0 1 5 0v2H5V5Zm7 10H3V9h9v6Z"/></svg>',
};

export class ContentImageTool implements BlockTool {
  static toolbox = {
    title: 'Image',
    icon: icons.image,
  };

  private asset: ContentAssetData | null;
  private caption = '';
  private wrapper?: HTMLElement;

  constructor(
    private options: ContentToolOptions<{
      asset?: ContentAssetData;
      caption?: string;
    }>,
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
    this.wrapper.replaceChildren();
    this.wrapper.append(
      renderAssetCard(this.asset, {
        emptyLabel: this.labels.chooseMedia,
        onPick: () => this.pick(),
        onRemove: this.asset ? () => this.remove() : undefined,
        removeLabel: this.labels.remove,
        readOnly: this.options.readOnly,
      }),
    );

    if (this.asset) {
      const caption = createTextInput(
        this.labels.caption,
        this.caption,
        (value) => {
          this.caption = value;
        },
      );
      this.wrapper.append(caption);
    }
  }

  private async pick() {
    const asset = await this.options.config?.pickAsset('media');
    if (!asset) return;
    this.asset = asset;
    this.renderContent();
  }

  private remove() {
    this.asset = null;
    this.caption = '';
    this.renderContent();
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

  private assets: ContentAssetData[];
  private caption = '';
  private wrapper?: HTMLElement;

  constructor(
    private options: ContentToolOptions<{
      assets?: ContentAssetData[];
      caption?: string;
    }>,
  ) {
    this.assets = options.data.assets ?? [];
    this.caption = options.data.caption ?? '';
  }

  render(): HTMLElement {
    this.wrapper = createToolWrapper();
    this.renderContent();
    return this.wrapper;
  }

  save(): Record<string, unknown> {
    return {
      assets: this.assets,
      caption: this.caption.trim() || undefined,
    };
  }

  validate(data: { assets?: ContentAssetData[] }): boolean {
    return Boolean(data.assets?.length);
  }

  private renderContent() {
    if (!this.wrapper) return;
    this.wrapper.replaceChildren();

    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-2 gap-xs sm:grid-cols-3';

    for (const asset of this.assets) {
      grid.append(
        renderAssetCard(asset, {
          emptyLabel: '',
          onPick: () => this.replace(asset.assetUuid),
          onRemove: this.options.readOnly
            ? undefined
            : () => this.remove(asset.assetUuid),
          removeLabel: this.labels.remove,
          readOnly: this.options.readOnly,
        }),
      );
    }

    if (!this.options.readOnly) {
      grid.append(
        renderAssetCard(null, {
          emptyLabel: this.labels.addMedia,
          onPick: () => this.add(),
          readOnly: false,
        }),
      );
    }

    this.wrapper.append(grid);

    if (this.assets.length) {
      this.wrapper.append(
        createTextInput(this.labels.galleryCaption, this.caption, (value) => {
          this.caption = value;
        }),
      );
    }
  }

  private async add() {
    const asset = await this.options.config?.pickAsset('media');
    if (!asset) return;
    this.assets = [...this.assets, asset];
    this.renderContent();
  }

  private async replace(assetUuid: string) {
    if (this.options.readOnly) return;
    const asset = await this.options.config?.pickAsset('media');
    if (!asset) return;
    this.assets = this.assets.map((item) =>
      item.assetUuid === assetUuid ? asset : item,
    );
    this.renderContent();
  }

  private remove(assetUuid: string) {
    this.assets = this.assets.filter((item) => item.assetUuid !== assetUuid);
    this.renderContent();
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

  constructor(
    private options: ContentToolOptions<{
      asset?: ContentAssetData;
      title?: string;
      caption?: string;
    }>,
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
    this.wrapper.replaceChildren();
    this.wrapper.append(
      renderAssetCard(this.asset, {
        emptyLabel: this.labels.chooseFile,
        onPick: () => this.pick(),
        onRemove: this.asset ? () => this.remove() : undefined,
        removeLabel: this.labels.remove,
        readOnly: this.options.readOnly,
      }),
    );

    if (this.asset) {
      this.wrapper.append(
        createTextInput(this.labels.title, this.title, (value) => {
          this.title = value;
        }),
        createTextInput(this.labels.description, this.caption, (value) => {
          this.caption = value;
        }),
      );
    }
  }

  private async pick() {
    const asset = await this.options.config?.pickAsset('any');
    if (!asset) return;
    this.asset = asset;
    if (!this.title) this.title = assetTitle(asset);
    this.renderContent();
  }

  private remove() {
    this.asset = null;
    this.title = '';
    this.caption = '';
    this.renderContent();
  }

  private get labels() {
    return getLabels(this.options.config);
  }
}

export class PrivateAccessTune implements BlockTune {
  static isTune = true;

  private isPrivate: boolean;
  private labels: ContentToolConfig['labels'];
  private block?: BlockAPI;
  private wrapper?: HTMLElement;

  constructor(options: {
    data?: { isPrivate?: boolean };
    config?: Partial<ContentToolConfig>;
    block?: BlockAPI;
  }) {
    this.isPrivate = options.data?.isPrivate === true;
    this.labels = getLabels(options.config as ContentToolConfig | undefined);
    this.block = options.block;
  }

  render(): MenuConfig {
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
  config: ContentToolConfig | undefined,
): ContentToolConfig['labels'] {
  return (
    config?.labels ?? {
      chooseMedia: 'Choose image or video',
      addMedia: 'Add image or video',
      chooseFile: 'Choose file',
      caption: 'Caption',
      galleryCaption: 'Gallery caption',
      title: 'Title',
      description: 'Description',
      remove: 'Remove',
      privateAccess: 'Private access',
    }
  );
}

function createToolWrapper() {
  const element = document.createElement('div');
  element.className = 'my-sm flex flex-col gap-xs';
  return element;
}

function renderAssetCard(
  asset: ContentAssetData | null,
  options: {
    emptyLabel: string;
    onPick: () => void;
    onRemove?: () => void;
    removeLabel?: string;
    readOnly: boolean;
  },
) {
  const card = document.createElement('div');
  card.className =
    'group relative flex min-h-34 cursor-pointer items-center justify-center overflow-hidden rounded-normal border border-border-1 bg-bg-3 text-sm text-text-2 transition hocus:border-border-3 hocus:text-text-1';
  card.tabIndex = options.readOnly ? -1 : 0;

  if (!options.readOnly) {
    card.addEventListener('click', options.onPick);
    card.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      options.onPick();
    });
  }

  if (!asset) {
    card.textContent = options.emptyLabel;
    return card;
  }

  if (asset.videoUrl || asset.type === AssetType.Video) {
    const video = document.createElement('video');
    video.src = asset.videoUrl ?? asset.assetUrl ?? '';
    video.poster = asset.previewUrl;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.className = 'size-full object-cover';
    card.append(video);
  } else if (asset.previewUrl || asset.type === AssetType.Image) {
    const img = document.createElement('img');
    img.src = asset.previewUrl ?? asset.assetUrl ?? '';
    img.alt = '';
    img.className = 'size-full object-cover';
    card.append(img);
  } else {
    const ext = document.createElement('div');
    ext.className = 'font-mono text-xl font-bold uppercase';
    ext.textContent = asset.extension ?? 'file';
    card.append(ext);
  }

  const meta = document.createElement('div');
  meta.className =
    'absolute right-xs bottom-xs rounded bg-black/40 px-xs py-0.5 text-xs text-white backdrop-blur-sm';
  meta.textContent = asset.extension ?? 'file';
  card.append(meta);

  if (options.onRemove) {
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className =
      'absolute top-xs right-xs rounded bg-black/40 px-xs py-0.5 text-xs text-white opacity-0 backdrop-blur-sm transition group-hover:opacity-100';
    remove.textContent = options.removeLabel ?? getLabels(undefined).remove;
    remove.addEventListener('click', (event) => {
      event.stopPropagation();
      options.onRemove?.();
    });
    card.append(remove);
  }

  return card;
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
  return asset.extension ? `${asset.extension.toUpperCase()} file` : 'File';
}

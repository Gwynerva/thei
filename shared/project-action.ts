import { normalizeExternalLinkUrl } from './external-link';

export const PROJECT_ACTION_TARGETS = ['file', 'external-link'] as const;
export type ProjectActionTarget = (typeof PROJECT_ACTION_TARGETS)[number];

export const PROJECT_ACTION_ICON_MODES = [
  'fallback',
  'asset',
  'favicon',
] as const;
export type ProjectActionIconMode = (typeof PROJECT_ACTION_ICON_MODES)[number];

export const PROJECT_ACTION_BACKGROUND_MODES = [
  'standard-gradient',
  'accent-gradient',
  'asset',
  'link-gradient',
  'icon-gradient',
  'file-gradient',
] as const;
export type ProjectActionBackgroundMode =
  (typeof PROJECT_ACTION_BACKGROUND_MODES)[number];

export const PROJECT_ACTION_BACKGROUND_SIZES = [
  'natural',
  'contain',
  'cover',
  'stretch',
] as const;
export type ProjectActionBackgroundSize =
  (typeof PROJECT_ACTION_BACKGROUND_SIZES)[number];

export const PROJECT_ACTION_BACKGROUND_REPEATS = [
  'no-repeat',
  'repeat-x',
  'repeat-y',
  'repeat',
] as const;
export type ProjectActionBackgroundRepeat =
  (typeof PROJECT_ACTION_BACKGROUND_REPEATS)[number];

export interface ProjectActionEditData {
  enabled: boolean;
  text: string;
  accentColor: string;
  isPrivate: boolean;
  target: ProjectActionTarget;
  externalUrl?: string;
  fileAssetUuid?: string;
  fileTitle?: string;
  fileDescription?: string;
  iconMode: ProjectActionIconMode;
  iconAssetUuid?: string;
  backgroundMode: ProjectActionBackgroundMode;
  backgroundAssetUuid?: string;
  backgroundSize: ProjectActionBackgroundSize;
  backgroundRepeat: ProjectActionBackgroundRepeat;
}

export const DEFAULT_PROJECT_ACTION: ProjectActionEditData = {
  enabled: false,
  text: '',
  accentColor: '#777777',
  isPrivate: false,
  target: 'external-link',
  iconMode: 'fallback',
  backgroundMode: 'standard-gradient',
  backgroundSize: 'natural',
  backgroundRepeat: 'no-repeat',
};

export function normalizeProjectAction(value: unknown): ProjectActionEditData {
  if (!value || typeof value !== 'object') return { ...DEFAULT_PROJECT_ACTION };
  const input = value as Partial<ProjectActionEditData>;
  const text = typeof input.text === 'string' ? input.text.trim() : '';
  if (!text) return { ...DEFAULT_PROJECT_ACTION };
  if (Array.from(text).length > 30)
    throw new Error('Action button text must not exceed 30 characters');

  const target = requireEnum(
    input.target,
    PROJECT_ACTION_TARGETS,
    'Invalid action button target',
  );
  const iconMode = requireEnum(
    input.iconMode,
    PROJECT_ACTION_ICON_MODES,
    'Invalid action button icon mode',
  );
  const backgroundMode = requireEnum(
    input.backgroundMode,
    PROJECT_ACTION_BACKGROUND_MODES,
    'Invalid action button background mode',
  );
  if ('backgroundX' in input || 'backgroundY' in input)
    throw new Error('Legacy action button background settings are not allowed');

  const requestedAccentColor =
    typeof input.accentColor === 'string' ? input.accentColor : '';
  if (
    backgroundMode === 'accent-gradient' &&
    !/^#[0-9a-fA-F]{6}$/.test(requestedAccentColor)
  )
    throw new Error('Invalid action button color');
  const accentColor =
    backgroundMode === 'accent-gradient'
      ? requestedAccentColor.toLowerCase()
      : DEFAULT_PROJECT_ACTION.accentColor;

  const iconAssetUuid =
    iconMode === 'asset'
      ? requireIdentifier(input.iconAssetUuid, 'Action button icon is missing')
      : undefined;
  const backgroundAssetUuid =
    backgroundMode === 'asset'
      ? requireIdentifier(
          input.backgroundAssetUuid,
          'Action button background is missing',
        )
      : undefined;
  const backgroundSize =
    backgroundMode === 'asset'
      ? requireEnum(
          input.backgroundSize,
          PROJECT_ACTION_BACKGROUND_SIZES,
          'Invalid action button background size',
        )
      : DEFAULT_PROJECT_ACTION.backgroundSize;
  const requestedBackgroundRepeat =
    backgroundMode === 'asset'
      ? requireEnum(
          input.backgroundRepeat,
          PROJECT_ACTION_BACKGROUND_REPEATS,
          'Invalid action button background repeat',
        )
      : DEFAULT_PROJECT_ACTION.backgroundRepeat;
  const backgroundRepeat = normalizeProjectActionBackgroundRepeat(
    backgroundSize,
    requestedBackgroundRepeat,
  );
  if (iconMode === 'favicon' && target !== 'external-link')
    throw new Error('Favicon is only available for external links');
  if (backgroundMode === 'link-gradient' && target !== 'external-link')
    throw new Error('Link gradient is only available for external links');
  if (backgroundMode === 'icon-gradient' && !iconAssetUuid)
    throw new Error('Icon gradient requires an action icon');

  let externalUrl: string | undefined;
  if (target === 'external-link' && typeof input.externalUrl === 'string') {
    try {
      externalUrl = normalizeExternalLinkUrl(input.externalUrl);
    } catch {
      throw new Error('Invalid action button URL');
    }
  }
  if (target === 'external-link' && !externalUrl)
    throw new Error('Action button URL cannot be empty');

  const fileAssetUuid =
    target === 'file'
      ? requireIdentifier(input.fileAssetUuid, 'Action button file is missing')
      : undefined;
  if (backgroundMode === 'file-gradient' && !fileAssetUuid)
    throw new Error('File gradient requires an action file');
  const fileTitle =
    target === 'file' && typeof input.fileTitle === 'string'
      ? input.fileTitle.trim()
      : undefined;
  if (target === 'file' && !fileTitle)
    throw new Error('Action button file title cannot be empty');
  const fileDescription =
    target === 'file' && typeof input.fileDescription === 'string'
      ? input.fileDescription.trim() || undefined
      : undefined;

  return {
    enabled: true,
    text,
    accentColor,
    isPrivate: input.isPrivate === true,
    target,
    externalUrl,
    fileAssetUuid,
    fileTitle,
    fileDescription,
    iconMode,
    iconAssetUuid,
    backgroundMode,
    backgroundAssetUuid,
    backgroundSize,
    backgroundRepeat,
  };
}

export function projectActionValidationError(value: unknown) {
  try {
    normalizeProjectAction(value);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : 'Invalid action button';
  }
}

export function normalizeProjectActionBackgroundRepeat(
  size: ProjectActionBackgroundSize,
  repeat: ProjectActionBackgroundRepeat,
): ProjectActionBackgroundRepeat {
  return size === 'cover' || size === 'stretch' ? 'no-repeat' : repeat;
}

export function projectActionContextAccentHue(
  mode: ProjectActionBackgroundMode,
  sources: {
    icon?: number;
    file?: number;
    link?: number;
  },
) {
  if (mode === 'icon-gradient') return sources.icon;
  if (mode === 'file-gradient') return sources.file;
  if (mode === 'link-gradient') return sources.link;
  return undefined;
}

function requireEnum<const T extends readonly string[]>(
  value: unknown,
  values: T,
  message: string,
): T[number] {
  if (!values.includes(value as T[number])) throw new Error(message);
  return value as T[number];
}

function requireIdentifier(value: unknown, message: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(message);
  return value.trim();
}

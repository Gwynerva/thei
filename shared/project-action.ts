import type { ImageAccent } from '#layers/thei/shared/accent-color';
import { normalizeExternalLinkUrl } from './external-link';

export const PROJECT_ACTION_TEXT_MAX_LENGTH = 30;

export const PROJECT_ACTION_TARGETS = ['external-link', 'file'] as const;
export type ProjectActionTarget = (typeof PROJECT_ACTION_TARGETS)[number];

export const PROJECT_ACTION_ICON_MODES = [
  'fallback',
  'favicon',
  'asset',
] as const;
export type ProjectActionIconMode = (typeof PROJECT_ACTION_ICON_MODES)[number];

/**
 * `auto-gradient` takes its color from the button's own media: the displayed
 * icon first, then the target file preview or the linked site's favicon.
 */
export const PROJECT_ACTION_BACKGROUND_MODES = [
  'standard-gradient',
  'auto-gradient',
  'accent-gradient',
  'asset',
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

/**
 * The editor keeps settings of inactive modes (a file while the target is a
 * link, an icon while the default icon is chosen) so switching back loses
 * nothing. `normalizeProjectAction` drops them on save.
 */
export interface ProjectActionEditData {
  enabled: boolean;
  text: string;
  accentColor: string;
  isPrivate: boolean;
  target: ProjectActionTarget;
  externalUrl?: string;
  fileAssetUuid?: string;
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

export const PROJECT_ACTION_ISSUES = [
  'text',
  'text-length',
  'url',
  'file',
  'icon',
  'background',
  'color',
] as const;
export type ProjectActionIssue = (typeof PROJECT_ACTION_ISSUES)[number];

const ISSUE_MESSAGES: Record<ProjectActionIssue, string> = {
  text: 'Action button text cannot be empty',
  'text-length': `Action button text must not exceed ${PROJECT_ACTION_TEXT_MAX_LENGTH} characters`,
  url: 'Invalid action button URL',
  file: 'Action button file is missing',
  icon: 'Action button icon is missing',
  background: 'Action button background is missing',
  color: 'Invalid action button color',
};

/** Unfilled or invalid settings of an enabled button, in display order. */
export function projectActionIssues(
  action: ProjectActionEditData,
): ProjectActionIssue[] {
  if (action.enabled !== true) return [];
  const issues: ProjectActionIssue[] = [];
  const text = typeof action.text === 'string' ? action.text.trim() : '';
  if (!text) issues.push('text');
  else if (Array.from(text).length > PROJECT_ACTION_TEXT_MAX_LENGTH)
    issues.push('text-length');
  if (action.target === 'external-link' && !normalizeUrl(action.externalUrl))
    issues.push('url');
  if (action.target === 'file' && !identifier(action.fileAssetUuid))
    issues.push('file');
  if (
    projectActionIconMode(action.target, action.iconMode) === 'asset' &&
    !identifier(action.iconAssetUuid)
  )
    issues.push('icon');
  if (
    action.backgroundMode === 'asset' &&
    !identifier(action.backgroundAssetUuid)
  )
    issues.push('background');
  if (
    action.backgroundMode === 'accent-gradient' &&
    !isHexColor(action.accentColor)
  )
    issues.push('color');
  return issues;
}

export function normalizeProjectAction(value: unknown): ProjectActionEditData {
  if (!value || typeof value !== 'object') return { ...DEFAULT_PROJECT_ACTION };
  const input = value as Partial<ProjectActionEditData>;
  if (input.enabled !== true) return { ...DEFAULT_PROJECT_ACTION };

  const target = requireEnum(
    input.target,
    PROJECT_ACTION_TARGETS,
    'Invalid action button target',
  );
  const iconMode = projectActionIconMode(
    target,
    requireEnum(
      input.iconMode,
      PROJECT_ACTION_ICON_MODES,
      'Invalid action button icon mode',
    ),
  );
  const backgroundMode = requireEnum(
    input.backgroundMode,
    PROJECT_ACTION_BACKGROUND_MODES,
    'Invalid action button background mode',
  );
  const issue = projectActionIssues({
    ...DEFAULT_PROJECT_ACTION,
    ...input,
    target,
    iconMode,
    backgroundMode,
  })[0];
  if (issue) throw new Error(ISSUE_MESSAGES[issue]);

  const usesImage = backgroundMode === 'asset';
  const backgroundSize = usesImage
    ? requireEnum(
        input.backgroundSize,
        PROJECT_ACTION_BACKGROUND_SIZES,
        'Invalid action button background size',
      )
    : DEFAULT_PROJECT_ACTION.backgroundSize;
  const backgroundRepeat = usesImage
    ? normalizeProjectActionBackgroundRepeat(
        backgroundSize,
        requireEnum(
          input.backgroundRepeat,
          PROJECT_ACTION_BACKGROUND_REPEATS,
          'Invalid action button background repeat',
        ),
      )
    : DEFAULT_PROJECT_ACTION.backgroundRepeat;

  return {
    enabled: true,
    text: (input.text as string).trim(),
    accentColor:
      backgroundMode === 'accent-gradient'
        ? (input.accentColor as string).toLowerCase()
        : DEFAULT_PROJECT_ACTION.accentColor,
    isPrivate: input.isPrivate === true,
    target,
    externalUrl:
      target === 'external-link' ? normalizeUrl(input.externalUrl) : undefined,
    fileAssetUuid:
      target === 'file' ? identifier(input.fileAssetUuid) : undefined,
    iconMode,
    iconAssetUuid:
      iconMode === 'asset' ? identifier(input.iconAssetUuid) : undefined,
    backgroundMode,
    backgroundAssetUuid: usesImage
      ? identifier(input.backgroundAssetUuid)
      : undefined,
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

/** Assets the button actually shows or links to once it is saved. */
export function projectActionAssetUuids(
  action: ProjectActionEditData | undefined,
): string[] {
  if (action?.enabled !== true) return [];
  return [
    action.target === 'file' ? action.fileAssetUuid : undefined,
    action.iconMode === 'asset' ? action.iconAssetUuid : undefined,
    action.backgroundMode === 'asset' ? action.backgroundAssetUuid : undefined,
  ].filter((assetUuid): assetUuid is string => !!assetUuid);
}

/** A site favicon only exists for links; a file button shows the default icon. */
export function projectActionIconMode(
  target: ProjectActionTarget,
  iconMode: ProjectActionIconMode,
): ProjectActionIconMode {
  return iconMode === 'favicon' && target !== 'external-link'
    ? 'fallback'
    : iconMode;
}

export function normalizeProjectActionBackgroundRepeat(
  size: ProjectActionBackgroundSize,
  repeat: ProjectActionBackgroundRepeat,
): ProjectActionBackgroundRepeat {
  return size === 'cover' || size === 'stretch' ? 'no-repeat' : repeat;
}

/**
 * Color of the `auto-gradient` background: the displayed icon (a custom icon
 * or the site favicon) wins, then the file preview for a file button or the
 * favicon for a link button. `undefined` falls back to the site accent.
 */
export function projectActionAutoAccent(
  target: ProjectActionTarget,
  sources: {
    icon?: ImageAccent;
    file?: ImageAccent;
    favicon?: ImageAccent;
  },
) {
  return sources.icon ?? (target === 'file' ? sources.file : sources.favicon);
}

function normalizeUrl(value: unknown) {
  try {
    return normalizeExternalLinkUrl(value);
  } catch {
    return undefined;
  }
}

function identifier(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isHexColor(value: unknown) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

function requireEnum<const T extends readonly string[]>(
  value: unknown,
  values: T,
  message: string,
): T[number] {
  if (!values.includes(value as T[number])) throw new Error(message);
  return value as T[number];
}

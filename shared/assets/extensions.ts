import type { LanguagePhrases } from '../language';

export const IMAGE_EXTENSIONS = [
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'avif',
  'svg',
] as const;
export const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'avi'] as const;
export const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'flac'] as const;

export interface ExtensionProfile {
  title: keyof LanguagePhrases;
  extensions: readonly string[] | '*';
}

export const imageExtensionProfile: ExtensionProfile = {
  title: 'image',
  extensions: IMAGE_EXTENSIONS,
};

export const videoExtensionProfile: ExtensionProfile = {
  title: 'video',
  extensions: VIDEO_EXTENSIONS,
};

export const audioExtensionProfile: ExtensionProfile = {
  title: 'audio',
  extensions: AUDIO_EXTENSIONS,
};

export const anyFileExtensionProfile: ExtensionProfile = {
  title: 'any_file',
  extensions: '*',
};

export function getPathExtension(path: string): string {
  const filename = path.split('/').pop()?.split('\\').pop() ?? '';
  const dotIndex = filename.lastIndexOf('.');

  if (dotIndex <= 0) {
    return '';
  }

  return filename.slice(dotIndex + 1).toLowerCase();
}

export function isExtensionAllowed(extension: string, allowed: any): boolean {
  if (allowed === '*') {
    return true;
  }

  if (typeof allowed === 'string') {
    return extension === allowed;
  }

  if (Array.isArray(allowed)) {
    for (const item of allowed) {
      if (isExtensionAllowed(extension, item)) {
        return true;
      }
    }
  }

  if ('extensions' in allowed) {
    return isExtensionAllowed(extension, allowed.extensions);
  }

  return false;
}

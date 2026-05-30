import { describe, it, expect } from 'vitest';
import {
  isExtensionAllowed,
  getPathExtension,
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
  AUDIO_EXTENSIONS,
  imageExtensionProfile,
  videoExtensionProfile,
  audioExtensionProfile,
  anyFileExtensionProfile,
} from '../../../shared/assets/extensions';

// ---------------------------------------------------------------------------
// getPathExtension
// ---------------------------------------------------------------------------
describe('getPathExtension', () => {
  it('extracts extension from a simple filename', () => {
    expect(getPathExtension('photo.jpg')).toBe('jpg');
  });

  it('extracts extension from a POSIX path', () => {
    expect(getPathExtension('/uploads/assets/video.mp4')).toBe('mp4');
  });

  it('extracts extension from a Windows path', () => {
    expect(getPathExtension('C:\\Users\\admin\\file.PNG')).toBe('png');
  });

  it('lowercases the extension', () => {
    expect(getPathExtension('image.WEBP')).toBe('webp');
    expect(getPathExtension('track.MP3')).toBe('mp3');
  });

  it('handles filenames with multiple dots', () => {
    expect(getPathExtension('archive.tar.gz')).toBe('gz');
    expect(getPathExtension('my.file.name.svg')).toBe('svg');
  });

  it('returns empty string when there is no extension', () => {
    expect(getPathExtension('Makefile')).toBe('');
    expect(getPathExtension('/etc/hosts')).toBe('');
  });

  it('returns empty string for dotfiles (hidden files)', () => {
    expect(getPathExtension('.gitignore')).toBe('');
    expect(getPathExtension('/home/user/.bashrc')).toBe('');
  });

  it('returns empty string for an empty string input', () => {
    expect(getPathExtension('')).toBe('');
  });

  it('handles a filename that is only a dot', () => {
    expect(getPathExtension('.')).toBe('');
  });

  it('handles mixed separators in path', () => {
    expect(getPathExtension('C:\\uploads/assets/clip.webm')).toBe('webm');
  });
});

// ---------------------------------------------------------------------------
// isExtensionAllowed — wildcard '*'
// ---------------------------------------------------------------------------
describe('isExtensionAllowed with wildcard', () => {
  it('allows any extension when allowed is "*"', () => {
    expect(isExtensionAllowed('exe', '*')).toBe(true);
    expect(isExtensionAllowed('pdf', '*')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isExtensionAllowed — string
// ---------------------------------------------------------------------------
describe('isExtensionAllowed with string', () => {
  it('matches the exact extension', () => {
    expect(isExtensionAllowed('jpg', 'jpg')).toBe(true);
  });

  it('rejects a different extension', () => {
    expect(isExtensionAllowed('png', 'jpg')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isExtensionAllowed — array
// ---------------------------------------------------------------------------
describe('isExtensionAllowed with array', () => {
  it('matches an extension present in the array', () => {
    expect(isExtensionAllowed('mp4', ['mp4', 'webm'])).toBe(true);
  });

  it('rejects an extension not in the array', () => {
    expect(isExtensionAllowed('avi', ['mp4', 'webm'])).toBe(false);
  });

  it('works with nested arrays', () => {
    expect(isExtensionAllowed('ogg', [['mp3', 'ogg'], 'wav'])).toBe(true);
  });

  it('handles an empty array', () => {
    expect(isExtensionAllowed('jpg', [])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isExtensionAllowed — ExtensionProfile object
// ---------------------------------------------------------------------------
describe('isExtensionAllowed with ExtensionProfile', () => {
  it('allows an image extension via imageExtensionProfile', () => {
    for (const ext of IMAGE_EXTENSIONS) {
      expect(isExtensionAllowed(ext, imageExtensionProfile)).toBe(true);
    }
  });

  it('rejects a non-image extension via imageExtensionProfile', () => {
    expect(isExtensionAllowed('mp4', imageExtensionProfile)).toBe(false);
    expect(isExtensionAllowed('mp3', imageExtensionProfile)).toBe(false);
  });

  it('allows a video extension via videoExtensionProfile', () => {
    for (const ext of VIDEO_EXTENSIONS) {
      expect(isExtensionAllowed(ext, videoExtensionProfile)).toBe(true);
    }
  });

  it('rejects a non-video extension via videoExtensionProfile', () => {
    expect(isExtensionAllowed('jpg', videoExtensionProfile)).toBe(false);
  });

  it('allows an audio extension via audioExtensionProfile', () => {
    for (const ext of AUDIO_EXTENSIONS) {
      expect(isExtensionAllowed(ext, audioExtensionProfile)).toBe(true);
    }
  });

  it('rejects a non-audio extension via audioExtensionProfile', () => {
    expect(isExtensionAllowed('png', audioExtensionProfile)).toBe(false);
  });

  it('allows any extension via anyFileExtensionProfile (wildcard)', () => {
    expect(isExtensionAllowed('exe', anyFileExtensionProfile)).toBe(true);
    expect(isExtensionAllowed('pdf', anyFileExtensionProfile)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Combined: getPathExtension + isExtensionAllowed (real-world usage)
// ---------------------------------------------------------------------------
describe('combined usage: getPathExtension + isExtensionAllowed', () => {
  it('validates an uploaded image path against imageExtensionProfile', () => {
    const path = '/uploads/photo.JPG';
    expect(
      isExtensionAllowed(getPathExtension(path), imageExtensionProfile),
    ).toBe(true);
  });

  it('rejects a document path against imageExtensionProfile', () => {
    const path = '/uploads/report.pdf';
    expect(
      isExtensionAllowed(getPathExtension(path), imageExtensionProfile),
    ).toBe(false);
  });

  it('validates a video path on a Windows-style path', () => {
    const path = 'C:\\media\\clip.MP4';
    expect(
      isExtensionAllowed(getPathExtension(path), videoExtensionProfile),
    ).toBe(true);
  });

  it('validates any file via anyFileExtensionProfile', () => {
    const paths = ['file.pdf', 'archive.zip', 'script.sh', 'image.png'];
    for (const p of paths) {
      expect(
        isExtensionAllowed(getPathExtension(p), anyFileExtensionProfile),
      ).toBe(true);
    }
  });
});

/**
 * Language-agnostic first-pass normalization applied by all language modules.
 * Converts common ASCII shorthand to proper Unicode typography.
 */
export function generalNormalize(text: string): string {
  return (
    text
      // Three dots → ellipsis character
      .replace(/\.\.\./g, '\u2026')
      // Double hyphen → em dash
      .replace(/--/g, '\u2014')
  );
}

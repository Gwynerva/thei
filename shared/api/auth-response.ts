import type { LanguagePhraseId } from '../language/phrases';

export type AuthResponse =
  | { type: 'success' }
  | { type: 'error'; phraseId: LanguagePhraseId };

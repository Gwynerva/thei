import { generalNormalize } from './general-normalize';
import { createPhraseProxy } from './proxy';
import type { I18nBaseModule, I18nController, I18nModuleSpec } from './types';

export function createI18nController(
  primary: I18nModuleSpec,
  base: I18nBaseModule,
): I18nController {
  const primaryNormalize = primary.normalize ?? generalNormalize;
  const baseNormalize = base.normalize ?? generalNormalize;

  return {
    code: primary.code,
    normalize: primaryNormalize,
    sampleDisplayNames:
      primary.sampleDisplayNames ?? base.sampleDisplayNames ?? [],
    sampleSecretPhrases:
      primary.sampleSecretPhrases ?? base.sampleSecretPhrases ?? [],
    sampleProjects: primary.sampleProjects ?? base.sampleProjects ?? [],
    phrase: createPhraseProxy(
      primary.phrases,
      base.phrases,
      primaryNormalize,
      baseNormalize,
      primary.code,
      base.code,
    ),
  };
}

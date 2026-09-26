import { generalNormalize } from './general-normalize';
import { createPhraseProxy } from './proxy';
import type { I18nBaseModule, I18nController, I18nModuleSpec } from './types';

export function createI18nController(
  primary: I18nModuleSpec,
  base: I18nBaseModule,
): I18nController {
  const primaryNormalize = primary.normalize ?? generalNormalize;
  const baseNormalize = base.normalize ?? generalNormalize;
  const primarySlugify = primary.slugify ?? base.slugify;

  return {
    code: primary.code,
    normalize: primaryNormalize,
    slugify: primarySlugify,
    sampleDisplayNames:
      primary.sampleDisplayNames ?? base.sampleDisplayNames ?? [],
    sampleSecretPhrases:
      primary.sampleSecretPhrases ?? base.sampleSecretPhrases ?? [],
    sampleProjects: primary.sampleProjects ?? base.sampleProjects ?? [],
    secretCodenames: primary.secretCodenames ?? base.secretCodenames,
    secretSummaries: primary.secretSummaries ?? base.secretSummaries,
    sizeUnits: { ...base.sizeUnits, ...primary.sizeUnits },
    listLetters: primary.listLetters,
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

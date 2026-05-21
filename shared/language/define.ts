import type { I18nBaseModule, I18nModuleSpec } from './types';

/**
 * Defines the base i18n module (English). All phrase keys are required.
 * TypeScript enforces completeness via the I18nBaseModule type.
 */
export function defineI18nBase(input: I18nBaseModule): I18nBaseModule {
  return input;
}

/**
 * Defines an extension i18n module. Only overrides are required —
 * the controller falls back to the base module for any missing phrases.
 */
export function defineI18nModule(input: I18nModuleSpec): I18nModuleSpec {
  return input;
}

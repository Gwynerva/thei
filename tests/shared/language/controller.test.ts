import { describe, it, expect } from 'vitest';
import { createI18nController } from '../../../shared/language/controller';
import enModule from '../../../shared/language/list/en';
import ruModule from '../../../shared/language/list/ru';
import type { I18nBaseModule } from '../../../shared/language/types';

const enBase = enModule as I18nBaseModule;

describe('createI18nController (en)', () => {
  const ctrl = createI18nController(enBase, enBase);

  it('has correct code', () => {
    expect(ctrl.code).toBe('en');
  });

  it('has normalize function', () => {
    expect(typeof ctrl.normalize).toBe('function');
  });

  it('normalize applies English curly quotes via controller', () => {
    expect(ctrl.normalize('"hello"')).toBe('\u201Chello\u201D');
  });

  it('phrase.theme returns normalized string', () => {
    expect(typeof ctrl.phrase.theme).toBe('string');
  });

  it('phrase.display_name_hint applies normalize to return value', () => {
    // The phrase returns `Can be a name or nickname: "Hello, ${name}!"`
    // normalize should convert the straight quotes to curly
    const result = ctrl.phrase.display_name_hint('Alex');
    expect(result).toContain('\u201C');
    expect(result).toContain('\u201D');
    expect(result).toContain('Alex');
  });

  it('has sampleDisplayNames', () => {
    expect(ctrl.sampleDisplayNames).toContain('Alex');
  });

  it('has sampleSecretPhrases', () => {
    expect(ctrl.sampleSecretPhrases.length).toBeGreaterThan(0);
  });
});

describe('createI18nController (ru with en base)', () => {
  const ctrl = createI18nController(ruModule, enBase);

  it('has correct code', () => {
    expect(ctrl.code).toBe('ru');
  });

  it('phrase.theme returns Russian translation', () => {
    expect(ctrl.phrase.theme).toBe('Тема');
  });

  it('phrase.language_name returns Russian', () => {
    expect(ctrl.phrase.language_name).toBe('Русский');
  });

  it('applies Russian normalize (guillemets) to primary phrases', () => {
    // display_name_hint contains `"Привет, ${name}!"` — should get guillemets
    const result = ctrl.phrase.display_name_hint('Иван');
    expect(result).toContain('\u00AB');
    expect(result).toContain('\u00BB');
  });

  it('has Russian sampleDisplayNames', () => {
    expect(ctrl.sampleDisplayNames).toContain('Анна');
  });

  it('logs I18nError and returns {{ key }} fallback for phrase not in either module', () => {
    const partialCtrl = createI18nController({ code: 'ru', phrases: {} }, {
      code: 'en',
      phrases: {},
    } as unknown as I18nBaseModule);
    const origError = console.error;
    console.error = () => {};
    const result = String(partialCtrl.phrase.theme);
    console.error = origError;
    expect(result).toBe('{{ theme }}');
  });
});

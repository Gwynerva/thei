import { type LanguageInstance } from '#layers/thei/shared/language';

export const _language = shallowRef<LanguageInstance | undefined>();
export const language = computed<LanguageInstance>(() => _language.value!);
export const phrase = computed(() => language.value.phrase);

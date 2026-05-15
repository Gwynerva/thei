import { type Language } from '#layers/thei/shared/language';

export const language = shallowRef<Language>();
export const phrase = computed(() => language.value!.phrases);

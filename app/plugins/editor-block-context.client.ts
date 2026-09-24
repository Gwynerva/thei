import { setEditorBlockAppContext } from '#layers/thei/app/components/content/editor-block-render';

/** Gives Vue trees mounted into Editor.js blocks the application's context. */
export default defineNuxtPlugin((nuxtApp) => {
  setEditorBlockAppContext(nuxtApp.vueApp._context);
});

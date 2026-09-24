import { render, type AppContext, type VNode } from 'vue';

let appContext: AppContext | null = null;

/** Called once by a client plugin with the application's own context. */
export function setEditorBlockAppContext(context: AppContext) {
  appContext = context;
}

/**
 * Renders a Vue tree into an Editor.js block.
 *
 * Editor.js owns the block's element, so the tree is mounted outside the
 * application with `render`. On its own that tree has no application: any
 * Nuxt composable inside it — the site path, the runtime config, the Nuxt app
 * itself — throws, and Editor.js drops the whole block. Handing the tree the
 * application's context makes it behave like any other component.
 */
export function renderEditorBlock(vnode: VNode | null, element: Element) {
  if (vnode && appContext) vnode.appContext = appContext;
  render(vnode, element);
}

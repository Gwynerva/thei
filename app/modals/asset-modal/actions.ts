import type { InjectionKey } from 'vue';
import type { IconName } from '#thei/icons';

/** A round button a view inside a file's window puts beside the window's own. */
export interface AssetModalAction {
  key: string;
  /** Its name, for its hint and a screen reader. */
  label: string;
  icon?: IconName;
  /** Words in place of an icon: a zoom's percent. */
  text?: string;
  href?: string;
  /** With `href`: saved under this name rather than opened. */
  download?: string;
  onClick?: () => void;
}

type SetActions = (owner: symbol, actions: AssetModalAction[]) => void;

const ACTIONS: InjectionKey<SetActions> = Symbol('asset-modal-actions');

/**
 * The window's side: where the views inside it put their buttons, in the
 * order they were put.
 */
export function provideAssetModalActions() {
  const byOwner = new Map<symbol, AssetModalAction[]>();
  const owned = shallowRef(byOwner);
  // Written without being read: a view's effect that puts its buttons here
  // must not come to depend on them.
  provide(ACTIONS, (owner, actions) => {
    if (actions.length) byOwner.set(owner, actions);
    else byOwner.delete(owner);
    triggerRef(owned);
  });
  return computed(() => [...owned.value.values()].flat());
}

/**
 * A view's buttons, beside the window's own for as long as the view is
 * there. Whether there is a window to put them in: outside one the view
 * draws its own.
 */
export function useAssetModalActions(actions: () => AssetModalAction[]) {
  const set = inject(ACTIONS, null);
  if (!set) return false;
  const owner = Symbol('asset-modal-actions-owner');
  watchEffect(() => set(owner, actions()));
  onBeforeUnmount(() => set(owner, []));
  return true;
}

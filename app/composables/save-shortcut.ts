import {
  onBeforeUnmount,
  onMounted,
  toValue,
  type MaybeRefOrGetter,
} from 'vue';

type SaveShortcutEvent = Pick<
  KeyboardEvent,
  | 'altKey'
  | 'code'
  | 'ctrlKey'
  | 'isComposing'
  | 'metaKey'
  | 'shiftKey'
  | 'getModifierState'
>;

export interface SaveShortcutOptions {
  canSave?: MaybeRefOrGetter<boolean>;
  root?: MaybeRefOrGetter<HTMLElement | null | undefined>;
  exclusive?: boolean;
}

interface SaveShortcutRegistration {
  id: number;
  canSave: () => boolean;
  exclusive: boolean;
  onSave: () => void | Promise<void>;
  root: () => HTMLElement | null | undefined;
  running: boolean;
}

interface SaveShortcutRegistryOptions {
  getActiveBoundary?: () => HTMLElement | undefined;
}

export function isSaveShortcut(event: SaveShortcutEvent) {
  return (
    !event.isComposing &&
    !event.altKey &&
    !event.shiftKey &&
    !event.getModifierState('AltGraph') &&
    event.ctrlKey !== event.metaKey &&
    event.code === 'KeyS'
  );
}

export function createSaveShortcutRegistry(
  options: SaveShortcutRegistryOptions = {},
) {
  let registrationId = 0;
  const registrations: SaveShortcutRegistration[] = [];

  function register(
    onSave: () => void | Promise<void>,
    registrationOptions: SaveShortcutOptions = {},
  ) {
    const registration: SaveShortcutRegistration = {
      id: ++registrationId,
      canSave: () => toValue(registrationOptions.canSave ?? true),
      exclusive: registrationOptions.exclusive ?? false,
      onSave,
      root: () => toValue(registrationOptions.root),
      running: false,
    };
    registrations.push(registration);

    return () => {
      const index = registrations.indexOf(registration);
      if (index >= 0) registrations.splice(index, 1);
    };
  }

  function handle(event: KeyboardEvent) {
    if (!isSaveShortcut(event)) return;

    const owner = resolveOwner(
      registrations,
      event.target,
      options.getActiveBoundary?.(),
    );
    if (!owner || owner.running || !owner.canSave()) return;

    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return;

    owner.running = true;
    try {
      const result = owner.onSave();
      void Promise.resolve(result).then(
        () => {
          owner.running = false;
        },
        (error) => {
          owner.running = false;
          console.error(error);
        },
      );
    } catch (error) {
      owner.running = false;
      console.error(error);
    }
  }

  return {
    get size() {
      return registrations.length;
    },
    handle,
    register,
  };
}

function resolveOwner(
  registrations: SaveShortcutRegistration[],
  target: EventTarget | null,
  activeBoundary: HTMLElement | undefined,
) {
  const eligible = registrations.filter((registration) => {
    const root = registration.root();
    if (root && !isVisible(root)) return false;
    if (!activeBoundary) return !root || !root.closest('dialog');
    return Boolean(root && activeBoundary.contains(root));
  });

  const targeted = eligible.filter((registration) => {
    const root = registration.root();
    return Boolean(root && containsEventTarget(root, target));
  });
  const targetedOwner = mostSpecific(targeted);
  if (targetedOwner) return targetedOwner;

  const exclusive = eligible.filter((registration) => registration.exclusive);
  if (exclusive.length) return exclusive[exclusive.length - 1];

  const global = eligible.filter((registration) => !registration.root());
  return global[global.length - 1];
}

function mostSpecific(registrations: SaveShortcutRegistration[]) {
  let owner: SaveShortcutRegistration | undefined;
  for (const registration of registrations) {
    if (!owner) {
      owner = registration;
      continue;
    }
    const ownerRoot = owner.root();
    const candidateRoot = registration.root();
    if (!ownerRoot || !candidateRoot) continue;
    if (ownerRoot === candidateRoot || ownerRoot.contains(candidateRoot)) {
      owner = registration;
      continue;
    }
    if (!candidateRoot.contains(ownerRoot) && registration.id > owner.id) {
      owner = registration;
    }
  }
  return owner;
}

function containsEventTarget(root: HTMLElement, target: EventTarget | null) {
  if (!target) return false;
  try {
    return root.contains(target as Node);
  } catch {
    return false;
  }
}

function isVisible(element: HTMLElement) {
  if (!element.isConnected) return false;
  for (
    let current: HTMLElement | null = element;
    current;
    current = current.parentElement
  ) {
    if (current.hidden || current.style.display === 'none') return false;
  }
  return true;
}

function activeDialog() {
  const dialogs = document.querySelectorAll<HTMLElement>('dialog[open]');
  for (let index = dialogs.length - 1; index >= 0; index--) {
    const dialog = dialogs.item(index);
    if (dialog && isVisible(dialog)) return dialog;
  }
  return undefined;
}

const globalSaveShortcutRegistry = createSaveShortcutRegistry({
  getActiveBoundary: () => activeDialog(),
});
let globalListenerActive = false;

function syncGlobalListener() {
  if (typeof window === 'undefined') return;
  const shouldListen = globalSaveShortcutRegistry.size > 0;
  if (shouldListen === globalListenerActive) return;
  globalListenerActive = shouldListen;
  if (shouldListen) {
    window.addEventListener('keydown', globalSaveShortcutRegistry.handle, true);
  } else {
    window.removeEventListener(
      'keydown',
      globalSaveShortcutRegistry.handle,
      true,
    );
  }
}

export function useSaveShortcut(
  onSave: () => void | Promise<void>,
  options: SaveShortcutOptions = {},
) {
  let unregister: (() => void) | undefined;

  onMounted(() => {
    unregister = globalSaveShortcutRegistry.register(onSave, options);
    syncGlobalListener();
  });

  onBeforeUnmount(() => {
    unregister?.();
    unregister = undefined;
    syncGlobalListener();
  });
}

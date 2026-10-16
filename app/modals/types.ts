import { type Component } from 'vue';
import type { IconName } from '#thei/icons';

interface ModalResultEmpty {
  type: 'empty';
}

interface ModalResultError {
  type: 'error';
  message: string;
}

export type BaseModalResult = ModalResultEmpty | ModalResultError;

/**
 * Extracts the type of the `modalData` prop from a Vue component.
 * Resolves to `never` when the component declares no such prop.
 */
export type ExtractModalData<TComponent extends Component> =
  TComponent extends abstract new (...args: any[]) => { $props: infer P }
    ? 'modalData' extends keyof P
      ? NonNullable<P['modalData']>
      : never
    : never;

/**
 * Extracts the result type from a Vue component's `modalResult` emit.
 * Resolves to `never` when the component declares no such emit.
 */
export type ExtractModalResult<TComponent extends Component> =
  TComponent extends abstract new (...args: any[]) => { $props: infer P }
    ? 'onModalResult' extends keyof P
      ? NonNullable<P['onModalResult']> extends (result: infer R) => any
        ? R
        : never
      : never
    : never;

/** Utility type — extracts the `modalData` type from a ModalDescriptor. */
export type ModalData<TDescriptor> =
  TDescriptor extends ModalDescriptor<any, infer TComponent>
    ? ExtractModalData<TComponent>
    : never;

/**
 * What a modal looks like before its code has arrived. `openModal` draws this
 * frame the moment it is called — a shell with the modal's title — and the
 * component takes its place once loaded, so a slow network never leaves an
 * empty screen. The title is worked out from the data the modal is opened
 * with.
 */
export type ModalFrame<TData = any> =
  | {
      /** A card over the blurred page (`ModalContainer`), `width` wide. */
      kind: 'card';
      width: string;
      icon?: IconName;
      title: (data: TData) => string;
    }
  | {
      /** A file's window (`AssetModal`): the file, its panel beside it. */
      kind: 'file';
      title: (data: TData) => string;
    }
  | {
      /** A picker that fills the window, under a bar of its own. */
      kind: 'screen';
      /** How wide the bar's row is, when narrower than the window. */
      width?: string;
      icon?: IconName;
      title: (data: TData) => string;
    }
  | {
      /** A sheet that moves in and out by itself; only a wait stands in. */
      kind: 'sheet';
    };

export interface ModalDescriptor<
  TResult extends { type: string },
  TComponent extends Component = Component,
> {
  name: string;
  component: () => Promise<{ default: TComponent }>;
  /** The shell drawn while the component loads; a bare wait without one. */
  frame?: ModalFrame;
  // Phantom types — carry result/component types for openModal inference.
  _result?: TResult;
}

/**
 * Create a typed modal descriptor. The result type is inferred automatically
 * from the component's `modalResult` emit — no explicit type argument needed.
 *
 * If the component has no `modalResult` emit, the result type is `BaseModalResult`
 * (the modal can only be closed via `closeModal()` or `errorModal()`).
 *
 * Produces a compile-time error at the call site if the component has a
 * `modalResult` emit whose result type does not satisfy `{ type: string }`.
 *
 * `BaseModalResult` is automatically added to the result union since
 * `Modal.vue` can always produce `empty` (backdrop click / closeModal()) or
 * `error` (thrown / errorModal()).
 *
 * Usage:
 *   export const myModal = defineModal('my-modal', () => import('./MyModal.vue'), {
 *     kind: 'card',
 *     width: 'max-w-140',
 *     title: () => phrase.value.my_modal,
 *   });
 */
export function defineModal<TComponent extends Component>(
  name: string,
  component: () => Promise<{ default: TComponent }>,
  ...frame: [ExtractModalResult<TComponent>] extends [{ type: string }]
    ? [frame?: ModalFrame<ExtractModalData<TComponent>>]
    : ['ERROR: modalResult emit result type must satisfy { type: string }']
): [ExtractModalResult<TComponent>] extends [never]
  ? ModalDescriptor<BaseModalResult, TComponent>
  : ModalDescriptor<
      ExtractModalResult<TComponent> | BaseModalResult,
      TComponent
    > {
  return { name, component, frame: frame[0] } as any;
}

export interface ActiveModal {
  id: number;
  name: string;
  /** Absent until the modal's code has loaded; its frame's shell meanwhile. */
  component?: Component;
  frame?: ModalFrame;
  props: Record<string, unknown>;
  /** Element that opened this modal and should regain focus on return. */
  returnFocus?: {
    isConnected: boolean;
    focus: (options?: FocusOptions) => void;
  };
  /** Called by the modal component itself via @modalResult — accepts the full result type. */
  resolve: (result: { type: string }) => void;
  /** Called externally to force-close the modal — restricted to base results only. */
  close: (result: BaseModalResult) => void;
  /** Optional synchronous check run before user-initiated dismissal. */
  closeGuard?: () => boolean;
  /** Keep the modal, focus and scroll lock alive until its exit animation ends. */
  leaveTransition?: () => Promise<void>;
  leaving?: Promise<void>;
}

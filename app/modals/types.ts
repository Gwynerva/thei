import { type Component } from 'vue';

interface ModalResultEmpty {
  type: 'empty';
}

interface ModalResultError {
  type: 'error';
  message: string;
}

export type BaseModalResult = ModalResultEmpty | ModalResultError;

/**
 * Expands a custom result type into the full modal result union by adding
 * the base results (empty, error) that every modal can produce.
 *
 * Use this in modal components to type the `@modalResult` emit.
 */
export type ModalResultOf<T extends { type: string }> = T | BaseModalResult;
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

export interface ModalDescriptor<
  TResult extends { type: string },
  TComponent extends Component = Component,
> {
  name: string;
  component: () => Promise<{ default: TComponent }>;
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
 *   export const myModal = defineModal('my-modal', () => import('./MyModal.vue'));
 */
export function defineModal<TComponent extends Component>(
  name: string,
  component: () => Promise<{ default: TComponent }>,
  ..._: [ExtractModalResult<TComponent>] extends [{ type: string }]
    ? []
    : ['ERROR: modalResult emit result type must satisfy { type: string }']
): [ExtractModalResult<TComponent>] extends [never]
  ? ModalDescriptor<BaseModalResult, TComponent>
  : ModalDescriptor<
      ExtractModalResult<TComponent> | BaseModalResult,
      TComponent
    > {
  return { name, component } as any;
}

export interface ActiveModal {
  name: string;
  component: Component;
  props: Record<string, unknown>;
  /** Called by the modal component itself via @modalResult — accepts the full result type. */
  resolve: (result: { type: string }) => void;
  /** Called externally to force-close the modal — restricted to base results only. */
  close: (result: BaseModalResult) => void;
}

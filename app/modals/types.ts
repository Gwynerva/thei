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
 * Use this in modal components to type the `@complete` emit.
 */
export type ModalResultOf<T extends { type: string }> = T | BaseModalResult;
/**
 * Extracts the type of the `modalData` prop from a Vue component.
 * Resolves to `never` when the component declares no such prop.
 */
export type ExtractModalData<TComponent extends Component> =
  TComponent extends abstract new (...args: any[]) => { $props: infer P }
    ? 'modalData' extends keyof P
      ? NonNullable<P[keyof P & 'modalData']>
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
 * Create a typed modal descriptor with full result and props inference.
 *
 * TypeScript doesn't allow partial type argument inference in a single call, so
 * this is curried: pass name + component first so TComponent is inferred
 * automatically, then specify TResult explicitly in the second call.
 *
 * Usage:
 *   export const myModal = defineModal('my-modal', () => import('./MyModal.vue'))<MyResult>();
 */
export function defineModal<TComponent extends Component>(
  name: string,
  component: () => Promise<{ default: TComponent }>,
) {
  return <TResult extends { type: string }>(): ModalDescriptor<
    TResult | BaseModalResult,
    TComponent
  > => ({
    name,
    component,
  });
}

export interface ActiveModal {
  name: string;
  component: Component;
  props: Record<string, unknown>;
  /** Called by the modal component itself via @complete — accepts the full result type. */
  resolve: (result: { type: string }) => void;
  /** Called externally to force-close the modal — restricted to base results only. */
  close: (result: BaseModalResult) => void;
}

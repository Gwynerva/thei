import { expectTypeOf, test } from 'vitest';
import type { Component } from 'vue';
import {
  defineModal,
  type BaseModalResult,
  type ExtractModalData,
  type ExtractModalResult,
  type ModalDescriptor,
} from '../../../app/modals/types';

// ─── Synthetic component shapes ──────────────────────────────────────────────
// Avoids importing .vue files so plain tsc can typecheck without vue-tsc.

type WithDataAndEmit = abstract new (...args: any[]) => {
  $props: {
    modalData: { label: string; count: number };
    onModalResult?: (
      result: { type: 'picked'; id: number } | BaseModalResult,
    ) => void;
  };
};

type WithEmitOnly = abstract new (...args: any[]) => {
  $props: {
    onModalResult?: (result: { type: 'done' } | BaseModalResult) => void;
  };
};

type WithDataOnly = abstract new (...args: any[]) => {
  $props: {
    modalData: { x: string };
  };
};

// ─── ExtractModalResult ───────────────────────────────────────────────────────

test('ExtractModalResult extracts result from onModalResult prop', () => {
  expectTypeOf<ExtractModalResult<WithDataAndEmit & Component>>().toEqualTypeOf<
    { type: 'picked'; id: number } | BaseModalResult
  >();
});

test('ExtractModalResult returns never when onModalResult prop is absent', () => {
  expectTypeOf<ExtractModalResult<WithDataOnly & Component>>().toBeNever();
});

// ─── ExtractModalData ─────────────────────────────────────────────────────────

test('ExtractModalData extracts type from modalData prop', () => {
  expectTypeOf<ExtractModalData<WithDataAndEmit & Component>>().toEqualTypeOf<{
    label: string;
    count: number;
  }>();
});

test('ExtractModalData returns never when modalData prop is absent', () => {
  expectTypeOf<ExtractModalData<WithEmitOnly & Component>>().toBeNever();
});

// ─── defineModal ─────────────────────────────────────────────────────────────

test('defineModal infers result type from modalResult emit', () => {
  const modal = defineModal('test', () =>
    Promise.resolve({ default: {} as WithDataAndEmit & Component }),
  );
  type Result = NonNullable<(typeof modal)['_result']>;
  expectTypeOf<Result>().toEqualTypeOf<
    { type: 'picked'; id: number } | BaseModalResult
  >();
});

test('defineModal adds BaseModalResult when component emit omits it', () => {
  type EmitRaw = abstract new (...args: any[]) => {
    $props: { onModalResult?: (result: { type: 'done' }) => void };
  };
  const modal = defineModal('test', () =>
    Promise.resolve({ default: {} as EmitRaw & Component }),
  );
  type Result = NonNullable<(typeof modal)['_result']>;
  expectTypeOf<Result>().toEqualTypeOf<{ type: 'done' } | BaseModalResult>();
});

test('defineModal returns ModalDescriptor<BaseModalResult> for component without modalResult emit', () => {
  type Result = ReturnType<typeof defineModal<WithDataOnly & Component>>;
  expectTypeOf<Result>().toEqualTypeOf<
    ModalDescriptor<BaseModalResult, WithDataOnly & Component>
  >();
});

test('defineModal returns never for component with invalid modalResult emit', () => {
  type InvalidEmit = abstract new (...args: any[]) => {
    $props: { onModalResult?: (result: string) => void }; // string doesn't satisfy { type: string }
  };
  type Result = ReturnType<typeof defineModal<InvalidEmit & Component>>;
  expectTypeOf<Result>().toBeNever();
});

test('defineModal descriptor satisfies ModalDescriptor shape', () => {
  const modal = defineModal('test', () =>
    Promise.resolve({ default: {} as WithDataAndEmit & Component }),
  );
  expectTypeOf(modal).toMatchTypeOf<
    ModalDescriptor<{ type: 'picked'; id: number } | BaseModalResult>
  >();
});

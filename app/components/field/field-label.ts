import {
  computed,
  inject,
  onBeforeUnmount,
  provide,
  ref,
  useId,
  type InjectionKey,
  type Ref,
} from 'vue';

/**
 * A field's label as the name of its control: the id its first `FieldLabel`
 * wears on its words, which a control the label names — a group of options
 * — points at (`aria-labelledby`) rather than be told the words again.
 */
interface FieldLabelName {
  id: string;
  /** Whether a label of the field wears the id. */
  worn: Ref<boolean>;
}

const FIELD_LABEL_NAME: InjectionKey<FieldLabelName> = Symbol(
  'thei-field-label-name',
);

/** A `Field`'s: the id its label wears. */
export function provideFieldLabelName() {
  provide(FIELD_LABEL_NAME, { id: useId(), worn: ref(false) });
}

/**
 * A `FieldLabel`'s: the id its words wear, for the first label of a field
 * alone — a field may hold others, under it, for its parts.
 */
export function wearFieldLabelName() {
  const name = inject(FIELD_LABEL_NAME, undefined);
  if (!name || name.worn.value) return undefined;
  name.worn.value = true;
  onBeforeUnmount(() => {
    name.worn.value = false;
  });
  return name.id;
}

/** The id of the label that names the field's control, while it has one. */
export function useFieldLabelName() {
  const name = inject(FIELD_LABEL_NAME, undefined);
  return computed(() => (name?.worn.value ? name.id : undefined));
}

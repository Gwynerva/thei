import { computed, ref, type Ref } from 'vue';

export interface SerializableStateOptions<T> {
  clone?: (value: T) => T;
  serialize?: (value: T) => string;
}

export function cloneSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function useSerializableState<T>(
  initialValue: T,
  options: SerializableStateOptions<T> = {},
) {
  const clone = options.clone ?? cloneSerializable;
  const serialize = options.serialize ?? JSON.stringify;
  const value = ref(clone(initialValue)) as Ref<T>;
  const savedSnapshot = ref(serialize(value.value));
  const currentSnapshot = computed(() => serialize(value.value));
  const isDirty = computed(() => currentSnapshot.value !== savedSnapshot.value);

  function markSaved(nextValue: T = value.value) {
    savedSnapshot.value = serialize(nextValue);
  }

  function reset() {
    value.value = clone(initialValue);
    markSaved();
  }

  return { value, isDirty, markSaved, reset };
}

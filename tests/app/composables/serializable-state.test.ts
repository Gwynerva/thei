import { describe, expect, it } from 'vitest';
import {
  cloneSerializable,
  useSerializableState,
} from '../../../app/composables/serializable-state';

describe('useSerializableState', () => {
  it('tracks changes, reversions, saved snapshots, and resets', () => {
    const initial = { title: 'Initial', nested: { private: false } };
    const draft = useSerializableState(initial);

    expect(draft.isDirty.value).toBe(false);
    draft.value.value.title = 'Changed';
    expect(draft.isDirty.value).toBe(true);
    draft.value.value.title = 'Initial';
    expect(draft.isDirty.value).toBe(false);

    draft.value.value.nested.private = true;
    draft.markSaved();
    expect(draft.isDirty.value).toBe(false);
    draft.value.value.title = 'Another';
    draft.reset();
    expect(draft.value.value).toEqual(initial);
    expect(draft.isDirty.value).toBe(false);
  });

  it('deep-clones serializable source values', () => {
    const source = { nested: { value: 1 } };
    const cloned = cloneSerializable(source);
    cloned.nested.value = 2;
    expect(source.nested.value).toBe(1);
  });

  it('supports semantic serializers that ignore service metadata', () => {
    const draft = useSerializableState(
      { time: 1, blocks: [{ id: 'a', text: 'Hello' }] },
      {
        serialize: (value) =>
          JSON.stringify(value.blocks.map(({ id: _id, ...block }) => block)),
      },
    );

    draft.value.value.time = 2;
    draft.value.value.blocks[0]!.id = 'b';
    expect(draft.isDirty.value).toBe(false);
    draft.value.value.blocks[0]!.text = 'Changed';
    expect(draft.isDirty.value).toBe(true);
  });
});

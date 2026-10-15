import type { InjectionKey, Ref } from 'vue';
import type { AiOfferPlace } from '#layers/thei/shared/ai-entity';

/**
 * What an AI proposes for a field of an entity's form waits at the field's
 * label: the label turns accent and a ✦ beside it opens the proposal. The
 * field names its place in the form (`<Field ai="field:title">`), or what
 * is inside it claims one — a text's editor, which also opens a text edit
 * on its own screen. A field with no label shows it at its switch.
 */
export interface FieldAi {
  place: Readonly<Ref<AiOfferPlace | undefined>>;
  /** Opens a text edit in the text's own editor. */
  open: Readonly<Ref<((actionUuid: string) => void) | undefined>>;
  /** Claims the field's place for what is inside it; returns letting go. */
  claim(place: AiOfferPlace, open?: (actionUuid: string) => void): () => void;
  /** The field has a label, which shows the proposals rather than a switch. */
  labelled: Ref<boolean>;
}

const FIELD_AI: InjectionKey<FieldAi> = Symbol('field-ai');

export function provideFieldAi(named: () => AiOfferPlace | undefined): FieldAi {
  const claimed = shallowRef<AiOfferPlace>();
  const open = shallowRef<(actionUuid: string) => void>();
  const field: FieldAi = {
    place: computed(() => claimed.value ?? named()),
    open,
    claim(place, opener) {
      claimed.value = place;
      open.value = opener;
      return () => {
        if (claimed.value !== place) return;
        claimed.value = undefined;
        open.value = undefined;
      };
    },
    labelled: ref(false),
  };
  provide(FIELD_AI, field);
  return field;
}

export function useFieldAi(): FieldAi | undefined {
  return inject(FIELD_AI, undefined);
}

/**
 * The place whose proposals this label — or this switch, in a field with no
 * label — shows, and whether any wait there.
 */
export function useFieldOffers(as: 'label' | 'switch') {
  const field = useFieldAi();
  if (field && as === 'label') field.labelled.value = true;
  const ai = useEntityAi();
  const place = computed(() =>
    field && !(as === 'switch' && field.labelled.value)
      ? field.place.value
      : undefined,
  );
  const offered = computed(
    () =>
      Boolean(place.value && ai?.shown.value) &&
      ai!.offersAt(place.value!).length > 0,
  );
  return { place, offered };
}

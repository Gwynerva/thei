<script lang="ts" setup>
/**
 * A form's main action, at the end of its sticky header: its words —
 * «Сохранить», «Сохранено», «Создать». On a phone, where the header holds a
 * title and a few squares, it is a square with a floppy disk, named by the
 * same words — and a check once all of the form is saved, so a pale
 * square never has to be read as «saved».
 */
const props = defineProps<{
  label: string;
  saving?: boolean;
  /** Nothing to do: all of it saved, or a save under way. */
  disabled?: boolean;
  /** Everything in the form is saved: nothing left to save. */
  done?: boolean;
  /**
   * Why the form cannot be saved yet (`useFormNeeds`), a line per need. The
   * button looks disabled but stays pressable: a press — a tap on a phone,
   * where no hint shows and no Ctrl+S exists — is the form's to answer, by
   * saying the same under its header. The reason is also its hint, the label
   * in bold over it, and what a screen reader hears with it.
   */
  reason?: string;
}>();

const reasonId = useId();
const blocked = computed(() => Boolean(!props.disabled && props.reason));
const hint = computed(() =>
  blocked.value
    ? titlePopup(
        { text: props.label, bold: true },
        ...props.reason!.split('\n').map((text) => ({ text, italic: true })),
      )
    : {},
);
</script>

<template>
  <Button
    class="flex h-9 shrink-0 items-center justify-center gap-xs font-semibold
      max-sm:w-9 max-sm:px-0 max-sm:text-base pointer-coarse:h-11
      max-sm:pointer-coarse:w-11"
    :disabled
    :aria-disabled="blocked ? 'true' : undefined"
    :aria-label="label"
    :aria-describedby="blocked ? reasonId : undefined"
    :data-admin-save="done ? 'done' : blocked ? 'blocked' : ''"
    v-bind="hint"
  >
    <Icon v-if="saving" name="loading" class="shrink-0" />
    <!-- Both squares stay in the page, one hidden: an icon pointed
         elsewhere while the owner types ends the browser's run of typing. -->
    <template v-else>
      <Icon name="save" class="shrink-0 sm:hidden" :class="{ hidden: done }" />
      <Icon
        name="check"
        class="shrink-0 sm:hidden"
        :class="{ hidden: !done }"
      />
    </template>
    <span class="max-sm:hidden">{{ label }}</span>
    <span v-if="blocked" :id="reasonId" hidden>{{ reason }}</span>
  </Button>
</template>

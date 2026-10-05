<script lang="ts" setup>
import type { IconName } from '#thei/icons';
import type { MediaDescriptor } from '#layers/thei/shared/media';

/**
 * One file or link in a compact list. It shows its text as given: the caller
 * knows whose words they are, and formats the owner's (`publicText`).
 *
 * The title takes one line and the description two, each cut with an
 * ellipsis where it runs out of room. Whatever is cut is in the item's popup
 * in full, which says nothing when nothing is cut.
 */
const props = withDefaults(
  defineProps<{
    title: string;
    description?: string;
    href?: string;
    icon?: IconName;
    iconMedia?: MediaDescriptor;
    cornerIcon?: IconName;
    cornerTitle?: string;
    extension?: string;
    external?: boolean;
    /** A file that is saved rather than opened: the link downloads it. */
    download?: boolean;
    button?: boolean;
    /**
     * A link stands for an address, not for a file: it gets the icon without
     * the tile behind it, so a list of links reads lighter than a list of
     * files sitting next to it.
     */
    plainIcon?: boolean;
    continuousMedia?: boolean;
    /** A codename for something hidden from visitors; never a link. */
    secret?: boolean;
    /**
     * The owner's note on why this link is here. It is a line of its own
     * under the description, in italics, never a replacement for what the
     * target says of itself.
     */
    note?: string;
  }>(),
  { icon: 'link' },
);
defineEmits<{ activate: [] }>();

function oneLine(value: string | undefined) {
  return value?.replace(/\s+/g, ' ').trim() || undefined;
}

const description = computed(() => oneLine(props.description));
const note = computed(() => oneLine(props.note));
/** A note takes a line from the description, so an item keeps its height. */
const descriptionClamp = computed(() =>
  note.value ? 'line-clamp-1' : 'line-clamp-2',
);
const popup = computed(() => ({
  ...titlePopup(
    { text: props.title, bold: true },
    TITLE_POPUP_GAP,
    description.value,
    TITLE_POPUP_GAP,
    note.value && { text: note.value, italic: true },
  ),
  // The popup repeats what is shown, so it only speaks when something is cut.
  'data-title-popup-clipped': '',
}));

const extensionFontSize = computed(() => {
  const length = props.extension?.length ?? 0;
  if (length <= 1) return '42cqw';
  if (length === 2) return '36cqw';
  if (length === 3) return '31cqw';
  if (length === 4) return '26cqw';
  return '22cqw';
});
</script>

<template>
  <component
    :is="button ? 'button' : href ? 'a' : 'div'"
    :href="!button ? href : undefined"
    :target="!button && external && !download ? '_blank' : undefined"
    :rel="!button && external ? 'noopener noreferrer' : undefined"
    :download="!button && href && download ? '' : undefined"
    :type="button ? 'button' : undefined"
    class="group flex w-full min-w-0 items-start gap-xs rounded-sm px-1 py-1.5
      text-left text-text-1 no-underline transition focus-visible:ring-2
      focus-visible:ring-accent focus-visible:outline-none"
    :class="{ 'cursor-pointer hocus:bg-bg-3/70': button || href }"
    :data-public-secret="secret || undefined"
    v-bind="popup"
    @click="button ? $emit('activate') : undefined"
  >
    <span
      class="@container relative flex size-8 shrink-0 items-center
        justify-center overflow-hidden rounded-sm text-text-3"
      :class="
        plainIcon
          ? 'text-text-2'
          : extension && !iconMedia
            ? 'bg-bg-3/70'
            : 'bg-bg-3'
      "
    >
      <Media
        v-if="iconMedia"
        v-bind="iconMedia"
        :playback="continuousMedia ? 'autoplay' : undefined"
        :autoplay-reduced-motion="continuousMedia"
        :loop="continuousMedia"
        :muted="continuousMedia"
        class="size-full"
      />
      <span
        v-else-if="extension"
        class="max-w-full truncate font-mono text-(length:--extension-size)
          leading-none font-bold tracking-tight whitespace-nowrap text-text-2
          uppercase"
        :style="{ '--extension-size': extensionFontSize }"
        aria-hidden="true"
      >
        {{ extension }}
      </span>
      <Icon v-else :name="icon" />
      <span
        v-if="cornerIcon"
        class="absolute right-0 bottom-0 z-2 flex size-4 cursor-help
          items-center justify-center rounded-tl-sm bg-bg-1 text-xs text-accent"
        :data-title-popup="cornerTitle"
      >
        <Icon :name="cornerIcon" />
      </span>
    </span>
    <span class="min-w-0 flex-1">
      <strong
        class="block truncate text-sm font-normal"
        :class="{ 'text-text-2 italic': secret }"
        data-title-popup-clip
        >{{ title }}</strong
      >
      <span
        v-if="description"
        class="text-xs text-text-3"
        :class="descriptionClamp"
        data-title-popup-clip
        >{{ description }}</span
      >
      <span
        v-if="note"
        class="mt-0.5 line-clamp-2 text-xs text-text-2 italic"
        data-title-popup-clip
        >{{ note }}</span
      >
    </span>
  </component>
</template>

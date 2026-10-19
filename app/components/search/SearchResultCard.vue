<script lang="ts" setup>
import type { SearchFind, SearchHit } from '#layers/thei/shared/search/api';
import { imageAccentCssColor } from '#layers/thei/shared/accent-color';

/**
 * One result of the search page, of any kind, in one shape. The head says
 * what it is — its kind and time, its title, its description — with its
 * picture dissolving in from the right, or a file's own preview. Under the
 * head, the full width of the card, the places the words were found at,
 * each leading straight to its place; a line between every part.
 *
 * The head is no link itself, so its badges keep their own hints; a link
 * lies over the whole of it. The places beyond the first few open under
 * them, asked for as the search read `query`.
 */
const props = defineProps<{
  hit: SearchHit;
  query: string;
  /** Its places opened at once, and the card brought into view. */
  opened?: boolean;
}>();
const root = useTemplateRef<HTMLElement>('root');

const size = useHumanSize();
const title = computed(() => searchHitTitle(props.hit));
const when = computed(() => searchHitWhen(props.hit));
const access = computed(() => searchAccessBadge(props.hit.access));
const isFile = computed(() => props.hit.kind === 'file');
const facts = computed(() =>
  props.hit.file ? searchFileFacts(props.hit.file, size) : '',
);
/**
 * The places found, but those the head already shows: the title and the
 * description of the result itself.
 */
const all = shallowRef<{ finds: SearchFind[]; more: number } | null>(null);
const open = ref(false);
const opening = ref(false);
const failed = ref(false);
const more = computed(() =>
  open.value && all.value ? all.value.more : props.hit.more,
);

/** The rest of the places: asked for once, then shown or folded away. */
async function toggle() {
  if (open.value) {
    open.value = false;
    return;
  }
  if (!all.value) {
    opening.value = true;
    failed.value = false;
    try {
      all.value = await $fetch<{ finds: SearchFind[]; more: number }>(
        '/api/search/finds',
        {
          query: { q: props.query, ref: props.hit.ref, typing: '1' },
        },
      );
    } catch {
      failed.value = true;
      return;
    } finally {
      opening.value = false;
    }
  }
  open.value = true;
}

// Brought into view once open: after the page's own scroll to its top, which
// a new page makes once it is in.
onMounted(async () => {
  if (!props.opened || !props.hit.more) return;
  await toggle();
  await new Promise((resolve) => requestAnimationFrame(resolve));
  root.value?.scrollIntoView({ block: 'start', behavior: 'smooth' });
});

const finds = computed(() =>
  (open.value && all.value ? all.value.finds : props.hit.finds).filter(
    (find) => {
      if (find.place?.section || find.label) return true;
      if (find.where === 'title') return false;
      const description =
        find.where === 'summary' ||
        (props.hit.kind === 'file' && find.where === 'file');
      return !(description && props.hit.summary);
    },
  ),
);
const accent = computed(() =>
  imageAccentCssColor(props.hit.media?.accent, 'var(--color-accent)'),
);
</script>

<template>
  <article
    ref="root"
    class="flex min-w-0 scroll-mt-[var(--public-anchor-offset,8rem)] flex-col
      overflow-hidden rounded-normal border border-border-1 bg-bg-2 text-text-1
      shadow-md shadow-shadow-1"
    :style="{ '--card-accent': accent }"
  >
    <MediaInteraction v-slot="{ engaged, events }">
      <div
        v-on="events"
        class="group relative isolate flex min-h-24 min-w-0 items-center"
      >
        <MediaEdge
          v-if="!isFile"
          :media="hit.media"
          side="right"
          fade="card"
          playback="interaction"
          :engaged
          :loop="hit.kind === 'project'"
          :muted="hit.kind === 'project'"
          media-class="opacity-75 transition duration-300 group-hocus:opacity-90
            group-has-focus-visible:opacity-90 motion-reduce:duration-150"
          class="w-full"
        >
          <span
            class="flex size-full items-center justify-end pr-md text-6xl
              text-text-3/25"
          >
            <Icon :name="SEARCH_KIND_ICONS[hit.kind]" />
          </span>
        </MediaEdge>
        <TheiLink
          :to="hit.href"
          :aria-label="title"
          class="absolute inset-0 z-1 focus-visible:ring-2
            focus-visible:ring-accent focus-visible:ring-inset"
        />
        <div
          class="pointer-events-none relative z-2 flex min-w-0 flex-1 flex-col
            justify-center gap-1 p-sm sm:px-md"
          :class="
            isFile
              ? ''
              : ['max-w-4/5 sm:max-w-3/4', { 'text-halo-bg-2': hit.media }]
          "
        >
          <span
            class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs
              font-semibold text-accent/70"
          >
            <span class="flex items-center gap-1.5">
              <Icon :name="SEARCH_KIND_ICONS[hit.kind]" class="shrink-0" />
              <span>{{ phrase.search_kind(hit.kind) }}</span>
            </span>
            <span v-if="when" class="text-text-3">{{ when }}</span>
            <span v-if="facts" class="text-text-3">{{ facts }}</span>
            <Icon
              v-if="hit.showcase"
              name="star"
              :aria-label="phrase.showcase"
              role="img"
              class="pointer-events-auto relative z-3 shrink-0 cursor-help"
              :data-title-popup="phrase.showcase"
            />
            <Icon
              v-if="hit.cv"
              name="case-important"
              :aria-label="phrase.cv_project_label"
              role="img"
              class="pointer-events-auto relative z-3 shrink-0 cursor-help"
              :data-title-popup="phrase.cv_project_label"
            />
            <Icon
              v-if="hit.reminder"
              name="warning"
              :aria-label="phrase.entity_reminder_badge"
              role="img"
              class="pointer-events-auto relative z-3 shrink-0 cursor-help
                text-text-warning"
              v-bind="
                reminderTitlePopup(
                  phrase.entity_reminder_badge,
                  publicText(hit.reminder),
                )
              "
            />
            <Icon
              v-if="access"
              :name="access.icon"
              :aria-label="access.text"
              role="img"
              class="pointer-events-auto relative z-3 shrink-0 cursor-help
                text-text-2"
              :data-title-popup="access.text"
            />
            <TheiLink
              v-if="hit.editHref"
              :to="hit.editHref"
              :aria-label="phrase.search_edit"
              :data-title-popup="phrase.search_edit"
              class="pointer-events-auto relative z-3 -my-1 flex size-6
                items-center justify-center rounded-sm text-text-3 transition
                focus-visible:ring-2 focus-visible:ring-accent
                focus-visible:outline-none hocus:bg-bg-3 hocus:text-text-1"
            >
              <Icon name="edit" />
            </TheiLink>
          </span>
          <h3
            class="text-lg leading-snug font-bold tracking-tight wrap-break-word
              transition group-has-focus-visible:text-(--card-accent)
              group-hocus:text-(--card-accent)"
          >
            {{ title }}
          </h3>
          <!-- Room for the halo on either side: clamping clips it otherwise,
               and a clipped halo draws a hard seam across the media. -->
          <p
            v-if="hit.summary && !searchTitleIsSummary(hit)"
            class="-mx-[0.75em] line-clamp-2 px-[0.75em] text-sm leading-relaxed
              font-semibold text-text-2"
          >
            {{ publicText(hit.summary) }}
          </p>
        </div>
        <span
          v-if="isFile"
          class="pointer-events-none relative z-2 mr-sm flex size-18 shrink-0
            items-center justify-center overflow-hidden rounded-sm border
            border-border-1 bg-bg-3 text-3xl text-text-3 sm:mr-md sm:size-20"
        >
          <Media
            v-if="hit.media"
            v-bind="hit.media"
            playback="interaction"
            :engaged
            muted
            class="size-full"
          />
          <Icon v-else name="file" />
        </span>
      </div>
    </MediaInteraction>

    <ul
      v-if="finds.length || hit.more"
      class="divide-y divide-border-1 border-t border-border-1"
      :aria-busy="opening || undefined"
    >
      <li v-for="(find, at) in finds" :key="at">
        <TheiLink
          :to="find.href"
          class="flex min-w-0 items-center gap-sm px-sm py-xs no-underline
            transition focus-visible:ring-2 focus-visible:ring-accent
            focus-visible:ring-inset sm:px-md hocus:bg-bg-3/60"
        >
          <span class="flex min-w-0 flex-1 flex-col gap-0.5">
            <span class="flex min-w-0 items-center gap-1.5 text-xs text-text-3">
              <Icon :name="searchFindPlace(find).icon" class="shrink-0" />
              <span class="truncate">{{ searchFindPlace(find).text }}</span>
            </span>
            <SearchSnippet
              v-if="find.segments.length"
              :segments="find.segments"
              class="line-clamp-2 text-sm leading-relaxed text-text-2"
            />
          </span>
          <span
            v-if="find.media"
            class="size-10 shrink-0 overflow-hidden rounded-sm border
              border-border-1 bg-bg-3"
          >
            <Media v-bind="find.media" class="size-full" />
          </span>
        </TheiLink>
      </li>
      <!-- The places beyond the first few: opened here, under them, and
           folded away again. Past the most a card shows, the rest are only
           counted. -->
      <li v-if="hit.more">
        <button
          type="button"
          class="flex w-full cursor-pointer items-center gap-1.5 px-sm py-xs
            text-left text-xs text-text-3 italic transition focus-visible:ring-2
            focus-visible:ring-accent focus-visible:outline-none
            focus-visible:ring-inset sm:px-md hocus:bg-bg-3/60
            hocus:text-text-1"
          :aria-expanded="open"
          @click="toggle"
        >
          <Icon
            :name="open ? 'collapse-vertical' : 'subfolder-arrow'"
            class="shrink-0"
            :class="{ '-translate-y-[17%]': !open }"
            aria-hidden="true"
          />
          <span class="min-w-0 flex-1">{{
            open
              ? phrase.search_fewer_finds
              : phrase.search_more_finds(hit.more)
          }}</span>
          <Icon
            v-if="opening"
            name="loading"
            class="shrink-0 not-italic"
            aria-hidden="true"
          />
          <span
            v-else-if="failed"
            class="shrink-0 text-text-error not-italic"
            >{{ phrase.search_failed }}</span
          >
        </button>
      </li>
      <li
        v-if="open && more"
        class="px-sm py-xs text-xs text-text-3 italic sm:px-md"
      >
        {{ phrase.search_more_finds(more) }}
      </li>
    </ul>
  </article>
</template>

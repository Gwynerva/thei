<script lang="ts" setup>
import {
  isPublicSecret,
  type PublicReferenceLink,
  type PublicSecretReference,
} from '#layers/thei/shared/api/public';
import {
  contentEntityHasIcon,
  isContentEntityType,
} from '#layers/thei/shared/content-link';
import { entityTypeIcon } from '#layers/thei/shared/entity-icon';
import type { IconName } from '#thei/icons';
import { truncateExternalLinkText } from '#layers/thei/shared/external-link';
defineProps<{
  links: (PublicReferenceLink | PublicSecretReference)[];
  /** Leave the kind badge off the tiles, where the list already says it. */
  hideKind?: boolean;
}>();

const SIDEBAR_EXTERNAL_LINK_TEXT_LIMIT = 120;
function compactExternalLinkText(value?: string): string | undefined {
  return truncateExternalLinkText(value, SIDEBAR_EXTERNAL_LINK_TEXT_LIMIT);
}

/**
 * The badge in the corner of a tile names what is on the other end.
 *
 * In "Related" the relation's own direction is carried by the sub-list a tile
 * sits in, and in "Links" a tile may lead anywhere, so what a reader cannot
 * tell from a tile is what kind of thing it opens: a project, one of its
 * stages, an event, a diary entry, a page — or another site. A tile that
 * shows the kind's own glyph for want of a picture needs no badge repeating it.
 */
function entityIcon(type?: PublicReferenceLink['kind']): IconName | undefined {
  if (type === 'external') return 'external-link';
  if (isContentEntityType(type)) return entityTypeIcon(type);
}

function entityTitle(type?: PublicReferenceLink['kind']): string | undefined {
  if (type === 'external') return phrase.value.content_external_link;
  if (isContentEntityType(type)) return entityTypeLabel(type);
}

/** A diary entry is listed by its day, unless a note names it otherwise. */
function linkTitle(link: PublicReferenceLink) {
  return link.date
    ? entityDisplayTitle({ ...link, date: link.date })
    : link.title;
}
</script>

<template>
  <div v-if="links.length" class="flex min-w-0 flex-col gap-xs">
    <template
      v-for="link in links"
      :key="isPublicSecret(link) ? link.key : `${link.kind}:${link.href}`"
    >
      <PublicCompactResourceItem
        v-if="isPublicSecret(link)"
        :title="link.title"
        :description="link.summary"
        :icon-media="link.iconMedia"
        :corner-icon="hideKind ? undefined : entityIcon(link.entityType)"
        :corner-title="hideKind ? undefined : entityTitle(link.entityType)"
        icon="project"
        secret
      />
      <PublicCompactResourceItem
        v-else-if="link.kind !== 'external'"
        :title="linkTitle(link)"
        :description="link.description"
        :icon-media="link.iconMedia"
        :corner-icon="
          link.iconMedia && !hideKind ? entityIcon(link.kind) : undefined
        "
        :corner-title="hideKind ? undefined : entityTitle(link.kind)"
        :href="link.href"
        :icon="entityTypeIcon(link.kind)"
        :continuous-media="contentEntityHasIcon(link.kind)"
        plain-icon
      />
      <PublicCompactResourceItem
        v-else
        :title="compactExternalLinkText(link.title) ?? link.title"
        :description="link.description"
        :icon-media="link.iconMedia"
        :corner-icon="link.iconMedia ? entityIcon(link.kind) : undefined"
        :corner-title="entityTitle(link.kind)"
        :href="link.href"
        icon="external-link"
        external
        plain-icon
      />
    </template>
  </div>
</template>

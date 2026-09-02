<script lang="ts" setup>
import type { PublicReferenceLink } from '#layers/thei/shared/api/public';
import type { ProjectRelationType } from '#layers/thei/shared/admin/project';
import type { IconName } from '#thei/icons';
import { truncateExternalLinkText } from '#layers/thei/shared/external-link';
defineProps<{ links: PublicReferenceLink[] }>();

const SIDEBAR_EXTERNAL_LINK_TEXT_LIMIT = 120;
function compactExternalLinkText(value?: string): string | undefined {
  return truncateExternalLinkText(value, SIDEBAR_EXTERNAL_LINK_TEXT_LIMIT);
}

function relationIcon(type?: ProjectRelationType): IconName | undefined {
  if (type === 'related') return 'project-connection';
  if (type === 'influencing') return 'project-dependency';
  if (type === 'dependent') return 'project-dependent';
}

function relationTitle(type?: ProjectRelationType): string | undefined {
  if (type === 'related') return phrase.value.project_relation_related;
  if (type === 'influencing') return phrase.value.project_relation_influencing;
  if (type === 'dependent') return phrase.value.project_relation_dependent;
}
</script>

<template>
  <div v-if="links.length" class="flex min-w-0 flex-col gap-xs">
    <template v-for="link in links" :key="`${link.kind}:${link.href}`">
      <PublicCompactResourceItem
        v-if="link.kind !== 'external'"
        :title="link.title"
        :description="link.description"
        :icon-media="link.iconMedia"
        :corner-icon="relationIcon(link.relationType)"
        :corner-title="relationTitle(link.relationType)"
        :href="link.href"
        :icon="link.kind"
      />
      <PublicCompactResourceItem
        v-else
        :title="compactExternalLinkText(link.title) ?? link.title"
        :description="compactExternalLinkText(link.description)"
        :icon-media="link.iconMedia"
        :href="link.href"
        icon="external-link"
        external
      />
    </template>
  </div>
</template>

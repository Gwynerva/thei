import type { H3Event } from 'h3';
import type {
  ContentLinkApiResponse,
  ResolvedContentLink,
} from '#layers/thei/shared/content-link';
import { normalizeExternalLinkUrl } from '#layers/thei/shared/external-link';
import {
  buildAdminAssetUrls,
  buildPublicEventContentMedia,
  buildPublicPageMedia,
  buildPublicProjectMedia,
} from '../thei/assets/urls';
import { findExternalLink } from '../thei/external-links/repository';
import { persistExternalLink } from '../thei/external-links/preview';
import { resolveEntityIconMedia } from '../thei/media/generated-icon';
import { buildProjectUrl } from '#layers/thei/shared/project-url';
import { canResolveContentEntityLink } from '../thei/content-links/access';
import {
  buildContentPreview,
  contentBlockIsInPrivateSection,
  contentBlockIsPrivate,
  contentPrivateSectionRanges,
  normalizeContentData,
} from '#layers/thei/shared/content';
import { buildEventUrl } from '#layers/thei/shared/event-url';
import { buildPageUrl } from '#layers/thei/shared/page-url';

export default defineEventHandler(
  async (event): Promise<ContentLinkApiResponse> => {
    const query = getQuery(event);
    if (query.kind === 'project') {
      return await resolveProjectLink(event, query.projectUuid);
    }
    if (query.kind === 'event') {
      return await resolveEventLink(event, query.eventUuid);
    }
    if (query.kind === 'page') {
      return await resolvePageLink(event, query.pageUuid);
    }
    if (query.kind === 'external') {
      return await resolveExternalLink(event, query.url);
    }
    return {
      kind: 'external',
      url: typeof query.url === 'string' ? query.url : '',
      state: 'broken',
      reason: 'invalid',
    };
  },
);

async function resolveProjectLink(
  event: H3Event,
  value: unknown,
): Promise<ContentLinkApiResponse> {
  const projectUuid = typeof value === 'string' ? value.trim() : '';
  const reference = { kind: 'project' as const, projectUuid };
  const project = projectUuid
    ? await THEI_SERVER.projects.findByUuid(projectUuid)
    : undefined;
  const isAdmin = Boolean(event.context.isAdmin);
  if (!project || !canResolveContentEntityLink(project.access, isAdmin)) {
    if (project) return { state: 'restricted' };
    return { ...reference, state: 'broken', reason: 'not-found' };
  }

  const iconUsage = (
    await THEI_SERVER.assets.usages.findByContainer(
      'project',
      project.projectUuid,
    )
  ).find((usage) => usage.role === 'icon');
  const iconMedia = resolveEntityIconMedia(
    'project',
    project.projectUuid,
    iconUsage
      ? isAdmin
        ? (await buildAdminAssetUrls(iconUsage.asset)).media!
        : await buildPublicProjectMedia(project, iconUsage.asset, 'icon')
      : undefined,
  );

  return {
    ...reference,
    state: 'resolved',
    href: buildProjectUrl(project.humanReadableSlug, project.publicId),
    title: project.title,
    summary: project.summary,
    iconMedia,
  };
}

async function resolveEventLink(
  event: H3Event,
  value: unknown,
): Promise<ContentLinkApiResponse> {
  const eventUuid = typeof value === 'string' ? value.trim() : '';
  const reference = { kind: 'event' as const, eventUuid };
  const stored = eventUuid
    ? await THEI_SERVER.events.findByUuid(eventUuid)
    : undefined;
  if (!stored) return { ...reference, state: 'broken', reason: 'not-found' };
  const isAdmin = Boolean(event.context.isAdmin);
  if (!canResolveContentEntityLink(stored.access, isAdmin))
    return { state: 'restricted' };
  const previewMedia = isAdmin
    ? buildContentPreview(
        (
          await THEI_SERVER.content.buildFieldValue(
            'event',
            stored.eventUuid,
            'event-body',
          )
        )?.data,
      ).media
    : await publicEventPreviewMedia(stored);
  return {
    ...reference,
    state: 'resolved',
    href: buildEventUrl(stored.humanReadableSlug, stored.publicId),
    title: stored.title,
    summary: stored.summary,
    previewMedia,
  };
}

async function resolvePageLink(
  event: H3Event,
  value: unknown,
): Promise<ContentLinkApiResponse> {
  const pageUuid = typeof value === 'string' ? value.trim() : '';
  const reference = { kind: 'page' as const, pageUuid };
  const page = pageUuid
    ? await THEI_SERVER.pages.findByUuid(pageUuid)
    : undefined;
  if (!page) return { ...reference, state: 'broken', reason: 'not-found' };
  const isAdmin = Boolean(event.context.isAdmin);
  if (!canResolveContentEntityLink(page.access, isAdmin))
    return { state: 'restricted' };
  const icon = (
    await THEI_SERVER.assets.usages.findByContainer('page', page.pageUuid)
  ).find((usage) => usage.role === 'icon');
  return {
    ...reference,
    state: 'resolved',
    href: buildPageUrl(page.slug),
    title: page.title,
    summary: page.summary,
    iconMedia: resolveEntityIconMedia(
      'page',
      page.pageUuid,
      icon
        ? isAdmin
          ? (await buildAdminAssetUrls(icon.asset)).media!
          : await buildPublicPageMedia(page, icon.asset)
        : undefined,
    ),
  };
}

async function publicEventPreviewMedia(stored: {
  eventUuid: string;
  humanReadableSlug: string;
  publicId: string;
}) {
  const content = await THEI_SERVER.content.findByOwner(
    'event',
    stored.eventUuid,
    'event-body',
  );
  if (!content) return undefined;
  const data = normalizeContentData(content.data);
  const privateSectionRanges = contentPrivateSectionRanges(data);
  for (const [index, block] of data.blocks.entries()) {
    if (
      block.type === 'privateSectionBoundary' ||
      contentBlockIsPrivate(block) ||
      contentBlockIsInPrivateSection(privateSectionRanges, index)
    )
      continue;
    const assetUuid =
      block.type === 'contentMedia'
        ? (block.data as any).asset?.assetUuid
        : block.type === 'contentGallery'
          ? (block.data as any).items?.[0]?.asset?.assetUuid
          : undefined;
    if (!assetUuid) continue;
    const asset = await THEI_SERVER.assets.findByUuid(assetUuid);
    if (asset) return buildPublicEventContentMedia(stored, asset);
  }
  return undefined;
}

async function resolveExternalLink(
  event: H3Event,
  value: unknown,
): Promise<ResolvedContentLink> {
  let url: string;
  try {
    url = normalizeExternalLinkUrl(value);
  } catch {
    return {
      kind: 'external',
      url: typeof value === 'string' ? value : '',
      state: 'broken',
      reason: 'invalid',
    };
  }

  let link = await findExternalLink(url);
  if (!link && event.context.isAdmin) {
    link = await persistExternalLink(url).catch(() => undefined);
  }
  if (!link) {
    return {
      kind: 'external',
      url,
      href: url,
      state: 'broken',
      reason: 'unavailable',
    };
  }
  return {
    kind: 'external',
    url,
    state: 'resolved',
    href: url,
    title: link.title,
    description: link.description,
    iconMedia: link.faviconMedia,
  };
}

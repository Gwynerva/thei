import type { H3Event } from 'h3';
import type { ResolvedContentLink } from '#layers/thei/shared/content-link';
import { normalizeExternalLinkUrl } from '#layers/thei/shared/external-link';
import {
  buildAdminAssetUrls,
  buildPublicProjectMedia,
} from '../thei/assets/urls';
import { findExternalLink } from '../thei/external-links/repository';
import { persistExternalLink } from '../thei/external-links/preview';
import { resolveGeneratedIcon } from '../thei/media/generated-icon';
import { buildProjectUrl } from '#layers/thei/shared/project-url';
import { canResolveProjectContentLink } from '../thei/content-links/access';

export default defineEventHandler(
  async (event): Promise<ResolvedContentLink> => {
    const query = getQuery(event);
    if (query.kind === 'project') {
      return await resolveProjectLink(event, query.projectUuid);
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
): Promise<ResolvedContentLink> {
  const projectUuid = typeof value === 'string' ? value.trim() : '';
  const reference = { kind: 'project' as const, projectUuid };
  const project = projectUuid
    ? await THEI_SERVER.projects.findByUuid(projectUuid)
    : undefined;
  const isAdmin = Boolean(event.context.isAdmin);
  if (!project || !canResolveProjectContentLink(project.access, isAdmin)) {
    return { ...reference, state: 'broken', reason: 'not-found' };
  }

  const iconUsage = (
    await THEI_SERVER.assets.usages.findByContainer(
      'project',
      project.projectUuid,
    )
  ).find((usage) => usage.role === 'icon');
  const iconMedia = iconUsage
    ? isAdmin
      ? (await buildAdminAssetUrls(iconUsage.asset)).media!
      : await buildPublicProjectMedia(project, iconUsage.asset, 'icon')
    : resolveGeneratedIcon('project', project.projectUuid);

  return {
    ...reference,
    state: 'resolved',
    href: buildProjectUrl(project.humanReadableSlug, project.publicId),
    title: project.title,
    summary: project.summary,
    iconMedia,
  };
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

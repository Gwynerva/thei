import type { ProjectSearchItem } from '#layers/thei/shared/api/project';
import type {
  ContentLinkReference,
  ContentLinkResolver,
  ResolvedContentLink,
} from '#layers/thei/shared/content-link';
import {
  normalizeExternalLinkUrl,
  type ExternalLink,
} from '#layers/thei/shared/external-link';
import { buildProjectUrl } from '#layers/thei/shared/project-url';

export function createAdminContentLinkResolver(): ContentLinkResolver {
  const resolved = new Map<string, ResolvedContentLink>();
  const pending = new Map<string, Promise<ResolvedContentLink>>();

  return async (reference) => {
    const key = referenceKey(reference);
    const cached = resolved.get(key);
    if (cached) return cached;

    let request = pending.get(key);
    if (!request) {
      request = resolveReference(reference).then((result) => {
        pending.delete(key);
        if (result.state === 'resolved') resolved.set(key, result);
        return result;
      });
      pending.set(key, request);
    }
    return await request;
  };
}

async function resolveReference(
  reference: ContentLinkReference,
): Promise<ResolvedContentLink> {
  if (reference.kind === 'project') {
    try {
      const projects = await $fetch<ProjectSearchItem[]>(
        '/api/admin/projects',
        {
          query: { projectUuid: reference.projectUuid },
        },
      );
      const project = projects[0];
      if (!project) {
        return { ...reference, state: 'broken', reason: 'not-found' };
      }
      return {
        ...reference,
        state: 'resolved',
        href: buildProjectUrl(project.humanReadableSlug, project.publicId),
        title: project.title,
        summary: project.summary,
        iconMedia: project.iconMedia,
      };
    } catch {
      return { ...reference, state: 'broken', reason: 'unavailable' };
    }
  }

  let url: string;
  try {
    url = normalizeExternalLinkUrl(reference.url);
  } catch {
    return { ...reference, state: 'broken', reason: 'invalid' };
  }

  try {
    const link = await $fetch<ExternalLink>(
      '/api/admin/external-link-previews',
      { query: { url } },
    );
    return {
      kind: 'external',
      state: 'resolved',
      url,
      href: url,
      title: link.title,
      description: link.description,
      iconMedia: link.faviconMedia,
    };
  } catch {
    return {
      kind: 'external',
      state: 'broken',
      url,
      href: url,
      reason: 'unavailable',
    };
  }
}

function referenceKey(reference: ContentLinkReference) {
  return reference.kind === 'project'
    ? `project:${reference.projectUuid}`
    : `external:${reference.url}`;
}

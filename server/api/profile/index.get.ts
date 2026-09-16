import {
  PROFILE_ID,
  type PublicProfileResponse,
} from '#layers/thei/shared/profile';
import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import { and, eq, sql } from 'drizzle-orm';
import {
  getPinnedPages,
  getProfileHistory,
  getProfileIdentity,
  getProfileLinks,
} from '../../thei/profile';
import { buildPublicContentData } from '../../thei/public/content';
import {
  buildPublicEventSummary,
  buildPublicProjectReference,
  buildPublicProjectSummary,
  buildPublicTagListItems,
  canListPublicEntity,
} from '../../thei/public/entities';
import { buildSecretReference } from '../../thei/public/secret';

export default defineEventHandler(
  async (event): Promise<PublicProfileResponse> => {
    const isAdmin = await THEI_SERVER.isAdmin(event);
    const { db, schema } = THEI_SERVER.useDb();
    const identity = await getProfileIdentity();
    const p = identity.profile;
    // Recent items include those a visitor may not see: they are presented as
    // secrets, and the counters report the real totals.
    const allProjects = db
      .select()
      .from(schema.projects)
      .all()
      .sort((a, b) => b.updatedAt - a.updatedAt);
    const projects = allProjects.filter((p) =>
      canListPublicEntity(p.access, isAdmin),
    );
    const showcaseProjects = db
      .select()
      .from(schema.projects)
      .where(
        isAdmin
          ? eq(schema.projects.showcase, true)
          : and(
              eq(schema.projects.showcase, true),
              eq(schema.projects.access, ProjectEventAccessLevel.Public),
            ),
      )
      .orderBy(sql`random()`)
      .limit(12)
      .all();
    const allEvents = db
      .select()
      .from(schema.events)
      .all()
      .sort((a, b) => b.updatedAt - a.updatedAt);
    const events = allEvents.filter((p) =>
      canListPublicEntity(p.access, isAdmin),
    );
    const projectIds = new Set(projects.map((p) => p.projectUuid));
    const eventIds = new Set(events.map((p) => p.eventUuid));
    const usages = db.select().from(schema.tagUsages).all();
    const counts = new Map<
      string,
      { projectCount: number; eventCount: number }
    >();
    for (const usage of usages) {
      const count = counts.get(usage.tagUuid) ?? {
        projectCount: 0,
        eventCount: 0,
      };
      if (
        usage.containerType === 'project' &&
        projectIds.has(usage.containerId)
      )
        count.projectCount += 1;
      else if (
        usage.containerType === 'event' &&
        eventIds.has(usage.containerId)
      )
        count.eventCount += 1;
      counts.set(usage.tagUuid, count);
    }
    const tags = db
      .select()
      .from(schema.tags)
      .all()
      .map((tag) => ({
        tag,
        projectCount: counts.get(tag.tagUuid)?.projectCount ?? 0,
        eventCount: counts.get(tag.tagUuid)?.eventCount ?? 0,
      }))
      .filter((t) => t.projectCount + t.eventCount > 0)
      .sort(
        (a, b) =>
          b.projectCount + b.eventCount - a.projectCount - a.eventCount ||
          a.tag.title.localeCompare(b.tag.title),
      )
      .slice(0, 5);
    const [
      aboutContent,
      pinnedPages,
      externalLinks,
      avatars,
      statuses,
      projectItems,
      showcaseItems,
      eventItems,
      tagItems,
    ] = await Promise.all([
      buildPublicContentData(
        'profile',
        PROFILE_ID,
        'profile-about',
        { type: 'profile', title: p.displayName },
        isAdmin,
      ),
      getPinnedPages(),
      getProfileLinks(isAdmin),
      getProfileHistory('avatars', undefined, false, 1),
      getProfileHistory('statuses', undefined, false, 1),
      Promise.all(
        allProjects
          .slice(0, 3)
          .map((project) =>
            canListPublicEntity(project.access, isAdmin)
              ? buildPublicProjectSummary(project)
              : buildSecretReference('project', project.projectUuid),
          ),
      ),
      Promise.all(showcaseProjects.map(buildPublicProjectReference)),
      Promise.all(
        allEvents
          .slice(0, 3)
          .map((event) =>
            canListPublicEntity(event.access, isAdmin)
              ? buildPublicEventSummary(event, isAdmin)
              : buildSecretReference('event', event.eventUuid),
          ),
      ),
      buildPublicTagListItems(tags),
    ]);
    return {
      displayName: p.displayName,
      slogan: p.slogan,
      nickname: p.nickname,
      birthDate: p.birthDate,
      facts: p.facts,
      avatarMedia: identity.avatarMedia,
      bannerMedia: identity.bannerMedia,
      faviconMedia: identity.faviconMedia,
      avatarCount: avatars.total,
      currentStatus: statuses.items[0],
      statusCount: statuses.total,
      aboutContent,
      pinnedPages,
      externalLinks,
      showcaseProjects: showcaseItems,
      projects: { count: allProjects.length, items: projectItems },
      events: { count: allEvents.length, items: eventItems },
      tags: tagItems,
    };
  },
);

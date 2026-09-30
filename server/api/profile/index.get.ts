import {
  PROFILE_ID,
  type PublicProfileResponse,
} from '#layers/thei/shared/profile';
import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import { publicContentPlainText } from '#layers/thei/shared/content';
import { buildSeoDescription } from '#layers/thei/shared/seo-description';
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
  buildPublicEntityReference,
  buildPublicProjectSummary,
  buildPublicTagListItems,
  canListPublicEntity,
} from '../../thei/public/entities';
import { siteViewer } from '../../thei/access-links/viewer';
import { buildSecretReference } from '../../thei/public/secret';
import { listPublicTagCounts } from '../../thei/public/tags';

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
    const tags = listPublicTagCounts(isAdmin)
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
      aboutRow,
    ] = await Promise.all([
      buildPublicContentData(
        'profile',
        PROFILE_ID,
        'profile-about',
        { type: 'profile', title: p.displayName },
        isAdmin,
        siteViewer(isAdmin),
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
              ? buildPublicProjectSummary(project, isAdmin)
              : buildSecretReference('project', project.projectUuid),
          ),
      ),
      Promise.all(showcaseProjects.map(buildPublicEntityReference)),
      Promise.all(
        allEvents
          .slice(0, 3)
          .map((event) =>
            canListPublicEntity(event.access, isAdmin)
              ? buildPublicEventSummary(event, siteViewer(isAdmin))
              : buildSecretReference('event', event.eventUuid),
          ),
      ),
      buildPublicTagListItems(tags),
      THEI_SERVER.content.findByOwner('profile', PROFILE_ID, 'profile-about'),
    ]);
    return {
      displayName: p.displayName,
      slogan: p.slogan,
      // Always the visitor's text, even when an admin is looking.
      seoDescription: buildSeoDescription([
        p.slogan,
        aboutRow ? publicContentPlainText(aboutRow.data, 'prose') : '',
      ]),
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

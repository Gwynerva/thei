import {
  PROFILE_ID,
  type PublicProfileResponse,
} from '#layers/thei/shared/profile';
import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import { publicContentPlainText } from '#layers/thei/shared/content';
import { buildSeoDescription } from '#layers/thei/shared/seo-description';
import { and, count, eq, sql } from 'drizzle-orm';
import {
  getPinnedPages,
  getProfileHistory,
  getProfileIdentity,
  getProfileLinks,
} from '../../thei/profile';
import { buildPublicContentData } from '../../thei/public/content';
import {
  buildPublicEntityReference,
  buildPublicTagListItems,
} from '../../thei/public/entities';
import { siteViewer } from '../../thei/access-links/viewer';
import { listPublicTagCountsByUse } from '../../thei/public/tags';

export default defineEventHandler(
  async (event): Promise<PublicProfileResponse> => {
    const isAdmin = await THEI_SERVER.isAdmin(event);
    const { db, schema } = THEI_SERVER.useDb();
    const identity = await getProfileIdentity();
    const p = identity.profile;
    // The counters report the real totals, private entries included.
    const total = (
      table:
        | typeof schema.projects
        | typeof schema.events
        | typeof schema.diaryEntries,
    ) => db.select({ value: count() }).from(table).get()?.value ?? 0;
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
    const tags = listPublicTagCountsByUse(isAdmin).slice(0, 5);
    const [
      aboutContent,
      pinnedPages,
      externalLinks,
      avatars,
      statuses,
      showcaseItems,
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
      Promise.all(showcaseProjects.map(buildPublicEntityReference)),
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
      counts: {
        projects: total(schema.projects),
        events: total(schema.events),
        diaryEntries: total(schema.diaryEntries),
      },
      tags: tagItems,
    };
  },
);

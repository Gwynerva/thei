import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import { OG_LAYOUT_NAMES } from '#layers/thei/server/thei/og/design';
import { OG_TONES } from '#layers/thei/server/thei/og/palette';
import { OG_SERVICE_IDS } from '#layers/thei/server/thei/og/targets';

/**
 * Every card the playground's content has, on one page: the site, each
 * service page, and every entity a stranger may open. Each links to the same
 * card in every layout and tone. Playground-only, and only for the owner.
 */
export default defineEventHandler(async (event) => {
  if (!(await THEI_SERVER.isAdmin(event)))
    throw createError({ statusCode: 404 });
  const { db, schema } = THEI_SERVER.useDb();
  const open = (access: ProjectEventAccessLevel) =>
    access !== ProjectEventAccessLevel.Private;
  const projects = db
    .select()
    .from(schema.projects)
    .all()
    .filter((project) => open(project.access));
  const openProjects = new Set(projects.map((project) => project.projectUuid));
  const cards: { kind: string; id: string; name: string }[] = [
    { kind: 'site', id: 'site', name: 'Site' },
    ...OG_SERVICE_IDS.map((id) => ({ kind: 'service', id, name: id })),
    ...projects.map((project) => ({
      kind: 'project',
      id: project.publicId,
      name: project.title,
    })),
    ...db
      .select()
      .from(schema.projectContentSections)
      .all()
      .filter(
        (section) =>
          !section.isPrivate && openProjects.has(section.projectUuid),
      )
      .map((section) => ({
        kind: 'section',
        id: section.publicId,
        name: section.title,
      })),
    ...db
      .select()
      .from(schema.events)
      .all()
      .filter((item) => open(item.access))
      .map((item) => ({ kind: 'event', id: item.publicId, name: item.title })),
    ...db
      .select()
      .from(schema.diaryEntries)
      .all()
      .filter((entry) => open(entry.access))
      .map((entry) => ({ kind: 'diary', id: entry.date, name: entry.date })),
    ...db
      .select()
      .from(schema.pages)
      .all()
      .filter((page) => open(page.access))
      .map((page) => ({ kind: 'page', id: page.slug, name: page.title })),
    ...db
      .select()
      .from(schema.tags)
      .all()
      .map((tag) => ({ kind: 'tag', id: tag.publicId, name: tag.title })),
  ];
  const escape = (text: string) =>
    text.replace(/[&<>"]/g, (character) => `&#${character.charCodeAt(0)};`);
  const variants = (kind: string, id: string) =>
    OG_LAYOUT_NAMES.flatMap((layout) =>
      OG_TONES.map(
        (tone) =>
          `<a href="/_og/${kind}/${encodeURIComponent(id)}.png?layout=${layout}&tone=${tone}">${layout}·${tone}</a>`,
      ),
    ).join(' ');
  setHeader(event, 'Content-Type', 'text/html; charset=utf-8');
  setHeader(event, 'Cache-Control', 'no-store');
  return `<!doctype html><meta charset="utf-8"><title>Open Graph cards</title>
<style>
body{margin:0;padding:24px;background:#16181c;color:#d8dbe0;font:14px system-ui,sans-serif}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(520px,1fr));gap:28px}
figure{margin:0}img{width:100%;aspect-ratio:1200/630;border-radius:10px;display:block;background:#222}
figcaption{margin-top:8px;line-height:1.4}details{color:#8b9099;font-size:12px}a{color:#8fb7ff}
</style><main>${cards
    .map(
      ({ kind, id, name }) =>
        `<figure><img src="/_og/${kind}/${encodeURIComponent(id)}.png" loading="lazy"><figcaption><b>${escape(kind)}</b> · ${escape(name)}<details><summary>Every layout and tone</summary>${variants(kind, id)}</details></figcaption></figure>`,
    )
    .join('\n')}</main>`;
});

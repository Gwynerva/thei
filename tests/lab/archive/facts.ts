// What a scenario may ask of an entity without knowing it: how long its text
// is, what it shows, how it is related. Computed from the archive; planted
// properties come from `plants.yaml` as traits.
import { resolveDay } from './dates';
import type { TextScan } from './dialect';
import type { Archive, ArchivePeriod } from './model';
import { archiveEntities, type ArchiveEntity } from './texts';

export type Facts = Record<string, number | boolean | string>;

function textFacts(scan: TextScan | undefined, prefix = ''): Facts {
  if (!scan) return { [`${prefix}words`]: 0 };
  const constructs = Object.fromEntries(scan.constructs);
  const n = (name: string) => constructs[name] ?? 0;
  return {
    [`${prefix}words`]: scan.words,
    [`${prefix}headings`]: n('heading-2') + n('heading-3'),
    [`${prefix}pictures`]: scan.files.filter(
      (file) => file.as === 'media' || file.as === 'gallery',
    ).length,
    [`${prefix}galleries`]: n('gallery'),
    [`${prefix}recordings`]: n('audio'),
    [`${prefix}fileGroups`]: n('files'),
    [`${prefix}attachments`]: n('file'),
    [`${prefix}privateParts`]: n('private'),
    [`${prefix}spoilers`]: n('spoiler'),
    [`${prefix}entityLinks`]: n('link-entity') + n('card'),
    [`${prefix}externalLinks`]: n('link-external') + n('link-card'),
    [`${prefix}hints`]: n('hint'),
    [`${prefix}lists`]:
      n('list-unordered') + n('list-ordered') + n('list-checklist'),
    [`${prefix}quotes`]: n('quote'),
  };
}

function periodFacts(periods: ArchivePeriod[], seedDay: string): Facts {
  const resolved = periods.map((period) => ({
    start: resolveDay(period.start, seedDay),
    end: resolveDay(period.end, seedDay),
  }));
  return {
    periods: periods.length,
    running: resolved.some(
      (period) => period.start <= seedDay && period.end > seedDay,
    ),
    firstDay: resolved.map((period) => period.start).sort()[0] ?? '',
    lastDay:
      resolved
        .map((period) => period.end)
        .sort()
        .at(-1) ?? '',
    labelledPeriods: periods.filter((period) => period.label).length,
    approximate: periods.some((period) => period.precision !== 'exact'),
  };
}

/** Facts of every entity, by ref. */
export function archiveFacts(
  archive: Archive,
  scans: Map<string, TextScan>,
  seedDay: string,
) {
  const relationCount = new Map<string, number>();
  const relate = (from: string, to: string) => {
    relationCount.set(from, (relationCount.get(from) ?? 0) + 1);
    relationCount.set(to, (relationCount.get(to) ?? 0) + 1);
  };
  for (const project of archive.projects)
    for (const r of project.relations) relate(`project:${project.id}`, r.to);
  for (const event of archive.events)
    for (const r of event.relations) relate(`event:${event.id}`, r.to);
  for (const entry of archive.diary)
    for (const r of entry.relations) relate(`diary:${entry.date}`, r.to);

  const mentions = new Map<string, number>();
  for (const scan of scans.values())
    for (const ref of scan.refs)
      mentions.set(ref.ref, (mentions.get(ref.ref) ?? 0) + 1);

  const facts = new Map<string, Facts>();
  const forEntity = (entity: ArchiveEntity): Facts => {
    const scan = scans.get(`${entity.ref}|body`);
    const common: Facts = {
      ...textFacts(scan),
      hasNotes: Boolean(scans.get(`${entity.ref}|notes`)),
      relations: relationCount.get(entity.ref) ?? 0,
      mentionedIn: mentions.get(entity.ref) ?? 0,
    };
    switch (entity.kind) {
      case 'project': {
        const project = entity.item;
        return {
          ...common,
          access: project.access,
          titleLength: Array.from(project.title).length,
          summaryLength: Array.from(project.summary).length,
          sections: project.sections.length,
          datedSections: project.sections.filter(
            (section) => section.periods.length,
          ).length,
          privateSections: project.sections.filter((section) => section.private)
            .length,
          tags: project.tags.length,
          files: project.files.length,
          showcase: project.showcase.length,
          links: project.links.length,
          statuses: project.statuses.length,
          hasIcon: Boolean(project.icon),
          hasBanner: Boolean(project.banner),
          hasAction: Boolean(project.action),
          featured: project.featured,
          cv: project.cv,
          running: project.sections.some(
            (section) => periodFacts(section.periods, seedDay).running,
          ),
        };
      }
      case 'section': {
        const section = entity.item;
        const project = archive.projects.find(
          (item) => item.id === section.project,
        )!;
        return {
          ...common,
          ...periodFacts(section.periods, seedDay),
          dated: section.periods.length > 0,
          private: section.private,
          projectAccess: project.access,
          hasBanner: Boolean(section.banner),
          titleLength: Array.from(section.title).length,
        };
      }
      case 'event': {
        const event = entity.item;
        return {
          ...common,
          ...periodFacts(event.periods, seedDay),
          access: event.access,
          titleLength: Array.from(event.title).length,
          summaryLength: Array.from(event.summary).length,
          tags: event.tags.length,
          files: event.files.length,
          links: event.links.length,
          hasBanner: Boolean(event.banner),
          hasAction: Boolean(event.action),
        };
      }
      case 'diary': {
        const day = resolveDay(entity.item.date, seedDay);
        return {
          ...common,
          access: entity.item.access,
          day,
          relative: entity.item.date.startsWith('today'),
          future: day > seedDay,
        };
      }
      case 'page':
        return {
          ...common,
          access: entity.item.access,
          titleLength: Array.from(entity.item.title).length,
          hasIcon: Boolean(entity.item.icon),
        };
      case 'tag': {
        const id = entity.item.id;
        return {
          synonyms: entity.item.synonyms.length,
          hasIcon: Boolean(entity.item.icon),
          usedBy:
            archive.projects.filter((project) => project.tags.includes(id))
              .length +
            archive.events.filter((event) => event.tags.includes(id)).length,
        };
      }
    }
  };
  for (const entity of archiveEntities(archive))
    facts.set(entity.ref, forEntity(entity));
  return facts;
}

/** Traits planted on each ref and file. */
export function archiveTraits(archive: Archive) {
  const traits = new Map<string, Set<string>>();
  for (const plant of archive.plants) {
    const key = plant.ref ?? `file:${plant.file}`;
    const set = traits.get(key) ?? new Set<string>();
    for (const trait of plant.traits) set.add(trait);
    traits.set(key, set);
  }
  return traits;
}

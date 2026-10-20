// Seeds a Thei site from the archive through the admin's own routes, as the
// owner would type it in, and writes what it made to `.lab/site-index.json`.
//
// Convergent: everything is found by an identity derived from its ref (a
// public ID, a page's slug, a diary day), made only when missing, and saved
// only when the archive or the site changed since the index was written. A
// second run over an unchanged site saves nothing.
import { createHash } from 'node:crypto';
import { statSync } from 'node:fs';
import { buildUploadHeaders } from '../../../shared/api/asset-upload-headers';
import { createOriginalAssetSettings } from '../../../shared/asset-upload-settings';
import {
  RELATION_TYPE_OF_WORD,
  RELATION_WORD_FROM_OTHER_END,
} from '../../../shared/relation';
import { buildDiaryUrl } from '../../../shared/diary-url';
import { buildEventUrl } from '../../../shared/event-url';
import { buildPageUrl } from '../../../shared/page-url';
import {
  buildProjectSectionUrl,
  buildProjectUrl,
} from '../../../shared/project-url';
import { buildTagUrl } from '../../../shared/tag-url';
import {
  slugify,
  transliterateCyrillic,
} from '../../../shared/language/slugify';
import { contentHeadingAnchors } from '../../../shared/content-headings';
import { normalizeCaptionText } from '../../../shared/terminal-punctuation';
import { DEFAULT_PROJECT_ACTION } from '../../../shared/project-action';
import { LAB_CREDENTIALS } from '../site/credentials';
import type { SiteEntity, SiteFile, SiteIndex } from '../types';
import { sha256File } from '../util';
import { checkArchive } from './check';
import { makeConformanceMedia } from './conformance/media';
import { resolveDay } from './dates';
import { convertText, stableBlockId } from './dialect';
import { archiveFacts, archiveTraits } from './facts';
import { FORM_KEYS, isDerivedFormKey } from './fields';
import type {
  ArchiveAction,
  ArchiveFilePlacement,
  ArchivePeriod,
  ArchiveRelation,
  ArchiveStatus,
  FileKind,
} from './model';
import { conformanceMediaDir, type ArchiveSource } from './source';
import { inPool, SiteClient, SiteError } from './site-client';
import { archiveEntities, refOf } from './texts';

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function base62(seed: string, length: number) {
  const digest = createHash('sha256').update(seed).digest();
  let id = '';
  for (let index = 0; id.length < length; index++)
    id += BASE62[digest[index % digest.length]! % 62];
  return id;
}

/** The public ID a ref gets: random-looking, and the same on every run. */
export function publicIdOf(ref: string) {
  return base62(`thei-lab:${ref}`, 14);
}

function stableId(seed: string) {
  return `lab-${base62(seed, 16)}`;
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

/** The form with the archive's fields laid over it; undefined removes a key. */
function layOver(
  form: Record<string, unknown>,
  desired: Record<string, unknown>,
) {
  const result = { ...form };
  for (const [key, value] of Object.entries(desired)) {
    if (value === undefined) delete result[key];
    else result[key] = value;
  }
  return result;
}

/** What the archive asks of a form, without the identities of stored texts. */
function fingerprintOf(desired: unknown) {
  return sha256(
    JSON.stringify(desired, (key, value) =>
      key === 'contentUuid' || key === 'sectionUuid' ? undefined : value,
    ),
  );
}

const RELATION_ENDS: Record<string, string> = {
  project: 'project',
  event: 'event',
  diary: 'diary-entry',
};

export interface SeedOptions {
  source: ArchiveSource;
  /** Where the seeder talks to the site. */
  origin: string;
  /** How the index names the site for a browser. */
  publicOrigin: string;
  seedDay: string;
  linkPreviews: boolean;
  previous?: SiteIndex;
  log(message: string): void;
}

export interface SeedResult {
  index: SiteIndex;
  warnings: string[];
  made: number;
  saved: number;
  uploaded: number;
}

export async function seedSite(options: SeedOptions): Promise<SeedResult> {
  const { source, seedDay, log } = options;
  const warnings: string[] = [];
  const warn = (message: string) => warnings.push(message);

  // ------------------------------------------------------------- the archive
  const checked = checkArchive(source, {
    media: source.kind !== 'conformance',
    seedDay,
  });
  const errors = checked.issues.filter((issue) => issue.level === 'error');
  if (errors.length)
    throw new SiteError(
      `${source.label} cannot be seeded as it is:\n${errors.map((issue) => `  - ${issue.file}: ${issue.message}`).join('\n')}`,
    );
  for (const issue of checked.issues) warn(`${issue.file}: ${issue.message}`);
  if (source.kind === 'conformance')
    await makeConformanceMedia(conformanceMediaDir());
  const { archive, scans } = checked;
  log(
    `${source.label}: ${archive.projects.length} projects, ${archive.events.length} events, ` +
      `${archive.diary.length} diary entries, ${archive.pages.length} pages, ${archive.files.length} files`,
  );
  const slugOf =
    archive.meta.language === 'ru'
      ? (text: string) => slugify(transliterateCyrillic(text))
      : slugify;
  const previous =
    options.previous?.archive.version === archive.meta.version
      ? options.previous
      : undefined;
  const recorded = (ref: string) => previous?.entities[ref];

  // ---------------------------------------------------------------- the site
  const site = new SiteClient(options.origin, log);
  const state = await site.waitOpen(Date.now() + 10 * 60 * 1000);
  site.credentials = { ...LAB_CREDENTIALS };
  if (state === 'install') {
    log('Completing the setup wizard');
    const answer = await site.attempt('POST', '/api/installation', {
      json: {
        languageCode: archive.meta.language,
        siteAccessLevel: 'public',
        siteUrl: '',
        displayName: archive.person?.name ?? archive.meta.title,
        ...LAB_CREDENTIALS,
      },
    });
    if (answer && answer.status !== 409)
      site.ok('The setup wizard', answer, (a) => a.body?.type === 'success');
    await site.waitOpen();
  }
  await site.signIn();

  // ------------------------------------------------------------------- files
  const uploaded = new Map<
    string,
    { assetUuid: string; kind: FileKind; bytes: number; type: string }
  >();
  let uploadCount = 0;
  let filesDone = 0;
  await inPool(archive.files, 4, async (file) => {
    const path = source.mediaPath(file.id, file.ext);
    if (!path) throw new SiteError(`file ${file.id}: its bytes are not here`);
    const bytes = statSync(path).size;
    const hash =
      source.release?.files[file.id]?.sha256 ?? (await sha256File(path));
    const found = site.ok(
      `Looking up ${file.id}`,
      await site.request('POST', '/api/admin/assets/lookup', {
        json: { hash, size: bytes },
      }),
    );
    let asset = found.body?.asset as
      { assetUuid: string; type: string } | undefined;
    if (asset) {
      // Resets the day an unplaced file waits before cleanup takes it.
      await site.request(
        'POST',
        `/api/admin/assets/${asset.assetUuid}/touches`,
        { json: {} },
      );
    } else {
      const answer = await site.request('POST', '/api/admin/assets', {
        file: path,
        headers: buildUploadHeaders({
          settings: createOriginalAssetSettings(),
          extension: file.ext,
        }),
        timeoutMs: 15 * 60 * 1000,
      });
      site.ok(
        `Uploading ${file.id} (.${file.ext})`,
        answer,
        (a) => a.status === 200 && Boolean(a.body?.assetUuid),
      );
      asset = answer.body;
      uploadCount++;
    }
    uploaded.set(file.id, {
      assetUuid: asset!.assetUuid,
      kind: file.kind,
      bytes,
      type: asset!.type,
    });
    const description = file.description.trim();
    for (let attempt = 0; attempt < 5; attempt++) {
      const current = site.ok(
        `The description of ${file.id}`,
        await site.request(
          'GET',
          `/api/admin/assets/${asset!.assetUuid}/description`,
        ),
      );
      if ((current.body?.text ?? '') === description) break;
      const saved = await site.attempt(
        'PUT',
        `/api/admin/assets/${asset!.assetUuid}/description`,
        {
          json: {
            text: description,
            expectedUpdatedAt: current.body?.updatedAt ?? null,
          },
        },
      );
      if (saved?.status === 200) break;
      if (saved && saved.status !== 409)
        site.ok(`Saving the description of ${file.id}`, saved);
    }
    if (++filesDone % 100 === 0)
      log(`  files: ${filesDone} of ${archive.files.length}`);
  });
  log(
    `Files: ${archive.files.length} (${uploadCount} uploaded, the rest already in the library)`,
  );
  const assetOf = (id: string | undefined) =>
    id ? uploaded.get(id)?.assetUuid : undefined;

  // ------------------------------------------------------- texts and links
  const known = new Map<string, { uuid: string }>();
  const anchors = new Map<string, ReturnType<typeof contentHeadingAnchors>>();
  const entities = new Map(
    archiveEntities(archive).map((entity) => [entity.ref, entity]),
  );
  const anchor = (ref: string, words: string) => {
    if (!anchors.has(ref)) {
      const entity = entities.get(ref);
      const body = entity && 'body' in entity.item ? entity.item.body : '';
      const { data } = convertText(body, {
        owner: ref,
        slot: 'body',
        file: (id) => ({ assetUuid: id, kind: 'image' }),
        entity: () => undefined,
      });
      anchors.set(ref, contentHeadingAnchors(data, slugOf));
    }
    return anchors.get(ref)!.find((heading) => heading.title === words)?.id;
  };
  let finalPass = false;
  const text = (
    owner: string,
    slot: string,
    markdown: string,
    stored?: { contentUuid?: string } | null,
  ) => {
    if (!markdown.trim()) return null;
    const { data, problems } = convertText(markdown, {
      owner,
      slot,
      file: (id) => {
        const file = uploaded.get(id);
        return file
          ? { assetUuid: file.assetUuid, kind: file.kind }
          : undefined;
      },
      entity: (ref) => known.get(ref),
      anchor,
    });
    if (finalPass)
      for (const problem of problems) warn(`${owner} (${slot}): ${problem}`);
    return {
      ...(stored?.contentUuid ? { contentUuid: stored.contentUuid } : {}),
      data,
    };
  };

  const day = (value: string) => resolveDay(value, seedDay);
  const periodsOf = (list: ArchivePeriod[]) =>
    list.map((period) => ({
      startDate: day(period.start),
      endDate: day(period.end),
      precision: period.precision,
      precisionNote: period.doubt,
      label: period.label,
    }));
  const linksOf = (list: { url: string; note: string; private: boolean }[]) =>
    list.map((link) => ({
      url: link.url,
      note: link.note,
      isPrivate: link.private,
    }));
  const otherFilesOf = (list: ArchiveFilePlacement[]) =>
    list.map((item) => ({
      assetUuid: assetOf(item.file)!,
      title:
        item.title ??
        archive.files.find((file) => file.id === item.file)!.title,
      ...(item.caption ? { caption: item.caption } : {}),
      isPrivate: item.private,
    }));
  const showcaseOf = (list: ArchiveFilePlacement[]) =>
    list.map((item) => ({
      assetUuid: assetOf(item.file)!,
      ...(item.caption ? { caption: item.caption } : {}),
      isPrivate: item.private,
    }));
  const actionOf = (action: ArchiveAction | undefined) => {
    if (!action) return { ...DEFAULT_PROJECT_ACTION };
    const background =
      typeof action.background === 'object'
        ? {
            backgroundMode: 'asset',
            backgroundAssetUuid: assetOf(action.background.file),
          }
        : { backgroundMode: `${action.background}-gradient` };
    const icon =
      action.icon === 'favicon'
        ? { iconMode: 'favicon' }
        : action.icon
          ? { iconMode: 'asset', iconAssetUuid: assetOf(action.icon.file) }
          : { iconMode: 'fallback' };
    return {
      ...DEFAULT_PROJECT_ACTION,
      enabled: true,
      text: action.text,
      accentColor: action.color ?? DEFAULT_PROJECT_ACTION.accentColor,
      isPrivate: action.private,
      ...(action.link
        ? { target: 'external-link', externalUrl: action.link }
        : { target: 'file', fileAssetUuid: assetOf(action.file) }),
      ...icon,
      ...background,
      backgroundSize: action.size,
      backgroundRepeat: action.repeat,
    };
  };

  // Keys the admin's forms hold that the seeder does not know: a field added
  // to a form without its place here (tests/lab/archive/fields.ts).
  const unknownKeys = new Set<string>();
  const noteUnknownKeys = (formKind: string, form: Record<string, unknown>) => {
    const keys = FORM_KEYS[formKind]!;
    for (const key of Object.keys(form))
      if (
        !keys.written.includes(key) &&
        !keys.kept.includes(key) &&
        !isDerivedFormKey(key)
      )
        unknownKeys.add(`${formKind}.${key}`);
  };

  // ----------------------------------------------------------------- tags
  const tagItems = new Map<
    string,
    { tagUuid: string; title: string; slug: string; publicId: string }
  >();
  const fingerprints = new Map<string, string>();
  const versions = new Map<string, number>();
  let made = 0;
  let saved = 0;
  for (const tag of archive.tags) {
    const ref = refOf.tag(tag);
    const publicId = publicIdOf(ref);
    const desired = {
      title: tag.title,
      slug: tag.slug ?? slugOf(tag.title),
      publicId,
      description: tag.description,
      synonyms: tag.synonyms,
      iconAssetUuid: assetOf(tag.icon),
    };
    const fingerprint = fingerprintOf(desired);
    let form: any;
    for (let attempt = 0; attempt < 5 && !form; attempt++) {
      const existing = await site.request('GET', `/api/admin/tags/${publicId}`);
      if (existing.status === 404) {
        const created = await site.attempt('POST', '/api/admin/tags', {
          json: desired,
        });
        if (created) {
          site.ok(
            `Creating ${ref}`,
            created,
            (a) => a.body?.type === 'success',
          );
          made++;
        }
        continue;
      }
      site.ok(`Reading ${ref}`, existing);
      noteUnknownKeys('tag', existing.body);
      if (
        recorded(ref)?.fingerprint === fingerprint &&
        recorded(ref)?.version === existing.body.version
      ) {
        form = existing.body;
        break;
      }
      const answer = await site.attempt(
        'PUT',
        `/api/admin/tags/${existing.body.tagUuid}`,
        {
          json: {
            ...layOver(existing.body, desired),
            version: existing.body.version,
          },
        },
      );
      if (!answer || answer.status === 409 || answer.body?.code === 'changed')
        continue;
      site.ok(`Saving ${ref}`, answer, (a) => a.body?.type === 'success');
      saved++;
      form = (
        await site.request('GET', `/api/admin/tags/${existing.body.tagUuid}`)
      ).body;
    }
    if (!form)
      throw new SiteError(
        `${ref} could not be saved (last: ${site.lastFailure}).`,
      );
    tagItems.set(tag.id, {
      tagUuid: form.tagUuid,
      title: form.title,
      slug: form.slug,
      publicId: form.publicId,
    });
    known.set(ref, { uuid: form.tagUuid });
    fingerprints.set(ref, fingerprint);
    versions.set(ref, form.version);
  }
  log(`Tags: ${archive.tags.length}`);
  const tagsOf = (ids: string[]) => ids.map((id) => tagItems.get(id)!);

  // ------------------------------------------------------------ relations
  const relationsByRef = new Map<
    string,
    { other: string; word: string; note?: unknown }[]
  >();
  const declare = (from: string, relation: ArchiveRelation) => {
    const word = relation.kind;
    const note = relation.notes
      ? {
          here: {
            type: 'split',
            currentText: relation.notes.this,
            relatedText: relation.notes.other,
          },
          there: {
            type: 'split',
            currentText: relation.notes.other,
            relatedText: relation.notes.this,
          },
        }
      : relation.note
        ? {
            here: { type: 'shared', text: relation.note },
            there: { type: 'shared', text: relation.note },
          }
        : undefined;
    const add = (ref: string, other: string, kind: string, itsNote: unknown) =>
      relationsByRef.set(ref, [
        ...(relationsByRef.get(ref) ?? []),
        { other, word: kind, ...(itsNote ? { note: itsNote } : {}) },
      ]);
    add(from, relation.to, word, note?.here);
    add(relation.to, from, RELATION_WORD_FROM_OTHER_END[word], note?.there);
  };
  for (const project of archive.projects)
    for (const relation of project.relations)
      declare(refOf.project(project), relation);
  for (const event of archive.events)
    for (const relation of event.relations)
      declare(refOf.event(event), relation);
  for (const entry of archive.diary)
    for (const relation of entry.relations)
      declare(refOf.diary(entry), relation);
  const relationsOf = (ref: string) =>
    (relationsByRef.get(ref) ?? []).flatMap(({ other, word, note }) => {
      const target = known.get(other);
      if (!target) return [];
      return [
        {
          entityType: RELATION_ENDS[other.split(':')[0]!]!,
          entityId: target.uuid,
          type: RELATION_TYPE_OF_WORD[
            word as keyof typeof RELATION_TYPE_OF_WORD
          ],
          ...(note ? { note } : {}),
        },
      ];
    });

  // ------------------------------------------------------------- statuses
  const desiredStatuses = (owner: string, list: ArchiveStatus[]) => {
    const perDay = new Map<string, number>();
    return list.map((status) => {
      const date = day(status.date);
      const n = (perDay.get(date) ?? 0) + 1;
      perDay.set(date, n);
      const id = stableId(
        `${owner}|status|${date}|${n}|${status.empty ? 'empty' : 'regular'}`,
      );
      return status.empty
        ? { id, kind: 'empty' as const, date }
        : {
            id,
            kind: 'regular' as const,
            text: status.text,
            date,
            ...(status.file ? { assetUuid: assetOf(status.file) } : {}),
          };
    });
  };
  const readHistory = async (path: string) => {
    const items: {
      id: string;
      date: string;
      kind: string;
      text: string;
      assetUuid?: string;
    }[] = [];
    let cursor: string | undefined;
    do {
      const page = site.ok(
        `Reading ${path}`,
        await site.request(
          'GET',
          `${path}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
        ),
      );
      items.push(...page.body.items);
      cursor = page.body.nextCursor ?? undefined;
    } while (cursor);
    return items;
  };
  const statusEdits = async (
    historyPath: string | undefined,
    desired: ReturnType<typeof desiredStatuses>,
  ) => {
    const history = historyPath ? await readHistory(historyPath) : [];
    const stored = new Map(history.map((item) => [item.id, item]));
    const wanted = new Set(desired.map((status) => status.id));
    const newStatuses = desired.filter((status) => !stored.has(status.id));
    const updatedStatuses = desired.flatMap((status) => {
      const before = stored.get(status.id);
      if (!before || status.kind === 'empty') return [];
      const same =
        before.date === status.date &&
        before.text === normalizeCaptionText(status.text.trim()) &&
        (before.assetUuid ?? undefined) === (status.assetUuid ?? undefined);
      return same
        ? []
        : [
            {
              id: status.id,
              text: status.text,
              date: status.date,
              ...(status.assetUuid ? { assetUuid: status.assetUuid } : {}),
            },
          ];
    });
    const deletedStatusIds = history
      .filter((item) => !wanted.has(item.id))
      .map((item) => item.id);
    return { newStatuses, updatedStatuses, deletedStatusIds };
  };

  // --------------------------------------------------------- entity forms
  interface Kind {
    name: string;
    route: string;
    uuidKey: string;
    items: { ref: string; item: any }[];
    lookupKey(item: any): string | undefined;
    desired(item: any, ref: string, form?: any): Record<string, unknown>;
    statuses?(item: any, ref: string): ReturnType<typeof desiredStatuses>;
    statusPath?(uuid: string): string;
    afterRead?(item: any, form: any): void;
  }
  const diaryDays = new Map<string, string>();
  const readDiaryDays = async () => {
    const answer = site.ok(
      'Reading the diary days',
      await site.request('GET', '/api/admin/diary/dates'),
    );
    diaryDays.clear();
    for (const row of answer.body as { date: string; diaryUuid: string }[])
      diaryDays.set(row.date, row.diaryUuid);
  };

  const pageKind: Kind = {
    name: 'pages',
    route: '/api/admin/pages',
    uuidKey: 'pageUuid',
    items: archive.pages.map((item) => ({ ref: refOf.page(item), item })),
    lookupKey: (page) => page.slug,
    desired: (page, ref, form) => ({
      title: page.title,
      summary: page.summary,
      slug: page.slug,
      access: page.access,
      iconAssetUuid: assetOf(page.icon),
      content: text(ref, 'body', page.body, form?.content),
      notes: text(ref, 'notes', page.notes, form?.notes),
      reminder: page.reminder,
      synonyms: page.synonyms,
    }),
  };

  const projectKind: Kind = {
    name: 'projects',
    route: '/api/admin/projects',
    uuidKey: 'projectUuid',
    items: archive.projects.map((item) => ({ ref: refOf.project(item), item })),
    lookupKey: (project) => publicIdOf(refOf.project(project)),
    desired: (project, ref, form) => {
      const stored = new Map<string, any>(
        (form?.sections ?? []).map((section: any) => [
          section.publicId,
          section,
        ]),
      );
      return {
        title: project.title,
        summary: project.summary,
        humanReadableSlug: project.slug ?? slugOf(project.title),
        publicId: publicIdOf(ref),
        access: project.access,
        showcase: project.featured,
        cv: project.cv,
        iconAssetUuid: assetOf(project.icon),
        bannerAssetUuid: assetOf(project.banner),
        descriptionContent: text(
          ref,
          'body',
          project.body,
          form?.descriptionContent,
        ),
        notes: text(ref, 'notes', project.notes, form?.notes),
        sections: [...project.sections]
          .sort((a, b) => a.order - b.order)
          .map((section) => {
            const sectionRef = refOf.section(section);
            const publicId = publicIdOf(sectionRef);
            const before = stored.get(publicId);
            return {
              ...(before?.sectionUuid
                ? { sectionUuid: before.sectionUuid }
                : {}),
              title: section.title,
              summary: section.summary,
              humanReadableSlug: section.slug ?? slugOf(section.title),
              publicId,
              isPrivate: section.private,
              periods: periodsOf(section.periods),
              content: text(
                sectionRef,
                'body',
                section.body,
                before?.content,
              ) ?? { data: { blocks: [] } },
              ...(section.banner
                ? { bannerAssetUuid: assetOf(section.banner) }
                : {}),
            };
          }),
        showcaseAssets: showcaseOf(project.showcase),
        otherAssets: otherFilesOf(project.files),
        externalLinks: linksOf(project.links),
        tags: tagsOf(project.tags),
        action: actionOf(project.action),
        reminder: project.reminder,
        synonyms: project.synonyms,
      };
    },
    statuses: (project, ref) => desiredStatuses(ref, project.statuses),
    statusPath: (uuid) => `/api/admin/projects/${uuid}/statuses`,
    afterRead: (project, form) => {
      for (const section of project.sections) {
        const stored = (form.sections ?? []).find(
          (item: any) => item.publicId === publicIdOf(refOf.section(section)),
        );
        if (stored?.sectionUuid)
          known.set(refOf.section(section), { uuid: stored.sectionUuid });
      }
    },
  };

  const eventKind: Kind = {
    name: 'events',
    route: '/api/admin/events',
    uuidKey: 'eventUuid',
    items: archive.events.map((item) => ({ ref: refOf.event(item), item })),
    lookupKey: (event) => publicIdOf(refOf.event(event)),
    desired: (event, ref, form) => ({
      title: event.title,
      summary: event.summary,
      access: event.access,
      humanReadableSlug: event.slug ?? slugOf(event.title),
      publicId: publicIdOf(ref),
      periods: periodsOf(event.periods),
      content: text(ref, 'body', event.body, form?.content),
      bannerAssetUuid: assetOf(event.banner),
      otherAssets: otherFilesOf(event.files),
      externalLinks: linksOf(event.links),
      tags: tagsOf(event.tags),
      action: actionOf(event.action),
      reminder: event.reminder,
      synonyms: event.synonyms,
      notes: text(ref, 'notes', event.notes, form?.notes),
    }),
  };

  const diaryKind: Kind = {
    name: 'diary entries',
    route: '/api/admin/diary',
    uuidKey: 'diaryUuid',
    items: archive.diary.map((item) => ({ ref: refOf.diary(item), item })),
    lookupKey: (entry) => diaryDays.get(day(entry.date)),
    desired: (entry, ref, form) => ({
      date: day(entry.date),
      access: entry.access,
      content: text(ref, 'body', entry.body, form?.content),
      notes: text(ref, 'notes', entry.notes, form?.notes),
      reminder: entry.reminder,
    }),
  };

  const kinds = [pageKind, projectKind, eventKind, diaryKind];
  const forms = new Map<string, any>();

  const lookup = async (kind: Kind, item: any) => {
    const key = kind.lookupKey(item);
    if (!key) return undefined;
    const answer = await site.request(
      'GET',
      `${kind.route}/${encodeURIComponent(key)}`,
    );
    if (answer.status === 404) return undefined;
    return site.ok(`Looking up ${kind.name}`, answer).body;
  };

  // Everything that exists is known before anything is made, so the first
  // pass writes every link it can.
  await readDiaryDays();
  await inPool(
    kinds.flatMap((kind) => kind.items.map((entry) => ({ kind, entry }))),
    6,
    async ({ kind, entry }) => {
      const form = await lookup(kind, entry.item);
      if (!form) return;
      known.set(entry.ref, { uuid: form[kind.uuidKey] });
      forms.set(entry.ref, form);
      kind.afterRead?.(entry.item, form);
    },
  );

  for (const kind of kinds) {
    let kindMade = 0;
    for (const { ref, item } of kind.items) {
      if (known.has(ref)) continue;
      for (let attempt = 0; ; attempt++) {
        if (attempt > 4)
          throw new SiteError(
            `${ref} could not be created (last: ${site.lastFailure}).`,
          );
        const created = await site.attempt('POST', kind.route, {
          json: {
            ...kind.desired(item, ref),
            ...(kind.statuses
              ? {
                  newStatuses: kind.statuses(item, ref),
                  updatedStatuses: [],
                  deletedStatusIds: [],
                }
              : {}),
          },
        });
        if (kind === diaryKind) await readDiaryDays();
        const form = await lookup(kind, item);
        if (form) {
          known.set(ref, { uuid: form[kind.uuidKey] });
          forms.set(ref, form);
          kind.afterRead?.(item, form);
          kindMade++;
          break;
        }
        if (created)
          site.ok(
            `Creating ${ref}`,
            created,
            (a) => a.body?.type === 'success',
          );
      }
    }
    made += kindMade;
    log(
      `${kind.name[0]!.toUpperCase()}${kind.name.slice(1)}: ${kind.items.length} (${kindMade} made)`,
    );
  }

  log('Writing links, relations and statuses');
  finalPass = true;
  for (const kind of kinds) {
    let kindSaved = 0;
    await inPool(kind.items, 4, async ({ ref, item }) => {
      const uuid = known.get(ref)!.uuid;
      for (let attempt = 0; ; attempt++) {
        if (attempt > 5)
          throw new SiteError(
            `${ref} could not be saved (last: ${site.lastFailure}).`,
          );
        const read = site.ok(
          `Reading ${ref}`,
          await site.request('GET', `${kind.route}/${uuid}`),
        );
        const form = read.body;
        noteUnknownKeys(
          kind === diaryKind
            ? 'diary'
            : kind === pageKind
              ? 'page'
              : kind === projectKind
                ? 'project'
                : 'event',
          form,
        );
        const desired = {
          ...kind.desired(item, ref, form),
          relations: relationsOf(ref),
          ...(kind.statuses ? { statuses: kind.statuses(item, ref) } : {}),
        };
        const fingerprint = fingerprintOf(desired);
        if (
          recorded(ref)?.fingerprint === fingerprint &&
          recorded(ref)?.version === form.version
        ) {
          fingerprints.set(ref, fingerprint);
          versions.set(ref, form.version);
          forms.set(ref, form);
          kind.afterRead?.(item, form);
          return;
        }
        const { statuses: wantedStatuses, ...fields } = desired as Record<
          string,
          any
        >;
        const { statuses: _history, ...rest } = form;
        const payload: Record<string, unknown> = {
          ...layOver(rest, fields),
          version: form.version,
        };
        if (kind.statuses)
          Object.assign(
            payload,
            await statusEdits(kind.statusPath!(uuid), wantedStatuses),
          );
        const answer = await site.attempt('PUT', `${kind.route}/${uuid}`, {
          json: payload,
        });
        if (!answer || answer.status === 409 || answer.body?.code === 'changed')
          continue;
        site.ok(
          `Saving ${ref}`,
          answer,
          (a) => a.status === 200 && a.body?.type === 'success',
        );
        kindSaved++;
        const after = site.ok(
          `Reading ${ref}`,
          await site.request('GET', `${kind.route}/${uuid}`),
        ).body;
        fingerprints.set(ref, fingerprint);
        versions.set(ref, after.version);
        forms.set(ref, after);
        kind.afterRead?.(item, after);
        return;
      }
    });
    saved += kindSaved;
    log(
      `  ${kind.name}: ${kindSaved} saved, ${kind.items.length - kindSaved} already as the archive says`,
    );
  }
  if (unknownKeys.size)
    warn(
      `the admin's forms hold keys the seeder does not know (tests/lab/archive/fields.ts): ${[...unknownKeys].join(', ')}`,
    );

  // -------------------------------------------------------------- profile
  if (archive.person) {
    const person = archive.person;
    const avatars = person.avatars.map((id) => assetOf(id)!);
    let profileSaved = false;
    for (let attempt = 0; ; attempt++) {
      if (attempt > 5)
        throw new SiteError('The profile kept changing while it was saved.');
      const read = site.ok(
        'Reading the profile',
        await site.request('GET', '/api/admin/about'),
      );
      const data = read.body.data;
      const desired = {
        displayName: person.name,
        slogan: person.slogan,
        nickname: person.nickname,
        birthDate: person.birthDate,
        bannerAssetUuid: assetOf(person.banner) ?? null,
        faviconAssetUuid: assetOf(person.favicon) ?? null,
        aboutContent: text('profile', 'about', person.about, data.aboutContent),
        facts: person.facts.map((fact, index) => ({
          id: stableId(`profile|fact|${index}`),
          ...fact,
        })),
        pinnedPageUuids: person.pinned.map((ref) => known.get(ref)!.uuid),
        externalLinks: person.links.map((link) => ({
          url: link.url,
          name: link.name,
          note: link.note,
          isPrivate: link.private,
        })),
      };
      const statuses = desiredStatuses('profile', person.statuses);
      const fingerprint = fingerprintOf({ ...desired, statuses, avatars });
      if (
        recorded('profile')?.fingerprint === fingerprint &&
        recorded('profile')?.version === data.version
      ) {
        fingerprints.set('profile', fingerprint);
        versions.set('profile', data.version);
        break;
      }
      // The avatars' history, oldest first: each one the site lacks is set in turn.
      const history = await readHistory('/api/admin/about/avatars');
      const had = new Set(history.map((item: any) => item.assetUuid));
      const missing = avatars.filter((uuid) => !had.has(uuid));
      let version = data.version;
      for (const [index, uuid] of missing.entries()) {
        const step = await site.attempt('PUT', '/api/admin/about', {
          json: {
            ...data,
            avatarAssetUuid: uuid,
            avatarChangeId: stableId(`profile|avatar|${uuid}|${index}`),
            newStatuses: [],
            updatedStatuses: [],
            deletedStatusIds: [],
            version,
          },
        });
        if (!step) break;
        site.ok('Changing the avatar', step);
        version = site.ok(
          'Reading the profile',
          await site.request('GET', '/api/admin/about'),
        ).body.data.version;
      }
      const current = site.ok(
        'Reading the profile',
        await site.request('GET', '/api/admin/about'),
      ).body.data;
      const answer = await site.attempt('PUT', '/api/admin/about', {
        json: {
          ...layOver(current, desired),
          ...(avatars.length && current.avatarAssetUuid !== avatars.at(-1)
            ? {
                avatarAssetUuid: avatars.at(-1),
                avatarChangeId: stableId(
                  `profile|avatar|last|${avatars.at(-1)}`,
                ),
              }
            : {}),
          ...(await statusEdits('/api/admin/about/statuses', statuses)),
          version: current.version,
        },
      });
      if (!answer || answer.status === 409) continue;
      site.ok('Saving the profile', answer);
      saved++;
      profileSaved = true;
      fingerprints.set('profile', fingerprint);
      versions.set(
        'profile',
        site.ok(
          'Reading the profile',
          await site.request('GET', '/api/admin/about'),
        ).body.data.version,
      );
      break;
    }
    log(profileSaved ? 'Profile saved' : 'Profile: as the archive says');
  }

  // --------------------------------------------- the index, as a stranger sees it
  log('Checking every entity as a stranger');
  const facts = archiveFacts(archive, scans, seedDay);
  const traits = archiveTraits(archive);
  const index: SiteIndex = {
    schema: 1,
    archive: {
      version: archive.meta.version,
      format: archive.meta.format,
      revision: archive.meta.revision,
      commit: source.release?.commit ?? '',
      language: archive.meta.language,
    },
    adapter: '',
    seededAt: new Date().toISOString(),
    seedDay,
    origin: options.publicOrigin,
    entities: {},
    files: {},
    plants: {},
  };
  const add = (
    entity: Omit<SiteEntity, 'facts' | 'traits' | 'fingerprint' | 'version'>,
    expectOpen: boolean,
  ) => {
    index.entities[entity.ref] = {
      ...entity,
      fingerprint: fingerprints.get(entity.ref) ?? '',
      version: versions.get(entity.ref),
      facts: facts.get(entity.ref) ?? {},
      traits: [...(traits.get(entity.ref) ?? [])],
    };
    return { ref: entity.ref, expectOpen };
  };
  const checks: { ref: string; expectOpen: boolean }[] = [];
  for (const tag of archive.tags) {
    const ref = refOf.tag(tag);
    const item = tagItems.get(tag.id)!;
    const used = [...archive.projects, ...archive.events].some(
      (carrier) => carrier.access === 'public' && carrier.tags.includes(tag.id),
    );
    checks.push(
      add(
        {
          ref: ref as SiteEntity['ref'],
          kind: 'tag',
          uuid: item.tagUuid,
          title: item.title,
          slug: item.slug,
          publicId: item.publicId,
          adminUrl: `/admin/tags/${item.tagUuid}/edit/`,
          publicUrl: buildTagUrl(item.slug, item.publicId),
        },
        used,
      ),
    );
  }
  for (const page of archive.pages) {
    const ref = refOf.page(page);
    const form = forms.get(ref);
    const publicUrl = buildPageUrl(form.slug);
    checks.push(
      add(
        {
          ref: ref as SiteEntity['ref'],
          kind: 'page',
          uuid: form.pageUuid,
          title: form.title,
          slug: form.slug,
          access: form.access,
          adminUrl: `/admin/pages/${form.pageUuid}/edit/`,
          publicUrl,
          markdownUrl: `${publicUrl}index.md`,
        },
        form.access !== 'private',
      ),
    );
  }
  for (const project of archive.projects) {
    const ref = refOf.project(project);
    const form = forms.get(ref);
    const publicUrl = buildProjectUrl(form.humanReadableSlug, form.publicId);
    checks.push(
      add(
        {
          ref: ref as SiteEntity['ref'],
          kind: 'project',
          uuid: form.projectUuid,
          title: form.title,
          slug: form.humanReadableSlug,
          publicId: form.publicId,
          access: form.access,
          adminUrl: `/admin/projects/${form.projectUuid}/edit/`,
          publicUrl,
          markdownUrl: `${publicUrl}index.md`,
        },
        form.access !== 'private',
      ),
    );
    for (const section of project.sections) {
      const sectionRef = refOf.section(section);
      const stored = (form.sections ?? []).find(
        (item: any) => item.publicId === publicIdOf(sectionRef),
      );
      if (!stored) {
        warn(`${sectionRef} is missing from its project after saving`);
        continue;
      }
      const url = buildProjectSectionUrl(
        form.humanReadableSlug,
        form.publicId,
        stored.humanReadableSlug,
        stored.publicId,
      );
      const access =
        stored.isPrivate || form.access === 'private' ? 'private' : form.access;
      checks.push(
        add(
          {
            ref: sectionRef as SiteEntity['ref'],
            kind: 'section',
            uuid: stored.sectionUuid,
            title: stored.title,
            slug: stored.humanReadableSlug,
            publicId: stored.publicId,
            access,
            project: ref as SiteEntity['ref'],
            adminUrl: `/admin/projects/${form.projectUuid}/edit/`,
            publicUrl: url,
            markdownUrl: `${url}index.md`,
          },
          access !== 'private',
        ),
      );
    }
  }
  for (const event of archive.events) {
    const ref = refOf.event(event);
    const form = forms.get(ref);
    const publicUrl = buildEventUrl(form.humanReadableSlug, form.publicId);
    checks.push(
      add(
        {
          ref: ref as SiteEntity['ref'],
          kind: 'event',
          uuid: form.eventUuid,
          title: form.title,
          slug: form.humanReadableSlug,
          publicId: form.publicId,
          access: form.access,
          adminUrl: `/admin/events/${form.eventUuid}/edit/`,
          publicUrl,
          markdownUrl: `${publicUrl}index.md`,
        },
        form.access !== 'private',
      ),
    );
  }
  for (const entry of archive.diary) {
    const ref = refOf.diary(entry);
    const form = forms.get(ref);
    const publicUrl = buildDiaryUrl(form.date);
    checks.push(
      add(
        {
          ref: ref as SiteEntity['ref'],
          kind: 'diary',
          uuid: form.diaryUuid,
          date: form.date,
          access: form.access,
          adminUrl: `/admin/diary/${form.diaryUuid}/edit/`,
          publicUrl,
          markdownUrl: `${publicUrl}index.md`,
        },
        form.access !== 'private',
      ),
    );
  }
  index.entities.profile = {
    ref: 'profile',
    kind: 'profile',
    uuid: 'profile',
    adminUrl: '/admin/about/',
    publicUrl: '/',
    fingerprint: fingerprints.get('profile') ?? '',
    version: versions.get('profile'),
    facts: {},
    traits: [...(traits.get('profile') ?? [])],
  };

  const problems: string[] = [];
  await inPool(checks, 6, async ({ ref, expectOpen }) => {
    const entity = index.entities[ref]!;
    const path = entity.markdownUrl ?? entity.publicUrl!;
    const answer = await site.request('GET', path, {
      visitor: true,
      timeoutMs: 120_000,
    });
    entity.strangerStatus = answer.status;
    if ((answer.status === 200) !== expectOpen)
      problems.push(
        `${ref}: a stranger got ${answer.status} at ${path} (access ${entity.access ?? 'public'})`,
      );
  });
  for (const problem of problems) warn(problem);

  // Files: where the archive places each, and what the site made of it.
  const places = new Map<string, Set<string>>();
  const place = (id: string | undefined, ref: string) => {
    if (!id) return;
    const set = places.get(id) ?? new Set<string>();
    set.add(ref);
    places.set(id, set);
  };
  for (const [key, scan] of scans)
    for (const item of scan.files) place(item.id, key.split('|')[0]!);
  for (const project of archive.projects) {
    const ref = refOf.project(project);
    [
      project.icon,
      project.banner,
      ...project.files.map((f) => f.file),
      ...project.showcase.map((f) => f.file),
      ...project.statuses.map((s) => s.file),
    ].forEach((id) => place(id, ref));
    for (const section of project.sections)
      place(section.banner, refOf.section(section));
  }
  for (const event of archive.events)
    [event.banner, ...event.files.map((f) => f.file)].forEach((id) =>
      place(id, refOf.event(event)),
    );
  for (const tag of archive.tags) place(tag.icon, refOf.tag(tag));
  for (const file of archive.files) {
    const site = uploaded.get(file.id)!;
    const release = source.release?.files[file.id];
    const entry: SiteFile = {
      id: file.id,
      assetUuid: site.assetUuid,
      kind: file.kind,
      ext: file.ext,
      bytes: site.bytes,
      ...(release?.width ? { width: release.width } : {}),
      ...(release?.height ? { height: release.height } : {}),
      ...(release?.durationSec ? { durationSec: release.durationSec } : {}),
      hasDescription: Boolean(file.description.trim()),
      places: [...(places.get(file.id) ?? [])] as SiteFile['places'],
      traits: [...(traits.get(`file:${file.id}`) ?? [])],
    };
    index.files[file.id] = entry;
  }
  for (const plant of archive.plants)
    index.plants[plant.id] = {
      ...plant,
      ref: plant.ref as SiteEntity['ref'] | undefined,
    };

  return { index, warnings, made, saved, uploaded: uploadCount };
}

export { stableBlockId };

/**
 * The site the update, backup and recovery scenarios work on: made by the
 * last release itself, through its own admin API, on a server of its own,
 * and copied out once for every scenario to restore.
 *
 * It holds one of everything a site can hold rather than a lot of anything:
 * each kind of entity at each access level, stages with several periods,
 * every content block, tags, relations, statuses, and media of each type
 * used in each place a file can go. Links point at an address the server
 * refuses to fetch, so nothing here reaches the network.
 *
 * The requests speak the last release's API. When a release changes one of
 * them, this file follows once the release is out.
 */
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import {
  api,
  artifactsDir,
  BenchFailure,
  check,
  completeWizard,
  installOrFail,
  lastRelease,
  log,
  must,
  mustExec,
  repoRoot,
  signIn,
  sitemapPaths,
  upload,
  workDir,
  type Server,
} from './bench';

const seedDir = join(workDir, 'seed');
/** The copy of `content/` every scenario restores. */
export const seedCopy = join(seedDir, 'content');
const manifestPath = join(seedDir, 'manifest.json');

type EntityKind = 'projects' | 'events' | 'pages' | 'diary';

/** What the seed site holds, for checking it wherever it is restored. */
export interface SeedManifest {
  release: string;
  entities: {
    kind: EntityKind;
    uuid: string;
    /** The title, or a diary entry's date. */
    name: string;
    stages?: number;
    sections?: number;
    /** The words written for each of a project's hand-made links. */
    links?: string[];
  }[];
  /** Files as stored, by the hash of their bytes. */
  assets: { uuid: string; contentHash: string }[];
  slogan: string;
  /** Every public address the site had on the last release. */
  sitemap: string[];
  /** Public IDs that must never be listed. */
  privateIds: string[];
}

// ------------------------------------------------------------------ content

type Block = { type: string; data: Record<string, unknown>; tunes?: object };

const paragraph = (text: string): Block => ({
  type: 'paragraph',
  data: { text },
});
const content = (...blocks: Block[]) => ({ data: { blocks } });
/** Refused by the server's fetcher at once: no page, no archive lookup. */
const offline = (path: string) => `http://127.0.0.1:9/${path}`;

/** Every block type `docs/content-blocks.md` describes, once. */
function article(files: Files, pageUuid: string) {
  const item = (text: string) => ({ content: text, items: [], meta: {} });
  return content(
    { type: 'header', data: { text: 'Как это устроено', level: 2 } },
    paragraph(
      `<b>Жирный</b>, <i>курсив</i>, <s>зачёркнутый</s> и <a href="${offline('docs')}" data-content-link="external">ссылка</a>.`,
    ),
    { ...paragraph('Под спойлером.'), tunes: { spoiler: true } },
    {
      type: 'list',
      data: { style: 'ordered', items: [item('Раз'), item('Два')], meta: {} },
    },
    {
      type: 'quote',
      data: { text: 'Цитата', caption: 'Автор', alignment: 'left' },
    },
    { type: 'delimiter', data: {} },
    {
      type: 'contentMedia',
      data: {
        asset: { assetUuid: files.picture },
        layout: 'centered',
        caption: 'Кадр',
      },
    },
    {
      type: 'contentGallery',
      data: {
        items: [
          { id: 'g1', asset: { assetUuid: files.picture }, caption: 'Кадр' },
          { id: 'g2', asset: { assetUuid: files.video } },
          { id: 'g3', asset: { assetUuid: files.drawing } },
        ],
      },
    },
    {
      type: 'contentAttachment',
      data: { asset: { assetUuid: files.notes }, title: 'Заметки' },
    },
    { type: 'externalLink', data: { url: offline('external') } },
    {
      type: 'integration',
      data: { provider: 'youtube', videoId: 'aqz-KE-bpKQ' },
    },
    { type: 'entityLink', data: { entityType: 'page', entityId: pageUuid } },
    {
      type: 'privateSectionBoundary',
      data: { sectionId: 'bench', edge: 'start' },
    },
    paragraph('Только для владельца.'),
    {
      type: 'privateSectionBoundary',
      data: { sectionId: 'bench', edge: 'end' },
    },
  );
}

// -------------------------------------------------------------------- files

/** One of each kind of file the library stores: paths, or asset IDs. */
type Files = Record<'picture' | 'wide' | 'video' | 'drawing' | 'notes', string>;

interface StoredAsset {
  assetUuid: string;
  contentHash: string;
  media?: { src?: string; previewSrc?: string };
}

/** A photo-like picture, the same bytes on every run. */
async function photo(width: number, height: number): Promise<Buffer> {
  let seed = width * height;
  const random = () => {
    seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
    return seed / 4_294_967_296;
  };
  const pixels = Buffer.alloc(width * height * 3);
  for (let index = 0; index < pixels.length; index += 3) {
    const x = (index / 3) % width;
    pixels[index] = (x * 255) / width + random() * 40;
    pixels[index + 1] = 120 + random() * 60;
    pixels[index + 2] = 200 - random() * 60;
  }
  return await sharp(pixels, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
}

/** Writes one file of each kind into `dir`, the same bytes on every run. */
export async function writeSampleFiles(dir: string): Promise<Files> {
  mkdirSync(dir, { recursive: true });
  const files: Files = {
    picture: join(dir, 'picture.png'),
    wide: join(dir, 'wide.png'),
    video: join(dir, 'clip.mp4'),
    drawing: join(dir, 'drawing.svg'),
    notes: join(dir, 'notes.txt'),
  };
  writeFileSync(files.picture, await photo(640, 480));
  writeFileSync(files.wide, await photo(1200, 630));
  copyFileSync(
    join(repoRoot, 'tests/e2e/fixture/media/regression-video.mp4'),
    files.video,
  );
  writeFileSync(
    files.drawing,
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3"/></svg>',
  );
  writeFileSync(files.notes, 'Заметки бенча.\n'.repeat(40));
  return files;
}

/** Uploads a file into the library and checks it was stored. */
export function uploadOrFail(
  server: Server,
  path: string,
  what: string,
): StoredAsset {
  const response = upload(server, path);
  const asset = response.body as Partial<StoredAsset>;
  check(
    response.status === 200 && asset.assetUuid && asset.contentHash,
    `${what} uploaded${asset.assetUuid ? '' : `: ${response.status} ${response.text.slice(0, 300)}`}`,
  );
  return asset as StoredAsset;
}

/** Uploads one of each kind of file and returns their asset IDs. */
async function uploadFiles(
  server: Server,
  manifest: SeedManifest,
): Promise<Files> {
  const sources = await writeSampleFiles(join(seedDir, 'files'));
  const files = {} as Files;
  for (const [name, path] of Object.entries(sources) as [
    keyof Files,
    string,
  ][]) {
    const asset = uploadOrFail(server, path, `the ${name}`);
    files[name] = asset.assetUuid;
    manifest.assets.push({
      uuid: asset.assetUuid,
      contentHash: asset.contentHash,
    });
  }
  return files;
}

// ----------------------------------------------------------------- entities

/** Saves an entity; the admin routes answer a refusal with `type: "error"`. */
function create(
  server: Server,
  path: string,
  body: unknown,
  what: string,
): any {
  const response = api(server, 'POST', path, body);
  const answer = response.body as any;
  const ok = response.status === 200 && answer?.type === 'success';
  check(
    ok,
    ok
      ? `${what} created`
      : `${what} was refused: ${response.status} ${response.text.slice(0, 500)}`,
  );
  return answer;
}

function createSite(
  server: Server,
  files: Files,
  manifest: SeedManifest,
): void {
  const add = (
    kind: EntityKind,
    uuid: string,
    name: string,
    parts?: { stages: number; sections: number; links?: string[] },
  ) => manifest.entities.push({ kind, uuid, name, ...parts });

  // Pages first: the article links to one.
  const pageTitle = 'Обо мне 📎';
  const page = create(
    server,
    '/api/admin/pages',
    {
      title: pageTitle,
      summary: 'Отдельная страница.',
      slug: 'about-bench',
      access: 'public',
      iconAssetUuid: files.picture,
      content: content(paragraph('Страница бенча.')),
    },
    'a public page',
  );
  add('pages', page.pageUuid, pageTitle);
  const hiddenPage = create(
    server,
    '/api/admin/pages',
    {
      title: 'Черновик',
      summary: 'Никому не видна.',
      slug: 'private-bench',
      access: 'private',
      content: content(paragraph('Личное.')),
    },
    'a private page',
  );
  add('pages', hiddenPage.pageUuid, 'Черновик');

  const month = (start: string, end: string) => ({
    startDate: start,
    endDate: end,
    precision: 'month',
    precisionNote: 'примерно',
  });
  const projectTitle = 'Северный свет 🌌';
  const project = create(
    server,
    '/api/admin/projects',
    {
      title: projectTitle,
      summary: 'Проект, в котором есть всё.',
      humanReadableSlug: 'severnyy-svet',
      publicId: 'BenchNorth',
      access: 'public',
      showcase: true,
      cv: true,
      descriptionContent: content(paragraph('Описание проекта.'), {
        type: 'contentMedia',
        data: { asset: { assetUuid: files.wide }, layout: 'stretch' },
      }),
      stages: [
        {
          isStage: true,
          title: 'Начало',
          summary: 'Первые шаги.',
          humanReadableSlug: 'nachalo',
          publicId: 'BenchStageOne',
          isPrivate: false,
          periods: [
            month('2024-01-01', '2024-02-29'),
            month('2024-05-01', '2024-05-31'),
          ],
          content: content(paragraph('Этап с двумя периодами.')),
        },
        {
          isStage: true,
          title: 'Выпуск',
          summary: '',
          humanReadableSlug: 'vypusk',
          publicId: 'BenchStageHidden',
          isPrivate: true,
          periods: [
            {
              startDate: '2025-03-10',
              endDate: '2025-03-12',
              precision: 'exact',
              precisionNote: '',
            },
          ],
          content: null,
        },
      ],
      contentSections: [
        {
          isStage: false,
          title: 'Устройство',
          summary: 'Все виды блоков.',
          humanReadableSlug: 'ustroystvo',
          publicId: 'BenchSection',
          isPrivate: false,
          content: article(files, page.pageUuid),
        },
      ],
      externalLinks: [
        { url: offline('north'), note: 'Сайт проекта', isPrivate: false },
      ],
      tags: [{ title: 'Бенч' }, { title: 'Release' }],
      iconAssetUuid: files.picture,
      bannerAssetUuid: files.wide,
      showcaseAssets: [
        { assetUuid: files.picture, caption: 'Кадр', isPrivate: false },
        { assetUuid: files.video, isPrivate: false },
      ],
      otherAssets: [
        { assetUuid: files.notes, title: 'Заметки', isPrivate: false },
        { assetUuid: files.drawing, title: 'Схема', isPrivate: true },
      ],
      action: {
        enabled: true,
        text: 'Открыть',
        accentColor: '#777777',
        isPrivate: false,
        target: 'external-link',
        externalUrl: offline('app'),
        iconMode: 'fallback',
        backgroundMode: 'standard-gradient',
        backgroundSize: 'natural',
        backgroundRepeat: 'no-repeat',
      },
      newStatuses: [
        { id: 'bench-project-status', kind: 'regular', text: 'В работе' },
      ],
    },
    'a public project',
  );
  add('projects', project.projectUuid, projectTitle, {
    stages: 2,
    sections: 1,
    links: ['Сайт проекта'],
  });

  const hiddenProject = create(
    server,
    '/api/admin/projects',
    {
      title: 'Личный проект',
      summary: 'Никому не показывается.',
      humanReadableSlug: 'lichnyy',
      publicId: 'BenchPrivate',
      access: 'private',
      stages: [
        {
          isStage: true,
          title: 'Тихо',
          summary: '',
          humanReadableSlug: 'tikho',
          publicId: 'BenchPrivateStage',
          isPrivate: false,
          periods: [{ startDate: '2023-06-01', endDate: '2023-06-30' }],
          content: null,
        },
      ],
    },
    'a private project',
  );
  add('projects', hiddenProject.projectUuid, 'Личный проект', {
    stages: 1,
    sections: 0,
  });

  const linkProject = create(
    server,
    '/api/admin/projects',
    {
      title: 'По ссылке',
      summary: 'Открывается только по адресу.',
      humanReadableSlug: 'po-ssylke',
      publicId: 'BenchLink',
      access: 'link-only',
    },
    'a link-only project',
  );
  add('projects', linkProject.projectUuid, 'По ссылке', {
    stages: 0,
    sections: 0,
  });

  const eventTitle = 'Доклад 🎤';
  const event = create(
    server,
    '/api/admin/events',
    {
      title: eventTitle,
      summary: 'Выступление о проекте.',
      humanReadableSlug: 'doklad',
      publicId: 'BenchTalk',
      access: 'public',
      periods: [{ startDate: '2025-05-10', endDate: '2025-05-10' }],
      content: content(paragraph('Было интересно.'), {
        type: 'contentMedia',
        data: { asset: { assetUuid: files.video }, layout: 'natural' },
      }),
      tags: [{ title: 'Бенч' }],
      relations: [
        {
          entityType: 'project',
          entityId: project.projectUuid,
          type: 'influencing',
          note: { type: 'shared', text: 'О проекте' },
        },
      ],
      otherAssets: [
        { assetUuid: files.notes, title: 'Слайды', isPrivate: false },
      ],
    },
    'a public event',
  );
  add('events', event.eventUuid, eventTitle);

  const hiddenEvent = create(
    server,
    '/api/admin/events',
    {
      title: 'Тихая встреча',
      summary: 'Только для себя.',
      humanReadableSlug: 'vstrecha',
      publicId: 'BenchQuiet',
      access: 'private',
      periods: [{ startDate: '2024-11-02', endDate: '2024-11-03' }],
      content: content(paragraph('Личное.')),
    },
    'a private event',
  );
  add('events', hiddenEvent.eventUuid, 'Тихая встреча');

  const entry = create(
    server,
    '/api/admin/diary',
    {
      date: '2025-05-11',
      access: 'public',
      content: content(paragraph('Запись после доклада.')),
      relations: [
        { entityType: 'event', entityId: event.eventUuid, type: 'related' },
        {
          entityType: 'project',
          entityId: project.projectUuid,
          type: 'related',
          note: { type: 'split', currentText: 'Отсюда', relatedText: 'Туда' },
        },
      ],
    },
    'a public diary entry',
  );
  add('diary', entry.diaryUuid, '2025-05-11');
  const hiddenEntry = create(
    server,
    '/api/admin/diary',
    {
      date: '2025-05-12',
      access: 'private',
      content: content(paragraph('Личная запись.')),
    },
    'a private diary entry',
  );
  add('diary', hiddenEntry.diaryUuid, '2025-05-12');

  // The profile is saved whole: what the panel read, with changes.
  const about = api(server, 'GET', '/api/admin/about').body as any;
  const saved = api(server, 'PUT', '/api/admin/about', {
    ...about.data,
    slogan: manifest.slogan,
    avatarAssetUuid: files.picture,
    avatarChangeId: 'bench-avatar',
    newStatuses: [
      { id: 'bench-profile-status', kind: 'regular', text: 'Проверяю релиз' },
    ],
    updatedStatuses: [],
    deletedStatusIds: [],
  });
  check(
    saved.status === 200,
    `the profile saved${saved.status === 200 ? '' : `: ${saved.status} ${saved.text.slice(0, 300)}`}`,
  );

  manifest.privateIds.push(
    'BenchPrivate',
    'BenchPrivateStage',
    'BenchStageHidden',
    'BenchQuiet',
    'BenchLink',
    'private-bench',
    '2025-05-12',
  );
}

// ------------------------------------------------------------------- checks

/**
 * The seed site is whole on `server`: every entity opens with its name and
 * parts, every file serves the bytes it was stored with, every address it
 * had answers, and nothing private is listed.
 */
export function checkSeedSite(server: Server, manifest: SeedManifest): void {
  for (const entity of manifest.entities) {
    const response = api(
      server,
      'GET',
      `/api/admin/${entity.kind}/${entity.uuid}`,
    );
    const body = response.body as any;
    check(
      response.status === 200 && (body?.title ?? body?.date) === entity.name,
      `${entity.kind} "${entity.name}" opens (${response.status})`,
    );
    if (entity.kind === 'projects') {
      // Until 0.0.4 a project kept stages and sections apart; since then a
      // stage is a section with dates, and they come back as one list.
      const parts =
        (body.sections ?? body.contentSections ?? []).length +
        (body.stages?.length ?? 0);
      const expected = (entity.stages ?? 0) + (entity.sections ?? 0);
      check(
        parts === expected,
        `"${entity.name}" keeps its ${expected} part(s) (${parts})`,
      );
    }
    if (entity.links) {
      // A link keeps the words written for it, its note.
      const words = (body.externalLinks ?? []).map(
        (link: { note?: string }) => link.note,
      );
      check(
        JSON.stringify(words) === JSON.stringify(entity.links),
        `"${entity.name}" keeps the words of its links (${JSON.stringify(words)})`,
      );
    }
  }

  const hashes = mustExec(
    server,
    manifest.assets
      .map(
        ({ uuid }) =>
          `curl -s -b /root/jar http://127.0.0.1:3000/api/admin/assets/${uuid}/content | sha256sum | cut -c1-64`,
      )
      .join('\n'),
  )
    .trim()
    .split('\n');
  const damaged = manifest.assets.filter(
    (asset, index) => hashes[index] !== asset.contentHash,
  );
  check(
    damaged.length === 0,
    `all ${manifest.assets.length} files serve their bytes${failing(damaged.map((asset) => asset.uuid))}`,
  );

  const about = api(server, 'GET', '/api/admin/about').body as any;
  check(
    about?.data?.slogan === manifest.slogan,
    'the profile keeps its slogan',
  );

  const answers = (path: string) => {
    const status = api(server, 'GET', path, undefined, {
      visitor: true,
    }).status;
    return status >= 200 && status < 400;
  };
  // Stage addresses are dropped on purpose in 0.0.4, not redirected: a stage
  // became a section with the same slug and public ID, and has to answer at
  // that section's address instead.
  const lost = manifest.sitemap.filter(
    (path) =>
      !answers(path) &&
      !(
        /^\/projects\/[^/]+\/stages\/[^/]+\/$/.test(path) &&
        answers(path.replace(/\/stages\//, '/sections/'))
      ),
  );
  check(
    lost.length === 0,
    `all ${manifest.sitemap.length} addresses the site had answer${failing(lost)}`,
  );
  const listed = sitemapPaths(server).filter((path) =>
    manifest.privateIds.some((id) => path.includes(id)),
  );
  check(listed.length === 0, `nothing private is listed${failing(listed)}`);
}

/** What went wrong, for a check's message; nothing when all went well. */
function failing(items: string[]): string {
  return items.length ? `: ${items.join(', ')}` : '';
}

// --------------------------------------------------------------------- steps

/** Builds the seed site on `server`, checks it and copies it out. */
export async function buildSeedSite(server: Server): Promise<void> {
  rmSync(seedDir, { recursive: true, force: true });
  mkdirSync(seedDir, { recursive: true });
  installOrFail(server, lastRelease);
  completeWizard(server);
  signIn(server);

  const manifest: SeedManifest = {
    release: lastRelease,
    entities: [],
    assets: [],
    slogan: 'Проверяю, что ничего не потерялось ✨',
    sitemap: [],
    privateIds: [],
  };
  const files = await uploadFiles(server, manifest);
  createSite(server, files, manifest);
  manifest.sitemap = sitemapPaths(server);
  check(
    manifest.sitemap.some((path) => path.includes('BenchNorth')),
    `the site lists its ${manifest.sitemap.length} public pages`,
  );
  checkSeedSite(server, manifest);

  // Stopped first, so the database is whole on disk.
  mustExec(server, 'systemctl stop thei');
  must('docker', ['cp', `${server.name}:/opt/thei/content`, seedCopy]);
  // Written last and at once: its presence says the copy is complete.
  writeFileSync(`${manifestPath}.tmp`, JSON.stringify(manifest, null, 2));
  renameSync(`${manifestPath}.tmp`, manifestPath);
  log(
    `The seed site is ready (${manifest.entities.length} entities, ${manifest.assets.length} files)`,
  );
}

/**
 * The seed site, once the `seed` step running beside this scenario has made
 * it. A scenario installs its own server meanwhile and waits only here.
 */
export function awaitSeedSite(): SeedManifest {
  log('Waiting for the seed site');
  const failed = join(artifactsDir, 'result-seed.json');
  const deadline = Date.now() + 45 * 60 * 1000;
  while (Date.now() < deadline) {
    if (existsSync(manifestPath)) {
      return JSON.parse(readFileSync(manifestPath, 'utf8')) as SeedManifest;
    }
    if (existsSync(failed) && !JSON.parse(readFileSync(failed, 'utf8')).ok) {
      throw new BenchFailure('The seed site could not be made; see its log.');
    }
    Bun.sleepSync(2000);
  }
  throw new BenchFailure('The seed site did not appear in time.');
}

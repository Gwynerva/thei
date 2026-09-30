import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import {
  emptyOgContent,
  type OgCardContent,
  type OgCardKind,
  type OgPicture,
  type OgSite,
} from '../../../server/thei/og/model';

/**
 * Pictures and cards for the Open Graph tests and the gallery.
 *
 * The pictures are drawn here, as SVG, and written as the formats the
 * library holds, so every run starts from the same pixels: a photograph of a
 * sunset, a forest, a panorama, a portrait, an icon on a flat field, a logo
 * on nothing, a picture too small to be anything, pure white, pure black, a
 * vector drawing, and a file that is not a picture at all.
 */
export interface OgArtworkSet {
  directory: string;
  sunset: OgPicture;
  forest: OgPicture;
  panorama: OgPicture;
  portrait: OgPicture;
  square: OgPicture;
  flatIcon: OgPicture;
  logo: OgPicture;
  tiny: OgPicture;
  white: OgPicture;
  black: OgPicture;
  grey: OgPicture;
  vector: OgPicture;
  corrupt: OgPicture;
  generated: (
    kind:
      | 'project'
      | 'page'
      | 'event'
      | 'tag'
      | 'diary-entry'
      | 'project-stage'
      | 'author',
    hue: number,
  ) => OgPicture;
  remove: () => Promise<void>;
}

function landscape(
  width: number,
  height: number,
  sky: string[],
  ground: string,
) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1">${sky
    .map(
      (color, index) =>
        `<stop offset="${index / (sky.length - 1)}" stop-color="${color}"/>`,
    )
    .join('')}</linearGradient></defs>
  <rect width="${width}" height="${height}" fill="url(#s)"/>
  <circle cx="${width * 0.62}" cy="${height * 0.42}" r="${Math.min(width, height) * 0.11}" fill="#ffe3a8"/>
  <path d="M0 ${height * 0.72} L${width * 0.3} ${height * 0.45} L${width * 0.55} ${height * 0.66} L${width * 0.8} ${height * 0.5} L${width} ${height * 0.7} L${width} ${height} L0 ${height} Z" fill="${ground}"/>
  <rect y="${height * 0.78}" width="${width}" height="${height * 0.22}" fill="#1c2d52" opacity="0.8"/>
  <rect x="${width * 0.24}" y="${height * 0.42}" width="${width * 0.03}" height="${height * 0.26}" fill="#f4f0ea"/>
  <rect x="${width * 0.24}" y="${height * 0.5}" width="${width * 0.03}" height="${height * 0.05}" fill="#c8423a"/>
</svg>`;
}

function icon(size: number, field: string | undefined, glyph: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  ${field ? `<rect width="100" height="100" fill="${field}"/>` : ''}
  <path d="M50 12 L61 38 L89 40 L67 58 L74 86 L50 71 L26 86 L33 58 L11 40 L39 38 Z" fill="${glyph}"/>
</svg>`;
}

async function write(
  directory: string,
  name: string,
  svg: string,
  format: 'webp' | 'jpeg' | 'png' | 'avif' | 'svg',
  size: { width: number; height: number },
  accent?: { hue: number; chroma: number },
): Promise<OgPicture> {
  const file = join(directory, `${name}.${format}`);
  if (format === 'svg') await writeFile(file, svg);
  else {
    const image = sharp(Buffer.from(svg));
    await (
      format === 'jpeg'
        ? image.jpeg({ quality: 88 })
        : format === 'png'
          ? image.png()
          : format === 'avif'
            ? image.avif({ quality: 60 })
            : image.webp({ quality: 85 })
    ).toFile(file);
  }
  return { type: 'file', key: `${name}.${format}`, file, ...size, accent };
}

export async function createArtwork(): Promise<OgArtworkSet> {
  const directory = await mkdtemp(join(tmpdir(), 'thei-og-'));
  const corruptFile = join(directory, 'corrupt.webp');
  await writeFile(corruptFile, Buffer.from('not a picture at all'));
  return {
    directory,
    sunset: await write(
      directory,
      'sunset',
      landscape(
        1600,
        900,
        ['#f7c58c', '#ee8f6a', '#8a6aa6', '#2a3b66'],
        '#3b3560',
      ),
      'webp',
      { width: 1600, height: 900 },
      { hue: 40, chroma: 0.12 },
    ),
    forest: await write(
      directory,
      'forest',
      landscape(
        1200,
        900,
        ['#d8f0e0', '#8cc9a0', '#3f8a5a', '#163a26'],
        '#1d4d2c',
      ),
      'jpeg',
      { width: 1200, height: 900 },
      { hue: 150, chroma: 0.11 },
    ),
    panorama: await write(
      directory,
      'panorama',
      landscape(4000, 400, ['#a6d8ff', '#3f7fc4', '#0b2745'], '#23355e'),
      'avif',
      { width: 4000, height: 400 },
      { hue: 245, chroma: 0.12 },
    ),
    portrait: await write(
      directory,
      'portrait',
      landscape(400, 2000, ['#ffd9e2', '#d4537e', '#4b1528'], '#72243e'),
      'webp',
      { width: 400, height: 2000 },
      { hue: 355, chroma: 0.14 },
    ),
    square: await write(
      directory,
      'square',
      landscape(
        1000,
        1000,
        ['#fff0bf', '#f09a5e', '#b54a26', '#3d1406'],
        '#5a2410',
      ),
      'webp',
      { width: 1000, height: 1000 },
      { hue: 45, chroma: 0.14 },
    ),
    flatIcon: await write(
      directory,
      'flat-icon',
      icon(512, '#2d6cdf', '#ffffff'),
      'png',
      { width: 512, height: 512 },
      { hue: 262, chroma: 0.17 },
    ),
    logo: await write(
      directory,
      'logo',
      icon(512, undefined, '#e0703f'),
      'png',
      { width: 512, height: 512 },
      { hue: 45, chroma: 0.16 },
    ),
    tiny: await write(
      directory,
      'tiny',
      icon(32, '#7a58d6', '#ffffff'),
      'png',
      { width: 32, height: 32 },
      { hue: 295, chroma: 0.17 },
    ),
    white: await write(
      directory,
      'white',
      '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#ffffff"/></svg>',
      'webp',
      { width: 800, height: 600 },
      { hue: 0, chroma: 0 },
    ),
    black: await write(
      directory,
      'black',
      '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#000000"/></svg>',
      'webp',
      { width: 1600, height: 900 },
      { hue: 0, chroma: 0 },
    ),
    grey: await write(
      directory,
      'grey',
      landscape(1400, 900, ['#eeeeee', '#999999', '#444444'], '#333333'),
      'jpeg',
      { width: 1400, height: 900 },
      { hue: 0, chroma: 0 },
    ),
    vector: await write(
      directory,
      'vector',
      icon(24, '#0f6e56', '#e1f5ee'),
      'svg',
      { width: 24, height: 24 },
      { hue: 170, chroma: 0.1 },
    ),
    corrupt: {
      type: 'file',
      key: 'corrupt.webp',
      file: corruptFile,
      width: 800,
      height: 600,
    },
    generated: (kind, hue) => ({ type: 'generated', kind, hue }),
    // sharp keeps files it has read open on Windows until its cache lets go.
    remove: async () => {
      sharp.cache(false);
      await rm(directory, {
        recursive: true,
        force: true,
        maxRetries: 5,
      }).catch(() => {});
    },
  };
}

export const SITE: OgSite = { name: 'Петра Радько', domain: 'petra.example' };

const LONG_TITLE =
  'Полностью задокументированный многолетний проект по восстановлению северных маяков, их линз, архивов смотрителей и всего остального, что удалось найти';
const LONG_SUMMARY =
  'Очень длинное описание, которое никто не стал сокращать. '.repeat(40);

function content(
  kind: OgCardKind,
  seed: string,
  headline: string,
  accent: { hue: number; chroma: number },
  rest: Partial<OgCardContent> = {},
  site: OgSite = SITE,
): OgCardContent {
  return { ...emptyOgContent(kind, seed, headline, site, accent), ...rest };
}

export interface OgFixture {
  name: string;
  content: OgCardContent;
}

/**
 * Cards of every kind, each in its ordinary form and at the edges: nothing
 * but a title, far too much of everything, pictures of every awkward shape,
 * scripts beyond Russian and English.
 */
export function ogFixtures(art: OgArtworkSet): OgFixture[] {
  const projectChips = [
    { icon: 'project', label: 'Проект' },
    { icon: 'star', label: 'В витрине' },
  ];
  const projectMeta = [
    { icon: 'calendar', text: '2023 — 2026 · 7 этапов' },
    { icon: 'file-tray-stack', text: '12 разделов' },
    { icon: 'event', text: '48 событий' },
    { icon: 'thought', text: '130 записей' },
  ];
  const tags = ['море', 'фотография', 'экспедиции', 'север', 'маяки'];
  return [
    {
      name: 'project with a wide banner',
      content: content(
        'project',
        'project-banner',
        'Атлас северных маяков',
        { hue: 40, chroma: 0.12 },
        {
          chips: projectChips,
          summary:
            'Три года экспедиций по Белому морю: карты, дневники, фотографии и реставрация двух маяков.',
          meta: projectMeta,
          tags,
          tagsTotal: 8,
          picture: art.flatIcon,
          banner: art.sunset,
        },
      ),
    },
    {
      name: 'project with an icon',
      content: content(
        'project',
        'project-icon',
        'Мастерская линз',
        { hue: 45, chroma: 0.16 },
        {
          chips: [projectChips[0]!],
          summary:
            'Восстанавливаю оптику старых маяков: от чертежей до шлифовки стекла.',
          status: 'Сейчас: шлифую линзу Френеля',
          meta: projectMeta.slice(0, 2),
          tags: tags.slice(0, 2),
          tagsTotal: 2,
          picture: art.logo,
        },
      ),
    },
    {
      name: 'project with a photo for an icon and a 4:3 banner',
      content: content(
        'project',
        'project-photo',
        'Дом у залива',
        { hue: 45, chroma: 0.14 },
        {
          chips: [projectChips[0]!],
          summary: 'Как старый дом стал мастерской.',
          meta: projectMeta.slice(0, 1),
          picture: art.square,
          banner: art.forest,
        },
      ),
    },
    {
      name: 'project with a panorama banner',
      content: content(
        'project',
        'project-panorama',
        'Архив экспедиций',
        { hue: 150, chroma: 0.11 },
        {
          chips: projectChips,
          summary: 'Плёнка и цифра: всё, что снято за десять лет.',
          meta: projectMeta,
          picture: art.flatIcon,
          banner: art.panorama,
        },
      ),
    },
    {
      name: 'project without a picture',
      content: content(
        'project',
        'project-bare',
        'Без картинки',
        { hue: 210, chroma: 0.15 },
        {
          chips: [projectChips[0]!],
          summary: 'Проект, у которого нет ни иконки, ни баннера.',
          meta: projectMeta.slice(0, 2),
          picture: art.generated('project', 210),
        },
      ),
    },
    {
      name: 'far too much of everything',
      content: content(
        'project',
        'project-everything',
        LONG_TITLE,
        { hue: 280, chroma: 0.2 },
        {
          chips: [
            ...projectChips,
            { icon: 'case-important', label: 'В резюме' },
          ],
          summary: LONG_SUMMARY,
          status: 'Сейчас: '.repeat(20),
          meta: [
            ...projectMeta,
            { icon: 'project', text: '1 234 567 проектов' },
          ],
          related: {
            icon: 'project',
            titles: Array.from(
              { length: 3 },
              (_, index) =>
                `Очень длинное название связанного проекта ${index}`,
            ),
            total: 40,
          },
          tags: Array.from(
            { length: 60 },
            (_, index) => `длинный-тег-номер-${index}`,
          ),
          tagsTotal: 200,
          picture: art.tiny,
          banner: art.portrait,
          parent: { title: LONG_TITLE, picture: art.flatIcon },
        },
        {
          name: 'Очень длинное имя сайта, которое владелец написал целиком, с отчеством и регалиями',
          domain: 'a-very-long-domain-name-for-a-personal-archive.example.org',
        },
      ),
    },
    {
      name: 'one unbreakable word',
      content: content(
        'project',
        'project-word',
        'Экспериментальныйпроектбезединогопробелавообще',
        { hue: 330, chroma: 0.15 },
        {
          chips: [projectChips[0]!],
          picture: art.flatIcon,
        },
      ),
    },
    {
      name: 'one character',
      content: content(
        'project',
        'project-char',
        'Я',
        { hue: 20, chroma: 0.18 },
        {
          chips: [projectChips[0]!],
          picture: art.generated('project', 20),
        },
      ),
    },
    {
      name: 'other scripts',
      content: content(
        'project',
        'project-scripts',
        'Zażółć gęślą jaźń · Ελληνικά · Tiếng Việt · Ґанок',
        { hue: 100, chroma: 0.13 },
        {
          chips: [projectChips[0]!],
          summary: 'Příliš žluťoučký kůň úpěl ďábelské ódy; Ğüşiöç.',
          meta: projectMeta.slice(0, 2),
          picture: art.vector,
        },
      ),
    },
    {
      name: 'grey artwork',
      content: content(
        'project',
        'project-grey',
        'Чёрно-белые годы',
        { hue: 0, chroma: 0 },
        {
          chips: [projectChips[0]!],
          summary: 'Всё, что снято на чёрно-белую плёнку.',
          picture: art.generated('project', 0),
          banner: art.grey,
        },
      ),
    },
    {
      name: 'white and black pictures',
      content: content(
        'project',
        'project-white',
        'Белый лист',
        { hue: 0, chroma: 0 },
        {
          chips: [projectChips[0]!],
          picture: art.white,
          banner: art.black,
        },
      ),
    },
    {
      name: 'a picture that cannot be read',
      content: content(
        'project',
        'project-corrupt',
        'Сломанный файл',
        { hue: 60, chroma: 0.12 },
        {
          chips: [projectChips[0]!],
          summary: 'Файлы иконки и баннера повреждены.',
          picture: art.corrupt,
          banner: art.corrupt,
        },
      ),
    },
    {
      name: 'stage with a photo',
      content: content(
        'stage',
        'stage-photo',
        'Реставрация фонаря',
        { hue: 355, chroma: 0.14 },
        {
          chips: [{ icon: 'calendar', label: 'Этап 3 из 7' }],
          parent: { title: 'Атлас северных маяков', picture: art.logo },
          summary: 'Разобрали фонарь, отмыли призмы и заново собрали механизм.',
          meta: [{ icon: 'calendar', text: 'май — август 2025' }],
          picture: art.portrait,
        },
      ),
    },
    {
      name: 'section with a drawing',
      content: content(
        'section',
        'section-drawing',
        'Карта маршрута',
        { hue: 45, chroma: 0.16 },
        {
          chips: [{ icon: 'file-tray-stack', label: 'Раздел' }],
          parent: { title: 'Атлас северных маяков', picture: art.logo },
          summary: 'Где мы шли, где ночевали и где ждали погоду.',
          meta: [{ icon: 'history', text: 'обновлено 2 сентября 2026' }],
          picture: art.logo,
        },
      ),
    },
    {
      name: 'section without a picture',
      content: content(
        'section',
        'section-bare',
        'Как устроена линза Френеля',
        { hue: 170, chroma: 0.1 },
        {
          chips: [{ icon: 'file-tray-stack', label: 'Раздел' }],
          parent: {
            title: 'Мастерская линз',
            picture: art.generated('project', 45),
          },
          summary: 'Кольца, призмы и почему маяк видно за двадцать миль.',
          meta: [{ icon: 'history', text: 'обновлено 2 сентября 2026' }],
          picture: art.generated('project-stage', 170),
        },
      ),
    },
    {
      name: 'event with a wide photo',
      content: content(
        'event',
        'event-wide',
        'Первый рассвет на Соловках',
        { hue: 40, chroma: 0.12 },
        {
          chips: [{ icon: 'event', label: 'Событие' }],
          summary:
            'Поднялись на маяк в четыре утра — и море оказалось розовым.',
          meta: [{ icon: 'calendar', text: '14 июня 2024' }],
          related: {
            icon: 'project',
            titles: ['Атлас северных маяков'],
            total: 1,
          },
          tags: ['море', 'рассвет'],
          tagsTotal: 2,
          picture: art.sunset,
        },
      ),
    },
    {
      name: 'event with a date and a square photo',
      content: content(
        'event',
        'event-date',
        'День открытых дверей маяка',
        { hue: 45, chroma: 0.14 },
        {
          chips: [{ icon: 'event', label: 'Событие' }],
          summary: 'Пришло больше ста человек.',
          meta: [{ icon: 'calendar', text: '14 июня 2024' }],
          related: {
            icon: 'project',
            titles: ['Атлас северных маяков', 'Мастерская линз'],
            total: 3,
          },
          tags: ['маяки'],
          tagsTotal: 1,
          picture: art.square,
        },
      ),
    },
    {
      name: 'event with a tiny icon',
      content: content(
        'event',
        'event-tiny',
        'Встреча смотрителей',
        { hue: 295, chroma: 0.17 },
        {
          chips: [{ icon: 'event', label: 'Событие' }],
          meta: [{ icon: 'calendar', text: '1 мая 2025' }],
          picture: art.tiny,
        },
      ),
    },
    {
      name: 'event with an approximate month',
      content: content(
        'event',
        'event-month',
        'Переезд на север',
        { hue: 220, chroma: 0.13 },
        {
          chips: [{ icon: 'event', label: 'Событие' }],
          meta: [{ icon: 'approximate', text: 'март 2009' }],
          picture: art.generated('event', 220),
        },
      ),
    },
    {
      name: 'event without a date or a picture',
      content: content(
        'event',
        'event-bare',
        'Что-то запомнившееся',
        { hue: 120, chroma: 0.14 },
        {
          chips: [{ icon: 'event', label: 'Событие' }],
          tags: ['разное'],
          tagsTotal: 1,
          picture: art.generated('event', 120),
        },
      ),
    },
    {
      name: 'diary entry with a photo',
      content: content(
        'diary',
        '2024-09-03',
        '3 сентября 2024',
        { hue: 290, chroma: 0.15 },
        {
          chips: [{ icon: 'thought', label: 'Запись дневника' }],
          quote:
            'Глава про маяк на Жижгине наконец готова. Ветер стих к вечеру, и впервые за неделю было слышно море…',
          related: {
            icon: 'project',
            titles: ['Атлас северных маяков', 'Мастерская линз'],
            total: 2,
          },
          picture: art.forest,
          date: {
            weekday: 'вторник',
            day: '3',
            month: 'сентября',
            year: '2024',
          },
        },
      ),
    },
    {
      name: 'diary entry with a long text',
      content: content(
        'diary',
        '2028-02-29',
        '29 февраля 2028',
        { hue: 10, chroma: 0.1 },
        {
          chips: [{ icon: 'thought', label: 'Запись дневника' }],
          quote: LONG_SUMMARY,
          meta: [{ icon: 'event', text: '4 события' }],
          picture: art.generated('diary-entry', 10),
          date: {
            weekday: 'вторник',
            day: '29',
            month: 'февраля',
            year: '2028',
          },
        },
      ),
    },
    {
      name: 'empty diary entry',
      content: content(
        'diary',
        '2020-01-01',
        '1 января 2020',
        { hue: 200, chroma: 0.1 },
        {
          chips: [{ icon: 'thought', label: 'Запись дневника' }],
          picture: art.generated('diary-entry', 200),
          date: { weekday: 'среда', day: '1', month: 'января', year: '2020' },
        },
      ),
    },
    {
      name: 'diary entry with a portrait photo',
      content: content(
        'diary',
        '2025-02-14',
        '14 февраля 2025',
        { hue: 355, chroma: 0.14 },
        {
          chips: [{ icon: 'thought', label: 'Запись дневника' }],
          quote: 'Весь день у окна: снег, чай и старые письма смотрителей.',
          picture: art.portrait,
          date: {
            weekday: 'пятница',
            day: '14',
            month: 'февраля',
            year: '2025',
          },
        },
      ),
    },
    {
      name: 'page with an icon',
      content: content(
        'page',
        'page-icon',
        'Как я веду архив своей жизни',
        { hue: 262, chroma: 0.17 },
        {
          chips: [{ icon: 'page', label: 'Страница' }],
          summary:
            'Инструменты, привычки и правила, которые пережили десять лет записей.',
          meta: [{ icon: 'history', text: 'обновлено 2 сентября 2026' }],
          picture: art.flatIcon,
        },
      ),
    },
    {
      name: 'page without an icon',
      content: content(
        'page',
        'page-bare',
        'Как я веду архив своей жизни и зачем это всё',
        { hue: 275, chroma: 0.16 },
        {
          chips: [{ icon: 'page', label: 'Страница' }],
          summary:
            'Инструменты, привычки и правила, которые пережили десять лет записей.',
          picture: art.generated('page', 275),
        },
      ),
    },
    {
      name: 'tag with an icon',
      content: content(
        'tag',
        'tag-icon',
        'Фотография',
        { hue: 150, chroma: 0.11 },
        {
          chips: [{ icon: 'tag', label: 'Тег' }],
          summary: 'Плёнка и цифра: экспедиции, портреты, семейные архивы.',
          meta: [
            { icon: 'project', text: '24 проекта' },
            { icon: 'event', text: '57 событий' },
          ],
          picture: art.logo,
        },
      ),
    },
    {
      name: 'tag without an icon',
      content: content(
        'tag',
        'tag-bare',
        'Маяки',
        { hue: 60, chroma: 0.14 },
        {
          chips: [{ icon: 'tag', label: 'Тег' }],
          meta: [{ icon: 'project', text: '1 проект' }],
          picture: art.generated('tag', 60),
        },
      ),
    },
    {
      name: 'home',
      content: content(
        'site',
        'site',
        'Петра Радько',
        { hue: 290, chroma: 0.14 },
        {
          chips: [{ icon: 'person', label: 'Личный архив' }],
          summary: 'Инженер, фотограф и собиратель северных маяков',
          stats: [
            { icon: 'project', value: '18', label: 'проектов' },
            { icon: 'event', value: '240', label: 'событий' },
            { icon: 'thought', value: '1 204', label: 'записи' },
          ],
          picture: art.square,
        },
      ),
    },
    {
      name: 'home with nothing',
      content: content(
        'site',
        'site-bare',
        'Я',
        { hue: 180, chroma: 0.1 },
        {
          picture: art.generated('author', 180),
        },
        { name: 'Я' },
      ),
    },
    {
      name: 'life',
      content: content(
        'service:life',
        'service:life',
        'Жизнь',
        { hue: 355, chroma: 0.15 },
        {
          chips: [{ icon: 'heart', label: 'Хроника' }],
          summary: '2009 — 2026',
          meta: [
            { icon: 'project', text: '18 проектов' },
            { icon: 'event', text: '240 событий' },
            { icon: 'thought', text: '1 204 записи' },
          ],
          histogram: {
            values: [
              12, 20, 18, 30, 26, 34, 40, 38, 52, 48, 60, 55, 70, 82, 76, 95,
              100, 64,
            ],
            first: '2009',
            last: '2026',
          },
        },
      ),
    },
    {
      name: 'life of sixty years',
      content: content(
        'service:diary',
        'service:diary',
        'Дневник',
        { hue: 290, chroma: 0.12 },
        {
          chips: [{ icon: 'thought', label: 'Дневник' }],
          meta: [{ icon: 'thought', text: '12 345 записей' }],
          histogram: {
            values: Array.from(
              { length: 60 },
              (_, index) => (index * 37) % 100,
            ),
            first: '1966',
            last: '2026',
          },
        },
      ),
    },
    {
      name: 'tags index',
      content: content(
        'service:tags',
        'service:tags',
        'Теги',
        { hue: 150, chroma: 0.12 },
        {
          chips: [{ icon: 'tag', label: 'Теги' }],
          meta: [{ icon: 'tag', text: '86 тегов' }],
          cloud: [
            {
              title: 'фотография',
              accent: { hue: 40, chroma: 0.14 },
              count: 81,
              picture: art.square,
            },
            { title: 'море', accent: { hue: 230, chroma: 0.12 }, count: 42 },
            {
              title: 'семья',
              accent: { hue: 300, chroma: 0.12 },
              count: 35,
              picture: art.logo,
            },
            { title: 'походы', accent: { hue: 140, chroma: 0.13 }, count: 27 },
            { title: 'музыка', accent: { hue: 0, chroma: 0.14 }, count: 19 },
            {
              title: 'маяки',
              accent: { hue: 80, chroma: 0.14 },
              count: 16,
              picture: art.flatIcon,
            },
            { title: 'север', accent: { hue: 200, chroma: 0.1 }, count: 14 },
            { title: 'работа', accent: { hue: 0, chroma: 0 }, count: 12 },
            { title: 'кино', accent: { hue: 30, chroma: 0.12 }, count: 9 },
            { title: 'книги', accent: { hue: 260, chroma: 0.12 }, count: 8 },
            { title: 'друзья', accent: { hue: 330, chroma: 0.13 }, count: 7 },
          ],
          cloudTotal: 86,
        },
      ),
    },
    {
      name: 'tags index with far too many',
      content: content(
        'service:tags',
        'service:tags-many',
        'Теги',
        { hue: 40, chroma: 0.12 },
        {
          chips: [{ icon: 'tag', label: 'Теги' }],
          meta: [{ icon: 'tag', text: '150 тегов' }],
          cloud: Array.from({ length: 150 }, (_, index) => ({
            title:
              index % 7
                ? `тег-${index}`
                : `очень-длинный-тег-с-подробностями-${index}`,
            accent: { hue: (index * 47) % 360, chroma: 0.12 },
            count: 150 - index,
          })),
          cloudTotal: 150,
        },
      ),
    },
    {
      name: 'showcase',
      content: content(
        'service:showcase',
        'service:showcase',
        'Витрина',
        { hue: 260, chroma: 0.12 },
        {
          chips: [{ icon: 'star', label: 'Избранное' }],
          summary: 'Проекты, которыми владелец гордится больше всего.',
          meta: [{ icon: 'project', text: '12 проектов' }],
          tiles: [art.flatIcon, art.square, art.logo],
          tilesTotal: 12,
        },
      ),
    },
    {
      name: 'search with one result',
      content: content(
        'service:search',
        'service:search',
        'Поиск',
        { hue: 200, chroma: 0.1 },
        {
          chips: [{ icon: 'search', label: 'Поиск' }],
          summary: 'Проекты, события, записи и страницы — всё в одном месте.',
          tiles: [art.logo],
          tilesTotal: 1,
        },
      ),
    },
    {
      name: 'rewind',
      content: content(
        'service:rewind',
        'service:rewind',
        'Назад во времени',
        { hue: 50, chroma: 0.13 },
        {
          chips: [{ icon: 'history', label: 'В этот день' }],
          summary: 'Что происходило в этот день в разные годы.',
        },
      ),
    },
  ];
}

import { bindShortWords, generalNormalize } from '../general-normalize';
import { defineI18nModule } from '../define';
import { slugify, transliterateCyrillic } from '../slugify';
import type { AiBuiltinTemplateKey } from '../../ai-template';

/**
 * Предлоги, союзы и частицы, которые не должны оставаться в конце строки.
 */
const BOUND_WORDS = [
  'а',
  'б',
  'в',
  'ж',
  'и',
  'к',
  'о',
  'с',
  'у',
  'я',
  'без',
  'бы',
  'во',
  'для',
  'до',
  'же',
  'за',
  'из',
  'или',
  'как',
  'ко',
  'ли',
  'на',
  'над',
  'не',
  'ни',
  'но',
  'об',
  'от',
  'по',
  'под',
  'при',
  'про',
  'со',
  'то',
  'что',
];

function normalize(text: string): string {
  return bindShortWords(
    generalNormalize(text)
      // "text" → «text» (guillemets)
      .replace(/"([^"]*)"/g, '\u00AB$1\u00BB'),
    BOUND_WORDS,
  );
}

function slugifyRussian(text: string): string {
  return slugify(transliterateCyrillic(text));
}

export function plural(
  count: number,
  one: string,
  two: string,
  five: string,
  includeNumber = true,
): string {
  const text = [five, one, two, two, two, five][
    count % 100 > 10 && count % 100 < 20 ? 0 : Math.min(count % 10, 5)
  ]!;
  return includeNumber ? `${count} ${text}` : text;
}

/** So many of what a check looks at, by the check. */
function checkUnits(count: number, key: AiBuiltinTemplateKey) {
  const words = {
    describe: ['файл', 'файла', 'файлов'],
    graph: ['запись', 'записи', 'записей'],
    tags: ['запись', 'записи', 'записей'],
    links: ['ссылка', 'ссылки', 'ссылок'],
    proofread: ['текст', 'текста', 'текстов'],
  }[key] as [string, string, string];
  return plural(count, ...words);
}

function joinDuration(parts: string[]) {
  if (parts.length < 3) return parts.join(' и ');
  return `${parts.slice(0, -1).join(', ')} и ${parts.at(-1)}`;
}

function formatDuration(years: number, months: number, days: number) {
  return joinDuration(
    [
      years ? plural(years, 'год', 'года', 'лет') : '',
      months ? plural(months, 'месяц', 'месяца', 'месяцев') : '',
      days ? plural(days, 'день', 'дня', 'дней') : '',
    ].filter(Boolean),
  );
}

export default defineI18nModule({
  code: 'ru',
  normalize,
  slugify: slugifyRussian,
  sizeUnits: { b: 'байт', kb: 'Кб', mb: 'Мб', gb: 'Гб' },
  // Без ё, й, ъ, ы и ь: ими пункты списка не обозначают.
  listLetters: 'абвгдежзиклмнопрстуфхцчшщэюя',
  sampleDisplayNames: [
    'Петр',
    'Петра',
    'Евгений',
    'Анна',
    'Светлана',
    'Алексей',
    'Мария',
  ],
  sampleSecretPhrases: [
    'Мой любимый 🐈 - Пушок',
    'Быть или не быть, вот в чем вопрос',
    'Пароль рыба-меч',
    'Никто никогда не вернется в 2007 год',
    'Ничто не истина, всё дозволено',
  ],
  secretCodenames: [
    'Альфа',
    'Бета',
    'Гамма',
    'Дельта',
    'Эпсилон',
    'Дзета',
    'Эта',
    'Тета',
    'Йота',
    'Каппа',
    'Лямбда',
    'Мю',
    'Ню',
    'Кси',
    'Омикрон',
    'Пи',
    'Ро',
    'Сигма',
    'Тау',
    'Ипсилон',
    'Фи',
    'Хи',
    'Пси',
    'Омега',
    'X',
    'Y',
    'Z',
  ],
  secretSummaries: [
    'Контент скрыт от обычных посетителей',
    'Подробности выдаются только по пропускам',
    'Засекречено до лучших времён',
    'Здесь что-то есть, но это тайна',
    'Доступ только для своих',
    'Архив под грифом «секретно»',
    'Этот материал пока отдыхает от публики',
    'Скоро рассекретим. Или нет',
    'Тсс… пока это между нами',
    'Хранится в сейфе под тремя замками',
    'Выдаётся по форме допуска номер ноль',
    'Эту историю расскажем как-нибудь потом',
    'Замок на месте, ключ у автора',
    'Совершенно секретно',
    'Шифровку ещё не разгадали',
    'За этой дверью только посвящённые',
  ],
  sampleProjects: [
    {
      title: 'Цифровой сад',
      summary:
        'Личный сайт для открытого мышления: заметки, незрелые идеи и эссе, которые растут со временем.',
      slug: 'digital-garden',
    },
    {
      title: '365 дней фотографии',
      summary:
        'Снимал по одному фото каждый день в течение года, чтобы развить чувство композиции.',
      slug: '365-photography',
    },
    {
      title: 'Японский: первый год',
      summary:
        'Достиг разговорного уровня японского через ежедневные занятия и месяц полного погружения.',
      slug: 'japanese-year-one',
    },
    {
      title: 'Сборка клавиатуры',
      summary:
        'Спроектировал и спаял механическую клавиатуру 65% — от голой платы до готовых кейкапов.',
      slug: 'custom-keyboard',
    },
    {
      title: 'Месяц в опенсорсе',
      summary:
        'Провёл месяц, отправляя пул-реквесты в проекты, которыми пользуюсь каждый день.',
      slug: 'open-source-month',
    },
    {
      title: 'Кампания: Железный берег',
      summary:
        'Написал, провёл и импровизировал 12-сессионную кампанию по настольной ролевой игре для пяти игроков.',
      slug: 'campaign-iron-coast',
    },
    {
      title: 'Шахматы: 1000 → 1500',
      summary:
        'Изучал эндшпили и тактические задачи три месяца и вырос на 500 рейтинговых очков.',
      slug: 'chess-climb',
    },
    {
      title: 'Подкаст: Побочные эффекты',
      summary:
        'Записал и смонтировал шесть эпизодов о неожиданных последствиях в технологиях и науке.',
      slug: 'podcast-side-effects',
    },
    {
      title: 'Основы Blender',
      summary:
        'Прошёл структурированный курс по 3D-моделированию и построил пять сцен с нуля.',
      slug: 'blender-basics',
    },
    {
      title: 'CTF-сезон',
      summary:
        'Участвовал в восьми CTF-соревнованиях в команде, решив более 40 задач.',
      slug: 'ctf-season',
    },
  ],
  phrases: {
    asset_library: 'Хранилище файлов',
    asset_library_search: 'Поиск по файлам',
    asset_aspect_hint: (ratio, size) =>
      `Лучше всего подойдёт изображение или видео с пропорциями ${ratio}, например ${size} пикселей`,
    asset_library_pending_deletion: (date) =>
      `Не используется: будет удалён после ${date}`,
    asset_library_in_history:
      'Не используется, но хранится, пока его показывает версия какого-то текста',
    asset_library_held_by_ai:
      'Не используется, но хранится, пока он нужен действию ИИ: ждущему вашего решения или такому, которое ещё можно отменить',
    asset_library_empty: 'Подходящих файлов нет',
    asset_library_unused: 'Неиспользуемые',
    asset_library_unused_hint:
      'Неиспользуемые файлы автоматически удаляются через сутки.',
    asset_library_anywhere: 'Везде',
    asset_library_widen: 'Искать шире',
    asset_library_used: 'Используются',
    asset_library_more: 'Показать ещё',
    asset_library_insert: 'Вставить выбранное',
    asset_library_usage: 'Где используется',
    asset_library_described: 'Описание',
    asset_library_described_any: 'С описанием и без',
    asset_library_described_none: 'Без описания',
    asset_library_described_some: 'С описанием',
    asset_used_elsewhere: 'Где ещё используется',
    asset_about: 'О файле',
    asset_format: (kind, extension) => {
      const upper = extension.toUpperCase();
      return {
        pdf: 'Документ PDF',
        zip: 'Архив ZIP',
        table: `Таблица ${upper}`,
        text: 'Текст',
        markdown: 'Текст Markdown',
        html: 'Страница HTML',
        other: upper ? `Файл ${upper}` : 'Файл',
      }[kind];
    },
    asset_library_properties: 'Свойства файла',
    asset_library_settings: 'Как получен файл',
    asset_recipe_original: 'Сохранён как загружен',
    asset_recipe_zip: 'ZIP-архив',
    asset_recipe_crop: (region, source) => `Обрезка ${region} из ${source}`,
    asset_recipe_crop_region: (region) => `Обрезка ${region}`,
    asset_recipe_rotation: (degrees) => `Поворот на ${degrees}°`,
    asset_recipe_stretched: 'без сохранения пропорций',
    asset_recipe_quality: (quality) => `качество ${quality}`,
    asset_recipe_quality_level: (level) => `${level.toLowerCase()} качество`,
    asset_recipe_lossless: 'без потерь',
    asset_recipe_no_audio: 'без звука',
    asset_recipe_fast: 'быстрая конвертация',
    asset_recipe_bitrate: (kbps) => `${kbps} кбит/с`,
    asset_recipe_mono: 'моно',
    asset_quality_minimal: 'Минимальное',
    asset_quality_low: 'Низкое',
    asset_quality_medium: 'Среднее',
    asset_quality_high: 'Высокое',
    asset_quality_maximum: 'Максимальное',
    asset_quality_lossless: 'Без потерь',
    asset_library_description:
      'Все загруженные файлы: где используется каждый, сколько весит и какие у него варианты.',
    asset_description: 'Описание файла',
    asset_description_hint:
      'Что показано в файле или о чём он, в одном или нескольких предложениях: для поиска, для AI и для тех, кто его не видит. Одно на файл и все его варианты.',
    asset_description_placeholder: 'Что это за файл?',
    asset_description_global: 'Глобально',
    asset_description_global_hint:
      'Глобальное описание файла, даже если он будет показываться в других местах.',
    asset_description_why:
      'Пара предложений о том, о чём файл. По нему файл находят в поиске, его читают нейросети и те, кто файл не видит.',
    asset_detach_hint: 'Убрать отсюда. Файл останется в хранилище.',
    asset_here: 'Здесь',
    asset_library_other_variants: 'Другие варианты',
    asset_library_unused_line: 'Не используется',
    asset_library_history_line: 'Только в истории текстов',
    asset_library_held_by_ai_line: 'Только в действиях ИИ',
    asset_open_place: (title) => `Открыть «${title}» в новой вкладке`,
    asset_open_variant: 'Открыть этот вариант',
    asset_preview_frame: 'Превью',
    asset_preview_frame_chosen: (time) => `Выбран вручную · ${time}`,
    asset_preview_frame_auto: 'Подобран сам',
    asset_preview_frame_take: (time) => `Взять текущий кадр · ${time}`,
    asset_preview_frame_take_hint:
      'Кадр станет превью этого видео и других его вариантов везде, где они показаны',
    asset_preview_frame_auto_take: 'Подобрать самому',
    asset_preview_frame_seek: 'Перейти к этому кадру',
    asset_preview_frame_error: 'Не удалось взять кадр.',
    asset_preview_frame_partial: (count) =>
      `Не все варианты взяли кадр: ${count} с прежним.`,
    asset_description_save: 'Сохранить описание файла',
    asset_description_saved: 'Описание файла сохранено',
    asset_description_conflict:
      'Его изменили в другом месте. Ваш текст остался в поле: сохраните ещё раз, и он заменит то, что там теперь.',
    asset_description_too_long: (max) => `Не больше ${max} символов`,
    asset_description_error: 'Не удалось сохранить описание файла.',
    asset_hash_check: 'Проверка файла',
    asset_hash_error: 'Не удалось проверить файл. Выберите его ещё раз.',
    asset_selection_type: 'Этот тип файла не подходит для поля.',
    asset_selection_size:
      'Размер варианта превышает ограничение. Создайте вариант меньшего размера.',
    asset_library_retry: 'Повторить',
    asset_library_selection_failed:
      'Не удалось подтвердить выбранные файлы. Возможно, один из них удалён. Уберите недоступный файл или повторите попытку.',
    asset_library_missing: 'Этот файл больше недоступен. Выберите другой файл.',
    asset_role_favicon: 'Фавикон',
    asset_role_icon: 'Иконка',
    asset_role_banner: 'Баннер',
    asset_role_content: 'Содержимое',
    asset_role_project_description: 'Описание проекта',
    asset_role_event_description: 'Описание события',
    asset_role_page_content: 'Содержимое страницы',
    asset_role_profile_about: 'Обо мне',
    asset_role_showcase: 'Витрина',
    asset_role_other: 'Вложение',
    asset_role_preview: 'Превью',
    asset_role_action_icon: 'Иконка кнопки',
    asset_role_action_background: 'Фон кнопки',
    asset_role_action_file: 'Файл кнопки',
    asset_role_ai_attachment: 'Принесён в сессию',
    asset_role_avatar: 'Аватар',
    asset_role_status: 'Статус',
    asset_source_profile: 'Профиль',
    asset_source_ai_session: 'Сессия ИИ',
    site_settings: 'Настройки сайта',
    about_me: 'Обо мне',
    profile_name: 'Имя',
    profile_slogan: 'Слоган',
    profile_detailed_description: 'Подробное описание',
    profile_avatar: 'Аватар',
    profile_avatar_hint: 'Основное изображение вашего профиля.',
    profile_banner: 'Баннер',
    profile_banner_hint: 'Широкое изображение в шапке профиля.',
    profile_favicon: 'Иконка сайта',
    profile_favicon_hint: 'Показывается во вкладках браузера и в поиске.',
    profile_status: 'Статус',
    profile_statuses: 'Статусы',
    profile_status_hint: 'Краткие описания вашего состояния.',
    project_status: 'Статус проекта',
    project_statuses: 'Статусы проекта',
    project_tabs: 'Разделы страницы проекта',
    project_tab_overview: 'Обзор',
    project_tab_timeline: 'Хронология',
    project_timeline_seo_description: (title) =>
      `Хронология проекта «${title}»: разделы, статусы, связанные события и записи дневника.`,
    project_status_hint:
      'Краткие описания состояний, в которых находится проект.',
    project_new_status: 'Новый статус проекта',
    project_status_empty: 'Статусов пока нет',
    profile_facts: 'Факты',
    profile_facts_hint:
      'Короткие пары «название — значение»: город, профессия, языки и тому подобное.',
    profile_custom_facts: 'Кастомные факты',
    profile_fact_incomplete: 'у каждого нужны и название, и значение',
    profile_nickname: 'Псевдоним',
    profile_birth_date: 'Дата рождения',
    profile_field: 'Поле',
    profile_value: 'Значение',
    profile_pinned_pages: 'Закреплённые страницы',
    profile_pinned_pages_hint:
      'Страницы, ссылки на которые появятся прямо в профиле на главной.',
    profile_links: 'Ссылки',
    profile_links_hint:
      'Ваши профили и сайты в сети. Приватные видны только вам.',
    profile_popular_tags: 'Популярные теги',
    profile_show_all: 'Смотреть всё',
    profile_hide: 'Свернуть',
    profile_pinned_page_add: 'Закрепить страницу',
    profile_empty: 'Пока ничего нет',
    profile_load_error: 'Не удалось загрузить. Попробовать снова',
    profile_new_avatar: 'Новый аватар',
    profile_avatar_history: 'История аватарок',
    profile_best_projects: 'Витринные проекты',
    profile_new_status: 'Новый статус',
    profile_new_project_status: 'Новый статус проекта',
    profile_new_life_status: 'Новый статус жизни',
    profile_edit_status: 'Изменение статуса',
    profile_status_placeholder: 'Сегодня я чувствую себя…',
    profile_status_icon: 'Иконка',
    profile_status_date: 'Дата',
    profile_empty_status: 'нет активного статуса',
    profile_password_hint: 'Оставьте пустым, чтобы сохранить текущий пароль',
    profile_password_mismatch: 'Пароли не совпадают',
    profile_settings_description:
      'Язык, адрес и доступ к сайту, аналитика, вход в админ-панель и резервные копии.',
    profile_about_description:
      'Имя, аватар, статусы, факты и ссылки — всё, что посетители видят на главной.',
    profile_personal_hint:
      'Персональные настройки применяются сразу в этом браузере',
    profile_avatar_count: (count: number) => `1 из ${count}`,
    profile_age: (age: number) => plural(age, 'год', 'года', 'лет'),
    profile_reorder: 'Перетащите для сортировки',
    profile_more: 'Загрузить ещё',
    language_name: 'Русский',
    life: 'Жизнь',
    life_activity: 'Активность',
    life_activity_actions: (count) =>
      plural(count, 'действие', 'действия', 'действий'),
    life_activity_empty: 'Ничего не происходило',
    life_activity_loading: 'Загрузка…',
    life_activity_close: 'Закрыть день',
    life_activity_events: (count) =>
      plural(count, 'событие', 'события', 'событий'),
    life_activity_projects: (count) =>
      plural(count, 'проект', 'проекта', 'проектов'),
    life_activity_pages: (count) =>
      plural(count, 'страница', 'страницы', 'страниц'),
    life_activity_sections: (count) =>
      plural(count, 'раздел проекта', 'раздела проекта', 'разделов проектов'),
    life_activity_profile: (count) =>
      plural(
        count,
        'изменение профиля',
        'изменения профиля',
        'изменений профиля',
      ),
    life_activity_statuses: (count) =>
      plural(count, 'статус', 'статуса', 'статусов'),
    life_activity_secret: (count) =>
      plural(count, 'скрытая запись', 'скрытые записи', 'скрытых записей'),
    life_activity_diary: (count) =>
      plural(count, 'запись дневника', 'записи дневника', 'записей дневника'),
    projects: 'Проекты',
    events: 'События',
    pages: 'Страницы',
    tags: 'Теги',
    settings: 'Настройки',
    public_view_mode: 'Режим просмотра',
    public_view_admin: 'Админ',
    public_view_admin_hint: 'Приватный контент будет виден.',
    public_view_guest: 'Гость',
    public_view_guest_hint: 'Приватный контент будет скрыт.',
    public_navigation: 'Навигация по сайту',
    public_sign_in: 'Вход в админ-панель',
    public_sign_in_hint: 'Для владельца сайта',
    activity_summary: 'Сводка активности',
    life_rewind: (day) => `${day} в прошлом`,
    life_rewind_seo_title: 'Взгляд в прошлое',
    life_rewind_description:
      'Каким был этот день в прошлые годы? Здесь собраны события, перемены и проекты, которые начались, завершились или продолжались в эту дату. Небольшое путешествие по разным годам жизни.',
    life_rewind_empty: 'У этого дня пока нет воспоминаний',
    life_rewind_empty_description:
      'В записях прошлых лет для этого дня пока ничего не нашлось. Но рядом — целая жизнь и другие моменты, к которым можно вернуться.',
    life_rewind_explore_life: 'Заглянуть в Жизнь',
    event_ongoing: 'Идёт событие',
    event_was_ongoing: 'Шло событие',
    period_until: (date) => `до ${date}`,
    period_state_ongoing: 'идёт',
    period_state_upcoming: 'впереди',
    public_timeline_ongoing_until: (date) => `Идёт, до ${date}`,
    view_all: 'Смотреть все',
    life_empty: 'В Жизни пока нет публичных моментов',
    event_started: 'Началось событие',
    event_ended: 'Завершилось событие',
    event_occurred: 'Состоялось событие',
    project_created: 'Создан проект',
    page_created: 'Создана страница',
    section_created: 'Создан раздел',
    section_started: 'Начался раздел',
    section_ended: 'Завершился раздел',
    section_occurred: 'Прошёл раздел',
    section_ongoing: 'Продолжается раздел',
    section_was_ongoing: 'Продолжался раздел',
    diary_written: 'Запись в дневнике',
    secret_event: (codename: string) => `Секретное событие ${codename}`,
    secret_project: (codename: string) => `Секретный проект ${codename}`,
    secret_page: (codename: string) => `Секретная страница ${codename}`,
    secret_diary_entry: (codename: string) => `Секретная запись ${codename}`,
    secret_section: (codename: string) => `Секретный раздел ${codename}`,
    secret_media: (codename: string) => `Секретное медиа ${codename}`,
    secret_file: (codename: string) => `Секретный файл ${codename}`,
    secret_hint: 'Скрыто от посетителей',
    life_gap: (years, months, days) =>
      `через ${formatDuration(years, months, days)}`,
    life_copy_link: 'Скопировать ссылку на этот день',
    life_filter: 'Что показывать',
    life_filter_all: 'Показывать всё',
    life_filter_kind: (kind: string) =>
      ({
        event: 'События',
        project: 'Проекты',
        page: 'Страницы',
        'project-section': 'Разделы проектов',
        'profile-avatar': 'Аватарки',
        'profile-status': 'Статусы',
        'diary-entry': 'Записи дневника',
      })[kind] ?? kind,
    public_timeline_from: (date) => `С ${date}`,
    public_timeline_until: (date) => `По ${date}`,
    public_timeline_duration: formatDuration,
    public_life_description:
      'Непрерывная лента событий, проектов и записей дневника.',
    home: 'Главная',
    llms_txt_intro:
      'Личный архив одной жизни. Три основных вида записей, от простого к сложному: запись дневника — датированная мысль без заголовка, событие — оформленный памятный момент, проект — крупный эпизод из своих разделов: общих — о его составных частях — и этапов, разделов с датами, через которые он прошёл. Связи соединяют проекты, события и записи дневника: у каждой записи перечислены связанные с ней и отмечены те, что на неё влияют или от неё зависят. Рядом с ними страницы — самостоятельные тексты, теги — сквозные темы, а Жизнь — единая хронология, на которую всё это ложится.',
    llms_txt_sections: 'Разделы',
    llms_txt_home:
      'кто это, текущий статус, лучшие проекты и последние моменты',
    llms_txt_life: 'всё датированное в одной хронологии, от новых к старым',
    llms_txt_diary: 'короткие датированные записи, только они и ничего больше',
    llms_txt_tags: 'темы, которые объединяют проекты и события',
    llms_txt_pages: 'самостоятельные тексты вне хронологии',
    llms_txt_search:
      'поиск по всем публичным текстам, по словам в любой их форме: /search/?q=…',
    llms_txt_sitemap: 'все публичные адреса этого сайта',
    llms_txt_markdown_title: 'Markdown',
    llms_txt_markdown:
      'Любой публичный проект, раздел проекта, событие, страница или запись дневника отдаются и в Markdown: добавьте index.md к адресу, например /projects/name-id/index.md. Приватных частей там нет — ровно как и для любого другого посетителя.',
    public_life_period_description: (period, siteName) =>
      `События, проекты и записи дневника за ${period.toLocaleLowerCase('ru-RU')} — ${siteName}.`,
    public_pages_description:
      'Самостоятельные статичные материалы сайта: каждый существует сам по себе и не связан ни с проектами, ни с событиями, ни с другими записями.',
    public_tags_description:
      'Сквозная классификация проектов и событий: тег объединяет всё, что связано общей темой или признаком.',
    public_tag_description: (title) => `Проекты и события с тегом «${title}».`,
    search: 'Поиск',
    public_search_description:
      'Поиск по всему сайту: проектам, событиям, дневнику, страницам и файлам.',
    public_search_query_title: (query) => `«${query}»`,
    public_search_query_description: (query) => `Всё на сайте о «${query}».`,
    search_placeholder: 'Искать на сайте…',
    search_clear: 'Очистить поиск',
    search_filters: 'Фильтры',
    search_filter_type: 'Что искать',
    search_type_all: 'Всё',
    search_filter_projects: 'Проекты',
    search_tags_filter_placeholder: 'Найти тег…',
    search_tags_active: 'Выбранные теги',
    search_tags_none: 'Подходящих тегов нет',
    search_tag_include: (tag) => `Искать с тегом «${tag}»`,
    search_tag_exclude: (tag) => `Искать без тега «${tag}»`,
    search_tag_remove: (tag) => `Убрать тег «${tag}» из фильтра`,
    search_filter_remove: (filter) => `Убрать фильтр «${filter}»`,
    search_reset_filters: 'Сбросить фильтры',
    search_results_count: (projects, events) => {
      const parts = [
        projects ? plural(projects, 'проект', 'проекта', 'проектов') : '',
        events ? plural(events, 'событие', 'события', 'событий') : '',
      ].filter(Boolean);
      if (!parts.length) return 'Ничего не найдено';
      // «Событие» is neuter, so only a leading project count changes the verb.
      const verb = projects
        ? plural(projects, 'Найден', 'Найдено', 'Найдено', false)
        : 'Найдено';
      return `${verb} ${parts.join(' и ')}`;
    },
    search_empty: 'Ничего не нашлось',
    search_empty_description:
      'Попробуйте изменить запрос или ослабить фильтры.',
    search_kind: (kind) =>
      ({
        project: 'Проект',
        'project-section': 'Раздел проекта',
        event: 'Событие',
        'diary-entry': 'Дневник',
        page: 'Страница',
        file: 'Файл',
        tag: 'Тег',
        profile: 'Профиль',
      })[kind],
    search_kind_group: (kind) =>
      ({
        project: 'Проекты',
        'project-section': 'Разделы проектов',
        event: 'События',
        'diary-entry': 'Дневник',
        page: 'Страницы',
        file: 'Файлы',
        tag: 'Теги',
        profile: 'Профиль',
      })[kind],
    search_where: (where) =>
      ({
        title: 'Название',
        name: 'Найдено по другому названию',
        summary: 'Описание',
        heading: 'Заголовок',
        section: 'Раздел проекта',
        text: 'Текст',
        caption: 'Подпись',
        file: 'Описание файла',
        hint: 'Подсказка',
        link: 'Заметка к ссылке',
        relation: 'Связь',
        period: 'Период',
        status: 'Статус',
        fact: 'Профиль',
        notes: 'Личные заметки',
        place: 'Где показан',
        tag: 'Тег',
        day: 'День',
      })[where],
    search_where_section: (title) => `Раздел «${title}»`,
    search_access_private: 'Видно только вам',
    search_access_link: 'Видно только тем, у кого есть ссылка',
    search_access_private_short: 'Только вам',
    search_access_link_short: 'По ссылке',
    search_edit: 'Изменить',
    search_more_finds: (count) =>
      `Ещё в ${plural(count, 'месте', 'местах', 'местах')}`,
    search_fewer_finds: 'Свернуть места',
    search_all_of_kind: (count) => `Все ${count}`,
    search_all_results: (count) => `Все результаты: ${count}`,
    search_show_results: (count) =>
      count
        ? `Показать ${plural(count, 'результат', 'результата', 'результатов')}`
        : 'Показать',
    search_keyboard: (read) =>
      `Найдено по «${read}» — так запрос читается в другой раскладке.`,
    search_partial:
      'Показано найденное по отдельным словам: вместе они нигде не встречаются.',
    search_building: (percent) =>
      `Поиск ещё готовится (${percent} %): часть найденного может не показаться.`,
    search_busy: 'Поиск сейчас занят: ответ вот-вот придёт.',
    search_failed: 'Не удалось выполнить поиск. Попробуйте ещё раз.',
    search_quick_empty: 'Попробуйте другое слово.',
    search_quick_hint:
      'Проекты, события, дневник, страницы, файлы и теги — по любому слову в них.',
    search_years: 'Годы',
    search_sort: 'Сортировка',
    search_sort_best: 'Сначала точные',
    search_sort_new: 'Сначала новые',
    search_sort_old: 'Сначала старые',
    search_dated: (by, day) =>
      ({
        added: `Добавлено ${day}`,
        shown: day,
        'last-used': `Последний раз ${day}`,
        'first-used': `Впервые ${day}`,
      })[by],
    search_no_filters: 'Для этого контента фильтров нет',
    search_year_count: (year, count) => `${year}: найдено ${count}`,
    search_recent: 'Недавние',
    search_actions: 'Действия',
    search_action_diary_today: 'Запись дневника за сегодня',
    search_action_diary_today_new: 'Написать запись за сегодня',
    search_action_diary_day: (day) => `Запись дневника за ${day}`,
    search_action_diary_day_new: (day) => `Написать запись за ${day}`,
    search_action_edit: (title) => `Редактировать «${title}»`,
    search_action_view: (title) => `Открыть «${title}» на сайте`,
    search_action_section: 'Раздел админки',
    search_action_new_project: (title) => `Новый проект «${title}»`,
    search_action_new_event: (title) => `Новое событие «${title}»`,
    search_action_new_page: (title) => `Новая страница «${title}»`,
    search_action_ask_ai: (text) => `Спросить ИИ: «${text}»`,
    forbidden_title: 'Это личное пространство',
    forbidden_description: 'Только администратор может просматривать это.',
    not_found_title: 'Здесь ничего нет',
    not_found_description:
      'Страница могла переехать, исчезнуть или никогда не существовала.',
    error_title: 'Что-то пошло не так',
    error_description: 'Сейчас эту страницу не получается открыть.',
    back_home: 'На главную',
    open_life: 'Открыть Жизнь',
    pagination: 'Навигация по страницам',
    previous: 'Предыдущая страница',
    next: 'Следующая страница',
    public_details_expand: 'Развернуть панель',
    content_integration_youtube: 'Видео YouTube',
    public_details_links: 'Ссылки',
    public_details_files: 'Файлы',
    public_details_overview: 'Сводка',
    public_details_contents: 'Содержание',
    public_project_description: 'Описание проекта',
    public_details_neighbour_sections: 'Соседние разделы',
    public_details_neighbour_entries: 'Соседние записи',
    public_neighbour_next: 'Вперёд',
    public_neighbour_previous: 'Назад',
    public_details_chronology: 'Технические даты',
    public_details_timeline: 'Хронология',
    project_chronology_page: 'Страница проекта',
    project_chronology_updated: 'Обновление проекта',
    page_chronology_created: 'Страница создана',
    page_chronology_updated: 'Страница обновлена',
    section_chronology_created: 'Раздел создан',
    section_chronology_updated: 'Раздел обновлён',
    event_chronology_created: 'Событие создано',
    event_chronology_updated: 'Событие обновлено',
    diary_chronology_created: 'Запись создана',
    diary_chronology_updated: 'Запись обновлена',
    install_thei: 'Установка Thei',
    visuals: 'Внешний вид',
    visuals_description:
      'Применяется только для вас. Посетители могут выбрать свои настройки.',
    theme: 'Тема',
    theme_system: 'Системная',
    theme_light: 'Светлая',
    theme_dark: 'Тёмная',
    accent_color: 'Акцентный цвет',
    font_style: 'Стиль шрифта',
    font_sans: 'Без засечек',
    font_serif: 'С засечками',
    global_settings: 'Глобальные настройки',
    global_settings_description:
      'Общие параметры: влияют на всех посетителей и на то, как сайт видят поисковики.',
    ui_language: 'Язык интерфейса',
    ui_language_hint: 'Выберите тот же язык, на котором будете писать контент.',
    site_access: 'Доступ к сайту',
    site_access_open: 'Открытый',
    site_access_closed: 'Закрытый',
    site_access_open_hint:
      'Публичную часть сайта может открыть любой посетитель.',
    site_access_closed_hint:
      'Сайт виден только вам после входа, посетители получают ошибку.',
    site_access_open_description:
      'Посетить сайт может любой. Можно точечно ограничивать доступ к отдельным проектам, событиям, страницам и файлам. Подойдет большинству.',
    site_access_closed_description:
      'Любой контент сайта сможете просматривать только вы. Подойдет секретным агентам, которые держат все аспекты своей жизни в строжайшем секрете.',
    site_url: 'Адрес сайта',
    site_url_hint:
      'Если оставить пустым, адрес берётся из каждого запроса — этого достаточно для одного домена за обычным прокси. Заполните, если сайт отвечает на нескольких адресах или живёт в подпапке. Пример: https://example.com/diary',
    site_url_invalid_short: 'не полный адрес со схемой и хостом',
    site_url_invalid:
      'Введите полный адрес со схемой и хостом, при желании с путём до папки, но без параметров и якоря. Пример: https://example.com/diary',
    site_url_rebuild_pending: (base) =>
      `Сайт пока отдаётся по адресу ${base}. Смена папки применится после следующей пересборки сайта.`,
    site_url_robots_title: 'robots.txt для корня домена',
    site_url_robots_hint:
      'Поисковики читают robots.txt только в корне домена, а он не принадлежит этому сайту. Добавьте эти правила в корневой файл сами.',
    analytics: 'Аналитика и поисковые системы',
    analytics_description:
      'Счётчики и коды подтверждения вставляются как есть и попадают в head страницы. Ваши собственные визиты под админом не учитываются.',
    analytics_invalid_short: 'не похоже на идентификатор этого сервиса',
    analytics_invalid:
      'Проверьте идентификаторы: вставьте значение или целиком фрагмент от сервиса.',
    analytics_google_tag: 'Google Analytics (идентификатор измерения)',
    analytics_google_tag_hint:
      'Выглядит как G-XXXXXXXXXX. Переходы внутри сайта считает расширенная статистика Google.',
    analytics_google_verification: 'Код подтверждения Google',
    analytics_google_verification_hint:
      'Значение мета-тега google-site-verification.',
    analytics_yandex_metrika: 'Яндекс Метрика (номер счётчика)',
    analytics_yandex_metrika_hint:
      'Только цифры. О переходах внутри сайта Thei сообщает счётчику сам.',
    analytics_yandex_verification: 'Код подтверждения Яндекса',
    analytics_yandex_verification_hint:
      'Значение мета-тега yandex-verification.',
    admin_data: 'Данные администратора',
    admin_data_description:
      'Фраза и пароль для входа в админ-панель. Их смена завершит сессии на других устройствах.',
    how_to_address_you: 'Как к вам обращаться?',
    display_name_hint: (name: string) =>
      `Можно имя или ник: "Привет, ${name}!"`,
    secret_phrase: 'Секретная фраза',
    secret_phrase_hint:
      'Любая фраза для входа в админ-панель вместе с паролем. Чем сложнее, тем лучше! Можно с эмоджи 😎',
    password: 'Пароль',
    repeat_password: 'Повторите пароль',
    install: 'Установить',
    installing: 'Установка',
    this_field_must_be_filled: 'Это поле должно быть заполнено!',
    administrator: 'Администратор',
    thei_admin_panel_sign_in: 'Вход в админ-панель Thei',
    sign_in: 'Войти',
    sign_out: 'Выйти',
    signing_in: 'Вход',
    invalid_secret_phrase_or_password: 'Неверная секретная фраза или пароль!',
    sign_in_too_many_attempts:
      'Слишком много попыток входа! Попробуйте через несколько секунд.',
    sign_in_link: 'Быстрый вход',
    sign_in_link_description:
      'Одноразовая ссылка, которая входит в админку на другом устройстве. Отсканируйте код камерой телефона или отправьте себе адрес.',
    sign_in_link_renew: 'Новая ссылка',
    sign_in_link_invalid:
      'Эта ссылка больше не работает: её уже использовали или срок истёк.',
    sign_in_link_too_many:
      'Слишком много активных ссылок. Отзовите одну, прежде чем создавать новую.',
    sign_in_link_expires: (time) => `Истекает ${time}`,
    sign_in_link_confirm: 'Войти в админку на этом устройстве?',
    sign_in_link_copy: 'Копировать ссылку',
    sign_in_link_copy_qr: 'Копировать QR',
    sign_in_link_qr: 'QR-код ссылки для входа',
    copy: 'Копировать',
    copied: 'Скопировано',
    quoted: (text) => `«${text}»`,
    share_links: 'Временный доступ',
    share_links_description:
      'Ссылки открывают эту страницу вместе со всем приватным и сами закрываются в срок.',
    share_link_create: 'Создать ссылку',
    share_link_label: 'Назначение',
    share_link_label_placeholder: 'Кому даём доступ?',
    share_link_unlabeled: 'Без назначения',
    share_link_duration: 'Срок',
    share_link_extend: 'Продлить',
    share_link_extend_by: 'Продлить на',
    share_link_empty: 'Ссылок пока нет',
    share_link_closes_in: (hours, minutes) =>
      `Закроется через ${[hours ? `${hours} ч` : '', minutes || !hours ? `${minutes} мин` : ''].filter(Boolean).join(' ')}`,
    share_link_expired: 'Эта ссылка доступа больше не действует.',
    share_link_too_many: 'Слишком много ссылок. Сначала отзовите одну из них.',
    share_link_private_site:
      'Сайт полностью закрыт, поэтому ссылка ничего не откроет. Сначала откройте сайт.',
    share_banner_whole:
      'Эти материалы не опубликованы — не пересылайте и не распространяйте их.',
    share_banner_part:
      'Часть материалов здесь не опубликована — не пересылайте и не распространяйте её.',
    share_banner_ended: 'Временный доступ закончился.',
    share_link_duration_30m: '30 мин',
    share_link_duration_1h: '1 час',
    share_link_duration_6h: '6 часов',
    share_link_duration_24h: 'Сутки',
    admin_sessions: 'Сессии администратора',
    admin_sessions_description:
      'Где открыта админ-панель. Здесь же можно войти на другом устройстве по QR-коду.',
    active_admin_sessions: 'Активные сессии',
    active_admin_sessions_description:
      'Устройства, где сейчас выполнен вход. Завершите сессию, если не узнаёте её.',
    destroyed_admin_sessions: 'Отключенные сессии',
    destroyed_admin_sessions_description:
      'Завершённые и истёкшие входы. Хранятся для истории и доступа не дают.',
    destroy_session: 'Отключить сессию',
    show_x_destroyed_sessions: (count: number) =>
      `Показать ${plural(count, 'отключенную сессию', 'отключенные сессии', 'отключенных сессий')}`,
    session_details: 'Детали сессии',
    created_at: 'Дата создания',
    updated_at: 'Изменено',
    last_active_at: 'Активность',
    online: 'Онлайн',
    this_is_you: 'Это вы',
    failed_to_fetch_data: 'Не удалось загрузить данные!',
    admin_panel: 'Админ-панель',
    admin_projects: 'Проекты',
    admin_events: 'События',
    admin_diary: 'Дневник',
    admin_diary_description:
      'Короткие датированные мысли: одна запись на день, без заголовка и без лишних полей.',
    admin_kind_project_title: 'Что такое проект',
    admin_kind_project_what:
      'Проект — самостоятельный, крупный эпизод жизни со своей структурой: разделы — общие и этапы с датами, — витрина, файлы и ссылки.',
    admin_kind_project_rank:
      'Самое весомое в архиве. Проект собирает вокруг себя события и записи дневника — связи с ними задаются именно здесь. Если хватает названия и пары абзацев, это скорее событие.',
    admin_kind_project_examples:
      'Например: своё приложение, учёба в университете, ремонт квартиры, подготовка к марафону.',
    admin_kind_event_title: 'Что такое событие',
    admin_kind_event_what:
      'Событие — небольшой памятный момент, который не хочется забыть: у него есть название, даты, теги и медиа.',
    admin_kind_event_rank:
      'Весомее записи дневника, но легче проекта: без разделов. Событие никогда не является частью проекта — проект лишь может быть с ним связан.',
    admin_kind_event_examples:
      'Например: концерт любимой группы, доклад на митапе, получение водительских прав, поездка на выходные.',
    admin_kind_diary_title: 'Что такое запись дневника',
    admin_kind_diary_what:
      'Запись дневника — самое простое в архиве: день и текст о нём. Одна запись на день, без заголовка и тегов, поэтому написать её ничего не стоит.',
    admin_kind_diary_rank:
      'Легче события: если момент хочется назвать и потом находить отдельно, это событие. Связать запись с проектом можно в самом проекте.',
    admin_kind_diary_examples:
      'Например: мысли после прочитанной книги, как прошёл день переезда, идея, пришедшая в дороге.',
    admin_pages: 'Страницы',
    admin_pages_description:
      'Самостоятельные тексты вне хронологии, например биография или контакты, со своим адресом.',
    to_admin_panel: 'В админ-панель',
    to_website: 'На сайт',
    project: 'Проект',
    x_projects: (count: number) =>
      plural(count, 'проект', 'проекта', 'проектов'),
    event: 'Событие',
    x_events: (count: number) => plural(count, 'событие', 'события', 'событий'),
    section: 'Раздел',
    page: 'Страница',
    new_project: 'Новый проект',
    new_event: 'Новое событие',
    new_page: 'Новая страница',
    new_diary_entry: 'Новая запись',
    diary_entry: 'Запись дневника',
    diary: 'Дневник',
    x_diary_entries: (count: number) =>
      plural(count, 'запись', 'записи', 'записей'),
    site_status: 'Состояние сайта',
    site_version: 'Версия Thei',
    update_available: (version) => `Обновить до ${version}`,
    update_available_hint:
      'Доступна новая версия Thei. Обновление не затрагивает содержимое сайта.',
    disk_usage: 'Дисковое пространство',
    disk_thei_files: 'Файлы Thei',
    disk_other_files: 'Прочие файлы',
    disk_free_space: 'Свободно',
    disk_free_short: (size) => `${size} свободно`,
    disk_thei_short: (size) => `Thei занимает ${size}`,
    backups: 'Резервные копии',
    backups_description:
      'Копия `content/` на машине, которой вы управляете. Сгенерируйте токен, ' +
      'скачайте скрипт и запустите его там.',
    backup_last: 'Последняя копия',
    backup_never: 'Копий ещё не было',
    backup_stale_short: 'Пора сделать копию',
    backup_stale_warning:
      'Резервная копия не создавалась больше недели. Всё содержимое ' +
      '`content/` существует только на этом сервере.',
    backup_kind_auto: 'По расписанию',
    backup_kind_manual: 'Вручную',
    backup_token: 'Токен резервного копирования',
    backup_token_hint:
      'С ним работает скрипт копирования. Тот, у кого он есть, может ' +
      'выгрузить всё содержимое, поэтому относитесь к нему как к паролю.',
    backup_token_generate: 'Сгенерировать токен',
    backup_token_regenerate: 'Заменить токен',
    backup_token_revoke: 'Отозвать',
    backup_token_missing: 'Токена нет — копирование невозможно',
    backup_token_active: 'Токен активен',
    backup_token_shown_once:
      'Скопируйте сейчас. Он показывается один раз и не читается обратно: ' +
      'потерянный токен заменяют, а не восстанавливают.',
    backup_script_windows: 'Скрипт для Windows',
    backup_script_unix: 'Скрипт для Linux и macOS',
    backup_setup_hint:
      'Скачайте скрипт на машину, где будут храниться копии, — ничего ' +
      'устанавливать не нужно — и запустите: `thei-backup.cmd` в Windows, ' +
      '`bash thei-backup.sh` в остальных системах. Адрес сайта уже внутри, ' +
      'а если скачать сразу после генерации токена — то и токен. Останется ' +
      'выбрать папку и включить еженедельное расписание.',
    backup_history: 'Последние запуски',
    backup_run_summary: (files: number, size: string) =>
      `${files} файл(ов), ${size}`,
    ai_access_on_hint:
      'Включено: ИИ-приложения подключаются по ключам доступа, а в сессиях ' +
      'может отвечать ваша модель. Выключите — и ИИ спрячется с сайта; ' +
      'сессии, память и ключи останутся до включения.',
    ai_access_off_hint:
      'Выключено: ни одно приложение не подключится, Thei не обращается к ' +
      'модели, сессий и предложений не видно. Сессии, память, ключи и ' +
      'настройки сохранены и вернутся, как только вы включите ИИ — здесь ' +
      'или первым блоком «Настроек сайта».',
    api_token_create: 'Создать ключ',
    api_token_label: 'Для чего он',
    api_token_label_placeholder: 'Claude Code на ноутбуке',
    api_token_label_required: 'Назовите ключ: для чего он.',
    api_token_access: 'Доступ',
    api_token_preset_reader: 'Читатель',
    api_token_preset_reader_hint:
      'Читает всё и оставляет предложения: вы принимаете их или нет. Сам ничего не меняет.',
    api_token_preset_editor: 'Редактор',
    api_token_preset_editor_hint:
      'Может всё, что можете вы: создавать, править, загружать файлы, публиковать и удалять. Каждое изменение видно в его сессии, и его можно отменить; удаление не отменить.',
    api_token_preset_custom: 'Особый',
    api_token_empty: 'Ключей доступа пока нет',
    api_token_never_used: 'Ещё не использовался',
    api_token_last_used: 'Использовался',
    api_token_revoke: 'Отозвать',
    api_token_too_many:
      'Слишком много ключей. Отзовите тот, что больше не нужен.',
    api_token_shown_once:
      'Скопируйте сейчас. Ключ показывается один раз и не читается обратно: ' +
      'потерянный заменяют, а не восстанавливают.',
    api_token_endpoint: 'Адрес',
    api_token_connect_hint:
      'Укажите приложению этот адрес и ключ — он передаётся в этом ' +
      'заголовке. Как это делается в каждом приложении, сказано выше.',
    ai_page: 'ИИ',
    ai_page_description:
      'Сессии с ИИ и его действия, что он помнит о вас, подключение приложений и модели.',
    ai_tab_connection: 'Подключение',
    ai_switch: 'ИИ в Thei',
    ai_welcome:
      'ИИ в Thei работает в сессиях: вы говорите с моделью или с ' +
      'приложением об архиве, а оно читает, вычитывает тексты и предлагает ' +
      'действия — связи, теги, заметки, правки. Без вас ничего не меняется; ' +
      'что применил ключ Редактора, видно в его сессии и отменяется.',
    ai_ways_facts: {
      what: 'Что это',
      how: 'Как',
      pays: 'Кто платит',
      rights: 'Права',
    },
    ai_ways_cards: {
      app: {
        title: 'ИИ-приложение работает с архивом',
        what: 'Ваше ИИ-приложение читает архив и помогает с ним прямо в разговоре с вами.',
        how: 'Thei выдаёт ключ доступа, и приложение подключается с ним.',
        pays: 'Приложение — по вашей обычной подписке. Thei ничего не тратит.',
        rights:
          'Читатель только читает и предлагает. Редактор меняет сам; каждое изменение видно в его сессии и отменяется.',
      },
      model: {
        title: 'Thei сам обращается к модели',
        what: 'Модель отвечает в сессиях на этой странице: читает архив и предлагает действия, а применяете их вы.',
        how: 'Нужен ключ API от сервиса, который даёт доступ к модели.',
        pays: 'Вы — этому сервису, за каждый ответ. Расход ограничен лимитом на месяц.',
        rights: 'Только читает и предлагает.',
      },
    },
    api_tokens_title: 'Ключи доступа',
    api_tokens_hint:
      'У каждого приложения свой ключ; отозванный перестаёт работать сразу.',
    ai_connect_title: 'Подключить приложение',
    ai_connect_apps: {
      claude: 'Claude',
      chatgpt: 'ChatGPT',
      'claude-code': 'Claude Code',
      other: 'Другое',
    },
    ai_connect_steps: {
      claude: [
        'В Claude откройте Настройки → Коннекторы → «Добавить свой коннектор». Он появится и в приложениях для компьютера и телефона.',
        'Вставьте адрес ниже и добавьте коннектор.',
        'Откроется страница этого сайта: войдите, выберите права и разрешите.',
      ],
      chatgpt: [
        'В ChatGPT включите режим разработчика: Настройки → Коннекторы → Дополнительно.',
        'Создайте коннектор: адрес ниже, аутентификация — OAuth.',
        'Откроется страница этого сайта: войдите, выберите права и разрешите.',
      ],
      'claude-code': [
        'Выполните команду ниже в терминале.',
        'В Claude Code наберите /mcp, выберите thei и «Authenticate» — откроется страница этого сайта. Или создайте ключ доступа ниже и добавьте его заголовок к команде через --header.',
      ],
      other: [
        'Укажите приложению адрес ниже.',
        'Если оно умеет входить по OAuth, оно само откроет страницу этого сайта. Если нет — создайте ключ доступа и передайте его в заголовке Authorization: Bearer.',
      ],
    },
    ai_connect_no_sign_in:
      'Входом это приложение не подключить: сайту нужен HTTPS. Подключите его по ключу доступа или включите HTTPS.',
    ai_connect_proxy:
      'Сайт открыт в подпапке: чтобы приложения нашли вход, перенаправьте на прокси',
    api_token_signed_in: (client) => `подключено входом: ${client}`,
    api_token_signed_in_verified: (client, host) =>
      `Подключено входом: ${client}, опознано по описанию на ${host}`,
    api_token_signed_in_unverified: (client) =>
      `Подключено входом: ${client} — приложение назвалось само`,
    oauth_consent: 'Подключение ИИ-приложения',
    oauth_consent_title: (client, site) =>
      `${client} просит доступ к «${site}»`,
    oauth_verified: (host) => `Опознано по своему описанию на ${host}`,
    oauth_unverified:
      'Приложение назвалось само: его имя проверить нельзя. Разрешайте, только если подключение начали вы.',
    oauth_redirect_web: (host) => `После ответа вы вернётесь на ${host}`,
    oauth_redirect_elsewhere: (host) =>
      `После ответа вы попадёте на ${host} — это не адрес приложения. Убедитесь, что так и должно быть.`,
    oauth_redirect_loopback: (port) =>
      `Ответ получит программа на этом компьютере (порт ${port}). Разрешайте, только если вы её только что запустили.`,
    oauth_redirect_app: (scheme) => `Ответ откроет приложение (${scheme})`,
    oauth_connections: (count) =>
      `У этого приложения уже ${plural(count, 'подключение', 'подключения', 'подключений')}`,
    oauth_rights: 'Права',
    oauth_requested_edit:
      'Приложение просит права Редактора. Можно дать меньше: оно увидит, что получило.',
    oauth_allow: 'Разрешить',
    oauth_deny: 'Отказать',
    oauth_sign_in_needed:
      'Войдите в панель сайта, чтобы ответить на этот запрос. После входа вы вернётесь сюда.',
    oauth_gone:
      'Этот запрос истёк или на него уже ответили. Начните подключение в приложении заново.',
    oauth_returning: 'Возвращаю в приложение…',
    oauth_refused_title: 'Подключение не начато',
    oauth_refused: {
      client: 'Сайт не знает приложения, которое попросило доступ.',
      client_document:
        'Описание приложения не удалось прочитать, или в нём ошибка.',
      redirect_uri:
        'Адрес, куда приложение просит вернуться, ему не принадлежит.',
      request: 'Запрос на подключение составлен неверно.',
    },
    oauth_restart:
      'Приложению ничего не отправлено. Начните подключение в нём заново; если не выйдет — подключите его по ключу доступа.',
    api_token_history: 'Что делал',
    api_token_history_empty: 'Этим ключом пока ничего не делали.',
    ai_settings_link:
      'ИИ-приложения и их ключи доступа, модель по ключу API и ваши правила ' +
      'для ИИ — на странице «ИИ».',
    ai_open_page: 'Открыть страницу ИИ',
    ai_instructions_placeholder:
      'Сленг пишу намеренно. Названия проектов не трогать.',
    ai_check: 'Проверить ключ доступа',
    ai_check_enabled_ok: 'ИИ в Thei включён',
    ai_check_handshake_ok: (_version: string) => 'ИИ-приложения подключаются',
    ai_check_handshake_fail: 'ИИ-приложения не могут подключиться',
    ai_check_tools_ok: (count: number) => `Инструментов для ИИ: ${count}`,
    ai_check_tools_fail: 'ИИ-приложения не видят инструментов',
    ai_check_read_ok: (projects: number, events: number, diary: number) =>
      `Сайт читается: проектов ${projects}, событий ${events}, записей дневника ${diary}`,
    ai_check_read_fail: 'Инструмент не может прочитать сайт',
    ai_check_public_ok:
      'Публичный адрес отвечает снаружи и просит ключ доступа',
    ai_check_public_fail: (status: number) =>
      `Публичный адрес ответил ${status}: проверьте, что прокси пропускает /api/mcp`,
    ai_check_public_warn:
      'Сайт не смог достучаться до своего публичного адреса; клиенты снаружи всё равно могут его видеть',
    ai_check_https_ok: 'Адрес работает по HTTPS',
    ai_check_https_warn:
      'Адрес не HTTPS: Claude Code с ключом доступа работает, а коннекторам ' +
      'claude.ai и ChatGPT нужен HTTPS',
    ai_check_https_skip: 'Локальный адрес: HTTPS здесь не нужен',
    ai_check_signin_ok: 'Приложения находят вход по OAuth',
    ai_check_signin_fail: (where) =>
      `Вход по OAuth не находится по адресу ${where}: для сайта в подпапке нужно правило прокси`,
    ai_check_signin_https:
      'Входа по OAuth нет: сайту нужен HTTPS. Подключение по ключу доступа работает',
    ai_check_clients_ok: (label: string, client: string) =>
      `Последнее подключение: «${label}»${client ? `, ${client}` : ''}`,
    ai_check_clients_warn: 'С этим ключом ещё никто не подключался',
    entity_changed_since:
      'С тех пор как форму открыли, это изменилось — в другой вкладке или через ИИ. Обновите страницу, чтобы не затереть те изменения.',
    api_token_revoke_confirm: (label: string) =>
      `Отозвать ключ «${label}»? Приложение с ним сразу потеряет доступ.`,
    api_token_last_client: (client: string) => `через ${client}`,
    admin_updates: 'Обновления',
    updates_description:
      'Поддерживайте Thei в актуальном состоянии. Обновление заменяет движок ' +
      'и перезапускает сайт; содержимое при этом не затрагивается.',
    update_current_version: 'Установленная версия',
    update_latest_version: 'Последняя версия',
    update_check: 'Проверить обновления',
    update_checking: 'Проверяем…',
    update_check_failed: 'Не удалось связаться с сервером обновлений.',
    update_up_to_date: 'Установлена актуальная версия Thei.',
    update_available_x: (version) => `Доступна версия Thei ${version}.`,
    update_start: 'Обновить',
    update_confirm: (version) =>
      `Обновить Thei до версии ${version}? По завершении сайт перезапустится.`,
    update_backup_notice:
      'Перед обновлением сделайте ручную копию клиентом резервного ' +
      'копирования (Настройки → Резервные копии). Если что-то пойдёт не так, ' +
      'установите предыдущую версию и восстановите эту копию.',
    update_last_backup: 'Последняя копия:',
    update_no_backup: 'Резервных копий ещё не было.',
    update_in_progress: 'Обновляем…',
    update_status_running: 'Обновление',
    update_status_restarting: 'Перезапуск',
    update_status_done: 'Готово',
    update_status_failed: 'Ошибка',
    update_steps: 'Ход обновления',
    update_step_phase: 'Действие обновления',
    update_step_migration: 'Миграция данных',
    update_step_task: 'Преобразование данных',
    update_done_x: (version) => `Обновлено до Thei ${version}.`,
    update_log: 'Журнал',
    update_failed_hint:
      'Сайт продолжает работать на прежней версии. Можно попробовать ещё раз ' +
      'или посмотреть подробности в журнале сервера.',
    update_restart: 'Перезапустить',
    update_restart_confirm: 'Перезапустить сайт сейчас?',
    update_restart_pending: 'Перезапускаем, страница переподключится сама…',
    update_restarted: 'Сайт снова работает.',
    update_title_x: (version) => `Обновление Thei до ${version}`,
    update_site_closed:
      'Сайт закрыт до конца обновления; посетители пока видят, что он временно недоступен.',
    update_waiting: 'Ждём, когда сайт снова ответит…',
    update_unavailable_title: 'Сайт временно недоступен',
    update_unavailable_note:
      'Идут технические работы. Страница сама откроет сайт, как только он снова заработает.',
    update_continue: 'Продолжить',
    update_close: 'Закрыть',
    update_failed_title: 'Обновление не завершилось',
    update_retry: 'Повторить',
    update_retry_hint:
      'Выполненные шаги сохраняются: повтор перезапустит сайт и продолжит ' +
      'с шага, на котором произошла ошибка.',
    update_unmanaged: 'Обновления здесь недоступны',
    update_unmanaged_hint:
      'Этот экземпляр запущен не как управляемая служба и не может ' +
      'перезапустить себя. Обновите его из командной строки.',
    update_never_checked: 'Проверка ещё не выполнялась.',
    boot_update_title: 'Thei требует внимания',
    boot_update_migration_failed:
      'Не удалось обновить содержимое, поэтому сайт не запустился.',
    boot_update_downgrade: 'Это содержимое создано более новой версией Thei.',
    boot_update_task_failed:
      'Не удалось преобразовать содержимое для этой версии, поэтому сайт ' +
      'остаётся закрытым.',
    boot_update_error: 'Сайт не смог запуститься.',
    boot_update_hint:
      'Устраните причину — подробности в журнале службы и в README, — затем ' +
      'перезапустите службу. Выполненные шаги сохраняются.',
    admin_entity_search_placeholder: 'Поиск по содержимому…',
    sort_order: 'Порядок сортировки',
    sort_newest: 'Сначала новые',
    sort_oldest: 'Сначала старые',
    no_projects: 'Проектов пока нет',
    no_events: 'Событий пока нет',
    no_pages: 'Страниц пока нет',
    admin_search_no_results: 'Ничего не найдено',
    admin_search_no_results_description:
      'Попробуйте изменить запрос или сбросить поиск.',
    reset_search: 'Сбросить поиск',
    admin_projects_empty_description:
      'Создайте первый проект: опишите идею, добавьте разделы, материалы и кнопку действия.',
    admin_events_empty_description:
      'Создайте первое событие, чтобы отметить важный момент на временной шкале Жизни.',
    admin_pages_empty_description:
      'Создайте первую страницу — например, с биографией, контактами или любым другим текстом.',
    no_diary_entries: 'Записей пока нет',
    admin_diary_empty_description:
      'Запишите первую мысль: дата и текст — больше ничего не нужно.',
    admin_tags_empty_description:
      'Теги объединяют проекты и события по темам. Создайте первый тег, чтобы начать.',
    admin_assets_empty: 'Библиотека файлов пуста',
    admin_assets_empty_description:
      'Файлы появятся здесь, когда вы загрузите их в проекты, события или страницы.',
    public_tags_empty: 'Тегов пока нет',
    public_tags_empty_description:
      'Теги появятся здесь, как только ими будут отмечены проекты или события.',
    public_pages_empty_description:
      'Здесь пока ничего не опубликовано. Загляните позже.',
    life_empty_description:
      'Моменты жизни появятся здесь, как только будут опубликованы первые события и проекты.',
    feed_empty: 'Здесь пока пусто',
    feed_empty_description: 'Всё, что будет опубликовано, появится здесь само.',
    feed_empty_filtered: 'Ничего не найдено',
    feed_empty_filtered_description:
      'Под выбранный фильтр ничего не подходит. Выберите другие типы или покажите всё.',
    page_of: (page, pageCount) => `Страница ${page} из ${pageCount}`,
    admin_tags: 'Теги',
    tag: 'Тег',
    tags_description:
      'Сквозные темы, которые собирают проекты и события в тематические подборки.',
    new_tag: 'Новый тег',
    edit_tag: 'Изменить тег',
    tag_title: 'Название тега',
    tag_title_hint:
      'Короткое узнаваемое название. Можно использовать знаки препинания и специальные символы.',
    tag_slug: 'Slug',
    tag_description: 'Описание',
    tag_description_hint:
      'Необязательное пояснение о смысле и области применения тега.',
    tag_icon: 'Иконка тега',
    tag_icon_hint:
      'Небольшое узнаваемое изображение для тега. Поддерживаются изображения с прозрачным фоном.',
    tag_link_example: (slug, publicId) =>
      `Итоговая ссылка: /tags/${slug ? `${slug}-` : ''}${publicId}/`,
    project_tags: 'Теги проекта',
    project_tags_hint:
      'Темы, по которым проект окажется рядом с похожими проектами и событиями.',
    recommended_tags: 'Рекомендуемые теги',
    tag_search_placeholder: 'Добавить тег…',
    create_tag_named: (title) => `Создать новый тег «${title}»`,
    tag_usage: 'Использование',
    tag_usage_summary: (projects, events) =>
      `${plural(projects, 'проект', 'проекта', 'проектов')} · ${plural(events, 'событие', 'события', 'событий')}`,
    tag_delete_hint: 'При удалении тег будет снят со всех проектов и событий.',
    tag_usage_sentence: (projects, events) => {
      const parts = [
        projects ? plural(projects, 'проекте', 'проектах', 'проектах') : '',
        events ? plural(events, 'событии', 'событиях', 'событиях') : '',
      ].filter(Boolean);
      return parts.length
        ? `Тег используется в ${parts.join(' и ')}.`
        : 'Тег пока нигде не используется.';
    },
    delete_tag: 'Удалить тег',
    tag_delete_usage_warning: (projects, events) => {
      const hasProjects = projects > 0;
      const hasEvents = events > 0;
      if (!hasProjects && !hasEvents)
        return 'Этот тег нигде не используется. При удалении связанные данные не изменятся.';
      return `Этот тег используется в ${hasProjects ? plural(projects, 'проекте', 'проектах', 'проектах') : ''}${hasProjects && hasEvents ? ' и ' : ''}${hasEvents ? plural(events, 'событии', 'событиях', 'событиях') : ''}! При удалении он будет отвязан от них.`;
    },
    tag_empty_list: 'Тегов пока нет',
    tag_search_results: 'Результаты поиска тегов',
    tag_search_loading: 'Ищем теги…',
    tag_search_no_results: 'Подходящих тегов не найдено.',
    tag_search_error: 'Не удалось найти теги.',
    tag_recommendations_error: 'Не удалось обновить рекомендации тегов.',
    tag_recommendation_add: (title) => `Добавить тег «${title}»`,
    tag_reason_text: 'В тексте',
    tag_reason_similar: 'Похоже на',
    tag_reason_related: 'Связано с',
    tag_reason_together: 'Часто вместе с',
    tag_candidates: 'Может подойти ещё',
    tag_candidates_hint:
      'Проекты и события без этого тега, которым он, судя по всему, подходит.',
    tag_candidates_empty: 'Больше ничего подходящего не нашлось.',
    tag_candidates_error: 'Не удалось подобрать проекты и события.',
    tag_candidate_add: 'Добавить тег',
    tag_candidate_added: 'Добавлен',
    tag_title_taken: 'Такое название уже используется.',
    tag_title_is_synonym: (tag) =>
      `Это название уже служит синонимом тега «${tag}».`,
    tag_synonym_taken: (synonym, tag) =>
      `«${synonym}» уже называет тег «${tag}».`,
    synonyms: 'Синонимы',
    synonyms_hint:
      'Другие имена, под которыми это известно: сокращение, прозвище, название на другом языке. Любой поиск находит по ним; видны они только вам.',
    synonyms_placeholder: 'Добавить синоним…',
    synonyms_limit: (limit) =>
      `Не больше ${plural(limit, 'синонима', 'синонимов', 'синонимов')}.`,
    synonym_remove: (synonym) => `Убрать синоним «${synonym}»`,
    synonym_suggestion_add: (word) => `Добавить синоним «${word}»`,
    tag_synonyms_hint:
      'Другие слова, по которым узнаётся тег: в текстах проектов и событий и в поле добавления тегов. Формы слова учитываются сами. Синонимы видны только вам.',
    tag_synonym_suggestions: 'Часто встречается в записях с этим тегом',
    tag_synonym_found_in: 'Встречается в',
    tag_synonym_already_added: (synonym, tag) =>
      `«${synonym}» — синоним тега «${tag}», и он уже добавлен.`,
    tag_slug_taken: 'Такой slug уже используется.',
    tag_public_id_taken: 'Такой публичный идентификатор уже используется.',
    tag_icon_not_found: 'Выбранная иконка больше не существует.',
    create: 'Создать',
    form_required_missing: (fields) =>
      `Осталось заполнить: ${fields.join(', ')}`,
    form_required_missing_more: (fields, more) =>
      `Осталось заполнить: ${fields.join(', ')} и ещё ${more}`,
    form_fields_to_correct: (fields) => `Исправить: ${fields.join(', ')}`,
    form_either: (first, second) => `${first} или ${second}`,
    form_error_dismiss: 'Скрыть сообщение',
    edit_project: 'Изменить проект',
    view_project: 'Смотреть на сайте',
    unsaved_changes_confirm: 'Есть несохранённые изменения. Покинуть страницу?',
    unsaved_modal_confirm:
      'Есть несохранённые изменения. Закрыть без сохранения?',
    project_title: 'Название проекта',
    project_title_hint:
      'Одно или несколько слов: название продукта, пройденной игры, посещенного мероприятия...',
    project_summary: 'Суть проекта',
    project_summary_hint:
      'О чём проект? Опишите одним или несколькими предложениями. Чем короче, тем лучше.',
    project_description: 'Описание проекта',
    project_action: 'Кнопка действия проекта',
    project_action_hint:
      'Главное действие, которое можно выполнить из проекта.',
    project_action_enabled: 'Показывать кнопку',
    project_action_disabled_hint:
      'Кнопка скрыта. Включите её, чтобы добавить на страницу заметную ссылку или файл для скачивания.',
    project_action_private: 'Только для меня',
    project_action_private_hint: 'Кнопка видна только вам',
    project_action_preview: 'Предпросмотр',
    project_action_placeholder: 'Кнопка действия',
    project_action_group_action: 'Действие',
    project_action_group_look: 'Оформление',
    project_action_text: 'Текст кнопки',
    project_action_type: 'Что открывает кнопка',
    project_action_link: 'Ссылка',
    project_action_file_type: 'Файл',
    project_action_file: 'Файл кнопки действия',
    project_action_link_url: 'Адрес ссылки',
    project_action_target_file: 'Файл для скачивания',
    project_action_file_select: 'Выбрать файл',
    project_action_file_select_hint:
      'Загрузите новый или выберите из библиотеки',
    project_action_file_edit: 'Изменить файл кнопки действия',
    project_action_file_edit_hint: 'Нажмите, чтобы заменить или открепить',
    project_action_icon: 'Иконка',
    project_action_icon_default: 'Стандартная',
    project_action_icon_site: 'С сайта',
    project_action_icon_custom: 'Своя',
    project_action_icon_custom_hint:
      'Квадратное изображение, лучше с прозрачным фоном. Показывается как есть, без тени',
    project_action_icon_select: 'Выбрать иконку кнопки действия',
    project_action_icon_edit: 'Изменить иконку кнопки действия',
    project_action_background: 'Фон',
    project_action_background_standard: 'Акцент сайта',
    project_action_background_standard_hint: 'Градиент в акцентном цвете сайта',
    project_action_background_auto: 'Авто',
    project_action_background_auto_hint:
      'Цвет берётся из иконки, файла или сайта, на который ведёт кнопка',
    project_action_background_accent: 'Свой цвет',
    project_action_background_accent_hint: 'Градиент в выбранном вами цвете',
    project_action_background_image_hint: 'Своё изображение на фоне кнопки',
    project_action_accent_color: 'Цвет фона кнопки',
    project_action_background_select: 'Выбрать фон кнопки действия',
    project_action_background_edit: 'Изменить фон кнопки действия',
    project_action_background_size: 'Размер',
    project_action_background_size_natural: 'По размеру',
    project_action_background_size_contain: 'Вписать',
    project_action_background_size_cover: 'Заполнить',
    project_action_background_size_stretch: 'Растянуть',
    project_action_background_repeat: 'Повтор',
    project_action_background_repeat_none: 'Не повторять',
    project_action_background_repeat_x: 'По горизонтали',
    project_action_background_repeat_y: 'По вертикали',
    project_action_background_repeat_both: 'По обеим',
    project_action_issues: 'Чтобы сохранить, укажите:',
    project_action_needs: (issues) => `укажите ${issues}`,
    project_action_issue_text: 'текст кнопки',
    project_action_issue_text_length: (max) =>
      `текст не длиннее ${max} ${plural(max, 'символа', 'символов', 'символов')}`,
    project_action_issue_url: 'корректный адрес ссылки',
    project_action_issue_file: 'файл для скачивания',
    project_action_issue_icon: 'изображение иконки',
    project_action_issue_background: 'изображение фона',
    project_action_issue_color: 'цвет фона в формате #RRGGBB',
    project_content_sections: 'Разделы проекта',
    project_content_sections_hint:
      'Детальные описания составных частей проекта и этапов, через которые он прошел.',
    project_sections_dated: 'Этапы с датами',
    project_sections_undated: 'Общие разделы',
    related_entities: 'Связи',
    related_entities_hint:
      'Проекты, события и записи дневника, с которыми это связано. Связь видна с обеих сторон.',
    related_entity_add: 'Добавить связь',
    relation_direction: 'Тип связи',
    relation_label_related: 'Связан',
    relation_label_influencing: 'Влияет',
    relation_label_dependent: 'Зависит',
    relation_popup_related: (current, other) =>
      `«${current}» и «${other}» связаны`,
    relation_popup_depends_on: (current, other) =>
      `«${current}» зависит от «${other}»`,
    relation_popup_affects: (current, other) =>
      `«${current}» влияет на «${other}»`,
    relations_empty_of: (kind) =>
      kind === 'project'
        ? 'Связанных проектов пока нет.'
        : kind === 'event'
          ? 'Связанных событий пока нет.'
          : 'Связанных записей дневника пока нет.',
    project_sections_empty_of: (group) =>
      group === 'dated'
        ? 'Этапов с датами пока нет.'
        : 'Общих разделов пока нет.',
    relation_entity: 'С чем связано',
    relation_entity_choose: 'Проект, событие или запись дневника',
    relation: 'Связь',
    relation_edit: (title) => `Изменить связь с «${title}»`,
    relation_note: 'Пояснение',
    relation_note_placeholder: 'Пояснение связи…',
    relation_note_shared_hint: 'Видно на страницах обеих сторон.',
    relation_note_split: 'Раздельно',
    relation_note_split_hint: 'Отдельное пояснение для каждой страницы',
    relation_note_on_page: 'Пояснение на странице',
    delete_relation: 'Удалить связь',
    recommended_relations: 'Рекомендуемые связи',
    relation_recommendation_add: (title) => `Добавить связь с «${title}»`,
    relation_recommendation_reason: 'Есть ссылка в тексте',
    project_external_links: 'Внешние ссылки проекта',
    project_external_links_hint:
      'Сайты, публикации и другие страницы, связанные с проектом.',
    add_external_link: 'Добавить ссылку',
    external_link_url: 'Адрес ссылки',
    external_link_name: 'Название ссылки',
    external_link_loading: 'Обработка ссылки…',
    external_link_error: 'Не удалось обработать ссылку.',
    external_link_fallback:
      'Сайт не ответил — ссылка показывает имя домена, пока её не обновить.',
    external_link_archived:
      'Сайт не ответил — данные взяты из архивной копии страницы.',
    external_link_duplicate: 'Эта ссылка уже добавлена.',
    external_link_in_project_description:
      'Эта ссылка уже есть в описании проекта.',
    external_link_in_event_content: 'Эта ссылка уже есть в содержимом события.',
    external_link_private: 'Приватная ссылка',
    project_external_links_empty: 'Внешних ссылок пока нет.',
    refresh_external_link: 'Обновить ссылку',
    search_entity_placeholder: 'Название или дата записи дневника…',
    search_entity_no_results: 'Ничего подходящего не найдено.',
    search_entity_error: 'Не удалось выполнить поиск.',
    content_section: 'Раздел проекта',
    content_section_delete_entity: 'раздел проекта',
    section_periods: 'Временные промежутки',
    section_undated_hint: 'Без дат — это общий раздел.',
    section_needs_body_or_period:
      'Напишите раздел или добавьте хотя бы один временной промежуток.',
    public_section_dates_only: 'У раздела нет текста',
    public_section_dates_only_description:
      'Подробности так и не были записаны…',
    public_section_content_empty: 'Здесь пока нечего читать',
    public_section_content_empty_description:
      'В этом разделе нет открытого для чтения контента.',
    content_section_title: 'Название раздела',
    content_section_summary: 'Суть раздела',
    content_section_banner: 'Баннер',
    content_section_banner_hint:
      'Широкое изображение вверху страницы раздела и на его карточках.',
    content_section_private: 'Приватный раздел',
    content_section_private_hint: 'Виден только вам',
    content_section_content: 'Контент раздела',
    content_section_add: 'Добавить раздел',
    content_section_sort: 'Изменить порядок раздела',
    delete_content_section: 'Удалить раздел',
    content_empty: 'Контента пока нет',
    content_text_empty: 'Текстового контента нет',
    edit_content: (title) => `Редактировать: ${title}`,
    content_block_count: (count) => plural(count, 'блок', 'блока', 'блоков'),
    content_word_count: (count) => plural(count, 'слово', 'слова', 'слов'),
    content_file_count: (count) => plural(count, 'файл', 'файла', 'файлов'),
    content_file_with_extension: (extension) =>
      extension ? `Файл с расширением ${extension.toUpperCase()}` : 'Файл',
    content_editor_placeholder: 'Начните писать...',
    content_editor_save_error: 'Не удалось сохранить контент.',
    content_editor_title: 'Редактор контента',
    content_never_saved: 'Не было сохранено',
    content_history: 'История версий',
    content_history_empty: 'Версий пока нет.',
    content_history_unavailable: 'История версий сейчас недоступна.',
    content_history_load_error: 'Не удалось загрузить эту версию.',
    content_history_opened_version: 'Как при открытии',
    content_history_reasons: {
      auto: 'Автосохранение',
      'before-restore': 'Перед восстановлением',
      'before-clear': 'Перед очисткой',
      'large-drop': 'Перед крупным удалением',
      discarded: 'Закрыто без сохранения',
      dismissed: 'Отклонённый черновик',
      displaced: 'Черновик другой вкладки',
      replaced: 'Прошлая сохранённая версия',
      cleared: 'Сохранённое до очистки',
      deleted: 'Удалённый текст',
      abandoned: 'Брошенный черновик',
      'before-ai': 'До правки ИИ',
    },
    content_history_row_label: (time, changes) =>
      `Версия от ${time}: ${changes}`,
    content_history_delta: (value, delta) =>
      delta === 0
        ? value
        : `${value}, на ${Math.abs(delta)} ${delta < 0 ? 'меньше' : 'больше'}, чем сейчас`,
    content_history_missing_assets: (count) =>
      `Из этой версии уже удалено: ${plural(count, 'файл', 'файла', 'файлов')}`,
    content_restore_same: 'Эта версия совпадает с текущим текстом.',
    content_taken_from: (label) => `Взято: ${label}`,
    content_restore_undo: 'Вернуть как было',
    content_draft_dismiss: 'Отклонить черновик (он останется в истории версий)',
    content_draft_status_offline_short: 'Нет связи',
    content_draft_offline_hint:
      'Текст хранится в этом браузере и уйдёт на сервер сам, когда связь вернётся. Закрывать окно можно.',
    content_draft_notice: (time) => `Черновик из другой вкладки · ${time}`,
    content_draft_notice_hint:
      'Не сохранён. Сравните и возьмите нужное — ваш текст останется как есть.',
    content_draft_compare: 'Сравнить',
    content_stored_notice: (time) => `Сохранено на другом устройстве · ${time}`,
    content_stored_notice_hint:
      'Пока вы писали, текст сохранили там. Сравните и возьмите нужное оттуда — ваш текст останется как есть.',
    content_history_keeps:
      'Версии хранятся двое суток, правки ИИ — пока жива их сессия.',
    content_draft_status_synced: (time) => `Черновик сохранён · ${time}`,
    content_draft_status_offline: 'Нет связи — хранится в браузере',
    content_draft_status_refused_short: 'Не сохраняется',
    content_draft_status_refused:
      'Сервер не принял черновик — текст есть только в этом окне',
    content_field_unsaved_draft: (time) => `Несохранённый черновик · ${time}`,
    sign_out_unsynced_confirm: (count) =>
      `Ещё не на сервере: ${plural(count, 'текст', 'текста', 'текстов')}. Если выйти сейчас, они пропадут. Всё равно выйти?`,
    content_external_link: 'Внешняя ссылка',
    content_link_loading: 'Загрузка данных ссылки…',
    content_link_broken_title: 'Ссылка недоступна',
    content_link_broken_description:
      'Не удалось найти, куда ведёт ссылка, или получить её данные.',
    content_link_remove: 'Убрать ссылку',
    content_private_section: 'Приватная секция',
    content_private_section_start: 'Начало приватной секции',
    content_private_section_end: 'Конец приватной секции',
    content_private_section_remove: 'Убрать приватную секцию',
    content_editor_i18n: {
      add: 'Добавить',
      convert_to: 'Поменять на…',
      tune: 'Нажмите для настройки',
      text: 'Текст',
      bold: 'Полужирный',
      italic: 'Курсив',
      heading: 'Заголовок',
      subheading: 'Подзаголовок',
      list: 'Список',
      checklist: 'Чекбоксовый',
      quote: 'Цитата',
      delimiter: 'Разделитель',
      file: 'Файл',
      enter_quote: 'Введите цитату',
      enter_caption: 'Введите подпись',
      align_left: 'По левому краю',
      align_center: 'По центру',
      unordered: 'Неупорядоченный',
      ordered: 'Упорядоченный',
      start_with: 'Начать с',
      counter_type: 'Тип нумерации',
      numeric: 'Цифры',
      lower_roman: 'Строчные римские',
      upper_roman: 'Прописные римские',
      lower_alpha: 'Строчные буквы',
      upper_alpha: 'Прописные буквы',
      delete: 'Удалить',
      click_to_delete: 'Точно удалить?',
      move_up: 'Поднять',
      move_down: 'Спустить',
    },
    content_asset_pick_error: 'Не удалось выбрать файл.',
    content_media_pending_confirm:
      'Вставленный файл ещё сохраняется. Закрыть и потерять его?',
    content_choose_media: 'Выбрать изображение или видео',
    content_gallery_tile: 'Показать это изображение',
    content_add_media: 'Добавить изображение или видео',
    content_choose_file: 'Выбрать файл',
    content_choose_audio: 'Выбрать аудио',
    content_show_as_player: 'Показать плеером',
    content_show_as_file: 'Показать файлом',
    content_show_as_picture: 'Показать картинкой',
    content_choose_entity: 'Выбрать, на что ссылаться',
    content_make_gallery: 'Сделать галереей',
    content_make_file_group: 'Сделать группой',
    content_file_group_title: 'Название группы',
    content_gallery_title: 'Название галереи',
    content_add_files: 'Добавить файлы',
    content_remove_file: 'Убрать из группы',
    content_move_file: 'Переставить',
    content_upload_as_file: 'Загрузить как файл',
    content_file_skipped: (name, reason) =>
      reason === 'extension'
        ? `«${name}» не добавлен: у файла нет расширения`
        : reason === 'empty'
          ? `«${name}» не добавлен: файл пустой`
          : `«${name}» не добавлен: он больше 500 МБ`,
    content_link_fragment: 'Ведёт к этому месту страницы',
    content_link_fragment_remove: 'Ссылаться на страницу целиком',
    content_caption: 'Подпись',
    content_media_centered: 'По центру',
    content_media_natural: 'Исходный размер',
    content_media_stretch: 'Во всю ширину',
    content_title: 'Название',
    content_description: 'Описание',
    edit_event: 'Изменить событие',
    edit_page: 'Изменить страницу',
    edit_diary_entry: 'Изменить запись',
    edit_content_section: 'Изменить раздел',
    diary_access: 'Доступ к записи',
    diary_date: 'Дата записи',
    diary_content: 'Содержимое записи',
    diary_content_hint: 'Расскажите, как прошел ваш день.',
    diary_date_already_taken: 'На эту дату уже есть запись.',
    diary_date_taken_open: 'Открыть запись за этот день',
    diary_date_taken: 'на этот день уже есть запись',
    diary_seo_title: 'Дневник',
    diary_seo_description:
      'Короткие датированные записи: мысли, наблюдения и мелочи дня, которые не стали ни событием, ни проектом.',
    diary_entry_seo_description: (date: string) =>
      `Запись дневника за ${date}.`,
    diary_delete_confirm: 'Удалить запись дневника?',
    edit: 'Изменить',
    save: 'Сохранить',
    add: 'Добавить',
    clear: 'Очистить',
    delete: 'Удалить',
    close_modal: 'Закрыть окно',
    modal_waiting: 'Загрузка…',
    done: 'Готово',
    public_link: (entityName) => `Ссылка на ${entityName.toLowerCase()}`,
    human_readable_url: 'Читаемая часть URL',
    public_id: 'Публичный ID',
    project_link_example: (slug, publicId) =>
      `Итоговая ссылка: /projects/${slug ? `${slug}-` : ''}${publicId}/`,
    event_link_example: (slug, publicId) =>
      `Итоговая ссылка: /events/${slug ? `${slug}-` : ''}${publicId}/`,
    public_id_already_taken: 'Такой публичный ID уже существует.',
    disable_url_synchronization: 'Редактировать вручную',
    enable_url_synchronization: 'Синхронизировать с названием',
    generate_random: 'Сгенерировать случайный',
    project_access: 'Доступ к проекту',
    public: 'Публичный',
    public_hint: 'Просматривать может кто угодно.',
    link_only: 'По ссылке',
    link_only_hint: 'Просматривать могут только обладатели ссылки.',
    private: 'Приватный',
    private_hint: 'Просматривать можете только вы.',
    site_access_close_priority:
      'Сайт закрытый! Доступ все равно будет только у вас!',
    view_event: 'Смотреть на сайте',
    view_page: 'Смотреть на сайте',
    view_content_section: 'Смотреть на сайте',
    view_tag: 'Смотреть на сайте',
    saved: 'Сохранено',
    showcase_project: 'Витринный проект?',
    showcase_project_hint: 'Показывать на главной странице и сверху поиска.',
    showcase_project_label: 'Витринный проект',
    cv_project: 'Часть резюме?',
    cv_project_hint:
      'Потенциальному работодателю будет интересно увидеть этот проект.',
    cv_project_label: 'Резюме',
    project_showcase_badge: 'Витрина',
    project_showcase_badge_hint:
      'Проект показывается в витрине на главной странице и выше в каталоге.',
    project_cv_badge_hint: 'Проект входит в резюме автора.',
    project_files: 'Файлы проекта',
    project_files_description: 'Иконка, баннер, витрина и остальные файлы.',
    event_title: 'Название события',
    event_title_hint: 'Короткое и узнаваемое название события.',
    event_summary: 'Суть события',
    event_summary_hint: 'Кратко объясните, что это за событие.',
    event_access: 'Доступ к событию',
    event_periods: 'Временные промежутки',
    event_periods_hint:
      'Даты или периоды события — по ним оно встаёт на шкалу Жизни.',
    event_periods_empty: 'Добавьте хотя бы одну дату или временной промежуток.',
    event_content: 'Контент события',
    event_content_hint: 'Подробные материалы и содержание события.',
    page_title: 'Название страницы',
    page_title_hint: 'Короткое и узнаваемое название страницы.',
    page_summary: 'Описание страницы',
    page_summary_hint: 'Кратко объясните содержание страницы.',
    page_access: 'Доступ к странице',
    page_content: 'Контент страницы',
    page_content_hint: 'Основное содержание страницы.',
    page_icon: 'Иконка страницы',
    page_icon_hint:
      'Необязательно. Без файла используется автоиконка страницы.',
    page_slug: 'Slug страницы',
    page_slug_hint:
      'Уникальная URL-безопасная часть адреса: строчные буквы, цифры и дефисы.',
    page_link_example: (slug) => `Итоговая ссылка: /pages/${slug}/`,
    page_slug_invalid: 'Используйте строчные буквы, цифры и дефисы.',
    page_slug_already_taken: 'Страница с таким slug уже существует.',
    delete_page: 'Удалить страницу',
    event_files: 'Файлы события',
    event_files_description:
      'Баннер и произвольные файлы события любого формата.',
    event_banner: 'Баннер события',
    event_banner_hint:
      'Широкое изображение вверху страницы события и на его карточках.',
    event_action: 'Кнопка действия события',
    event_action_hint: 'Главное действие, которое можно выполнить из события.',
    event_external_links: 'Внешние ссылки события',
    event_external_links_hint:
      'Сайты, публикации и другие страницы, связанные с событием.',
    event_external_links_empty: 'У события пока нет внешних ссылок.',
    event_tags: 'Теги события',
    event_tags_hint:
      'Темы, по которым событие окажется рядом с похожими проектами и событиями.',
    delete_event: 'Удалить событие',
    project_icon: 'Иконка проекта',
    project_icon_hint:
      'Квадратная картинка для карточек, ссылок и превью. Без неё будет автоиконка.',
    project_banner: 'Баннер проекта',
    project_banner_hint: 'Широкое изображение вверху страницы проекта.',
    delete_project: 'Удалить проект',
    delete_confirmation_description: (entityType, entityName) =>
      `Вы собираетесь удалить ${entityType} "${entityName}". Это действие нельзя отменить.`,
    delete_confirmation_confirm: 'Чтобы подтвердить, введите название:',
    size: 'Размер',
    just_now: 'Сейчас',
    showcase: 'Витрина',
    showcase_file: 'Файл витрины',
    showcase_description:
      'Изображения и видео, которые передают всю суть проекта.',
    showcase_add: 'Добавить в витрину',
    asset_private_access: 'Закрытый доступ',
    asset_private_access_hint: 'Просматривать файл сможете только вы',
    showcase_details: 'Детали',
    other_files: 'Остальные файлы',
    project_file: 'Файл проекта',
    other_files_description: 'Произвольные файлы проекта любого формата.',
    other_add: 'Добавить файл',
    other_details: 'Детали файла',
    other_description: 'Описание',
    asset_pick_title: 'Выбор файла',
    asset_pick_upload: 'Загрузить',
    asset_pick_reuse: 'Переиспользовать',
    asset_pick_reuse_hint: 'Выбрать ранее загруженное',
    asset_replace: 'Изменить',
    asset_upload_retry: 'Попробовать снова',
    drop_browse_paste: 'Перетащите • Выберите • Вставьте',
    format: 'Формат',
    max_size: 'Макс. размер',
    image: 'Изображение',
    video: 'Видео',
    audio: 'Аудио',
    any_file: 'Любой файл',
    file_wrong_type: (ext) => `Неподдерживаемый тип файла: .${ext}!`,
    file_too_large: (size) => `Файл слишком большой: ${size}!`,
    direct_link_to_asset: 'Прямая ссылка на файл',
    download_asset: 'Скачать',
    file_preview_shown_part: (shown: string, total: string) =>
      `Показано ${shown} из ${total}. Скачайте файл, чтобы прочитать его целиком.`,
    file_preview_rows_shown: (count: number) =>
      `Показаны первые ${plural(count, 'строка', 'строки', 'строк')}. Остальные — в файле.`,
    file_preview_too_large:
      'Файл слишком большой, чтобы показать его здесь. Скачайте его.',
    file_preview_failed: 'Не удалось прочитать файл. Скачайте его.',
    file_preview_no_pdf:
      'Этот браузер не показывает PDF внутри страницы. Скачайте файл.',
    file_preview_page: 'Содержимое файла',
    archive_summary: (files: number, size: string) =>
      `${plural(files, 'файл', 'файла', 'файлов')}, ${size}`,
    archive_packed: (size: string) => `в архиве ${size}`,
    archive_more: (count: number) =>
      `И ещё ${plural(count, 'файл', 'файла', 'файлов')}`,
    archive_partial: 'В архиве больше файлов, чем удалось перечислить.',
    archive_back: 'Назад к архиву',
    archive_root: 'Архив',
    archive_name: 'Имя',
    archive_size: 'Размер',
    archive_files: (count: number) => plural(count, 'файл', 'файла', 'файлов'),
    archive_levels: 'Папки до этой',
    archive_entry_download: 'Скачать этот файл',
    archive_entry_nested: 'Архив внутри архива откроется после скачивания',
    asset_zoom: 'Масштаб',
    archive_entry_locked: 'Файл зашифрован',
    archive_entry_unavailable: 'Этот файл здесь не открыть',
    archive_entry_too_large: (size: string) =>
      `Здесь открываются файлы до ${size}`,
    asset_previous: 'Предыдущий файл',
    asset_next: 'Следующий файл',
    asset_pager: (position: number, count: number) => `${position} из ${count}`,
    asset: 'Файл',
    upload_how: 'Как взять файл',
    upload_as_is: 'Как есть',
    upload_saved_variant: 'Сохранённый вариант',
    upload_saved_count: (count) => `В хранилище: ${count}`,
    upload_new_variant: 'Новый вариант',
    upload_new_variant_hint: 'Обрезать, сжать, сменить формат',
    upload_new_audio_hint: 'Сжать, сделать моно',
    upload_new_zip_hint: 'Упаковать в ZIP',
    upload_other_file_hint: 'Загрузить или переиспользовать',
    upload_next: 'Далее',
    upload_back: 'Назад',
    upload_skip_description: 'Продолжить без описания файла',
    upload_replace_with_new_file: 'Другой файл',
    upload_section_family: 'Сохраненные варианты',
    upload_section_zip: 'Создать ZIP-вариант',
    upload_apply_settings: 'Создать вариант',
    upload_processing: 'Обработка...',
    upload_queued: 'Ожидание в очереди...',
    upload_finishing: 'Завершение…',
    upload_cancel: 'Отмена',
    upload_dismiss: 'Убрать',
    upload_error_job_lost: 'Сервер перезапустился, пока файл сохранялся.',
    upload_pending_leave_confirm: 'Файлы ещё сохраняются. Уйти и потерять их?',
    upload_quality: 'Качество',
    upload_audio: 'Звук',
    upload_audio_none: 'в исходнике нет',
    upload_fast_conversion: 'Быстрая конвертация',
    upload_fast_conversion_hint:
      'Один быстрый проход вместо двух: гораздо быстрее, тот же размер, чуть ниже качество.',
    upload_compress_to_zip: 'Сжать в ZIP',
    upload_compress_to_zip_hint:
      'Упаковка в архив позволит уменьшить размер файла.',
    upload_compare_divider: 'Разделитель сравнения',
    upload_compare_toggle_mode: 'Переключить режим сравнения',
    upload_variant_unchanged: 'Без обработки',
    upload_source_no_audio: 'В исходнике нет звуковой дорожки',
    video_play: 'Воспроизвести',
    video_pause: 'Пауза',
    video_seek: 'Позиция воспроизведения',
    video_mute: 'Выключить звук',
    video_unmute: 'Включить звук',
    video_volume: 'Громкость',
    video_no_audio: 'В этом видео нет звуковой дорожки',
    audio_position: (current, total) => `${current} из ${total}`,
    audio_speed: (rate) => `Скорость воспроизведения: ${rate}`,
    audio_download: 'Скачать',
    audio_unsupported: 'Этот браузер не может воспроизвести запись',
    audio_channel_count: (count) =>
      count === 1 ? 'моно' : count === 2 ? 'стерео' : `каналов: ${count}`,
    upload_audio_mono: 'Моно',
    upload_audio_mono_hint:
      'Один канал вместо двух: вдвое меньше, а голосу больше и не нужно.',
    upload_audio_source_mono: 'Исходник в моно',
    asset_variant_current: 'Используется сейчас',
    asset_variant_current_tag: 'Текущий',
    asset_variant_usage_count: (count) => `Использований: ${count}`,
    upload_error_load_variants: 'Не удалось загрузить варианты файла.',
    upload_error_apply: 'Не удалось применить настройки.',
    upload_error_invalid_response: 'Некорректный ответ сервера.',
    upload_error_network: 'Ошибка сети.',
    upload_error_cancelled: 'Загрузка отменена.',
    upload_error_request_failed: (status) => `Запрос не удался (${status})`,
    upload_crop: 'Обрезка',
    upload_crop_area: 'Область обрезки',
    upload_crop_handle: 'Изменить размер обрезки',
    upload_crop_free: 'Свободно',
    upload_crop_source: 'Как у файла',
    upload_reset: 'Сбросить',
    upload_rotation: 'Поворот',
    upload_rotate: 'Повернуть на 90° по часовой',
    upload_crop_hint:
      'Перетаскивайте рамку и её углы, двойной щелчок растягивает её до предела.',
    upload_resize: 'Изменить размеры',
    upload_resize_linked: 'Сохранять пропорции',
    upload_resize_width: 'Ширина',
    upload_resize_height: 'Высота',
    upload_format: 'Формат',
    upload_format_auto: 'Авто',
    upload_format_lossless: 'WebP без потерь',
    upload_format_picked: (format, reason) => `${format}: ${reason}`,
    upload_format_reason_smallest: 'самый лёгкий',
    upload_format_avif_no_lossless:
      'У AVIF нет режима без потерь; Авто или WebP сохранят каждый пиксель.',
    upload_result: 'Результат',
    upload_result_pending: 'Готовлю результат…',
    upload_result_failed: 'Не удалось подготовить результат.',
    upload_result_of_source: (percent) => `${percent} от исходника`,
    upload_preview_compare: 'Сравнить с исходником',
    upload_processing_source: 'Основа',
    upload_processing_source_lossy:
      'Эта основа уже сжата: новый вариант потеряет ещё немного качества.',
    upload_staging: (percent) => `Загрузка файла… ${percent}%`,
    file_info_extension: 'Расширение',
    file_info_size: 'Размер',
    file_info_dimensions: 'Разрешение',
    file_info_duration: 'Длительность',
    file_info_channels: 'Каналы',
    file_info_bitrate: 'Битрейт',
    file_info_empty: 'пусто',
    file_info_archived_extension: 'Расширение до ZIP',
    file_info_archived_size: 'Размер до ZIP',
    date_precision: 'Точность даты',
    date_precision_exact: 'Дата точная',
    date_precision_day: 'День под вопросом',
    date_precision_month: 'Месяц под вопросом',
    date_precision_year: 'Год под вопросом',
    date_precision_exact_short: 'Точно',
    date_precision_day_short: 'День',
    date_precision_month_short: 'Месяц',
    date_precision_year_short: 'Год',
    date_precision_note: 'Комментарий по неточности',
    period_label: 'Подпись',
    period_label_placeholder: 'Подпись промежутка',
    period_dates_edit: 'Изменить даты',
    entity_notes_section: 'Примечания',
    entity_notes_section_description:
      'Напоминание и личные заметки. Их видите только вы: на страницу и в Markdown-копию они не попадают, находит их только ваш поиск.',
    entity_reminder: 'Напоминание',
    entity_reminder_hint:
      'Что здесь ещё надо сделать. Пока оно заполнено, во всех списках здесь стоит жёлтая метка.',
    entity_reminder_placeholder: 'Найти фотографии за ту неделю',
    entity_notes: 'Заметки',
    entity_notes_hint: 'Всё, что стоит держать под рукой, но не публиковать.',
    entity_notes_show_all: 'Показать всё',
    entity_reminder_badge: 'Здесь есть напоминание',
    content_strikethrough: 'Зачёркнутый',
    content_hint: 'Подсказка',
    content_hint_placeholder: 'Что здесь имеется в виду',
    content_hint_remove: 'Убрать подсказку',
    content_spoiler: 'Спойлер',
    content_spoiler_reveal: 'Скрыто; откройте, чтобы прочитать',
    content_link_note: 'Зачем здесь эта ссылка',
    content_link_note_placeholder: 'Пояснение к ссылке',
    public_details_show_all: (count) => `Показать все ${count}`,
    view_all_short: 'Все',
    powered_by_thei: 'Работает на Thei',
    search_preset_all_title: 'Проекты и События',
    search_preset_all_description:
      'Всё, что стоит помнить: проекты и события вокруг них, новое сверху.',
    search_preset_projects_title: 'Проекты',
    search_preset_projects_description:
      'Все проекты — и большие, и совсем маленькие — с тем, что из них вышло.',
    search_preset_events_title: 'События',
    search_preset_events_description:
      'Моменты, которые оказались малы для проекта и слишком хороши, чтобы забыться.',
    search_preset_showcase_title: 'Витринные проекты',
    search_preset_showcase_description:
      'То, что стоит увидеть первым — проекты, выбранные для витрины.',
    search_preset_cv_title: 'Резюме',
    search_preset_cv_description:
      'Профессиональная часть архива: проекты, из которых складывается рабочая история.',
    og_personal_archive: 'Личный архив',
    og_section_position: (index, total) => `Этап ${index} из ${total}`,
    og_updated: (date) => `Обновлено ${date}`,
    og_life_headline: (years) =>
      `${plural(years, 'год', 'года', 'лет')} в одной хронике`,
    og_tags_headline: (count) =>
      `${plural(count, 'нить', 'нити', 'нитей')} через всю жизнь`,
    og_pages_headline: (count) =>
      `${plural(count, 'текст', 'текста', 'текстов')} вне хронологии`,
    og_image_alt: (kind, title, site) => `${kind} «${title}» — ${site}`,
    ai_tab_sessions: 'Сессии',
    ai_tab_memory: 'Память',
    ai_tab_templates: 'Готовые просьбы',
    ai_templates_title: 'Готовые просьбы',
    ai_templates_hint: 'Запускаются отсюда, из новой сессии и из каждого ✦.',
    ai_templates_column_template: 'Просьба',
    ai_templates_column_last: 'Последний запуск',
    ai_templates_builtin_section: 'Встроенные проверки',
    ai_templates_own_section: 'Ваши просьбы',
    ai_templates_own_empty: 'Своих просьб пока нет.',
    ai_templates_new: 'Новый',
    ai_templates_presets: 'Готовые просьбы',
    ai_template_open: 'Открыть в новой сессии',
    ai_open_full: 'На странице ИИ',
    select_filter: 'Фильтр',
    content_link: 'Ссылка',
    content_link_search_placeholder: 'Поиск или ссылка',
    content_link_mention_placeholder: 'Что упомянуть',
    content_link_search: 'Поиск',
    content_link_path: 'Куда ведёт ссылка',
    content_link_place: 'Куда внутри',
    content_link_whole: (kind) =>
      ({
        project: 'Весь проект',
        'project-section': 'Весь раздел',
        event: 'Всё событие',
        'diary-entry': 'Вся запись',
        page: 'Вся страница',
        tag: 'Весь тег',
      })[kind],
    content_link_headings: 'Заголовки',
    content_link_description_headings: 'Заголовки описания',
    content_link_sections: 'Разделы',
    content_link_anchor_gone: (anchor) =>
      `§ ${anchor} — этого заголовка больше нет`,
    content_link_target_gone: 'Ссылка вела туда, чего больше нет.',
    content_link_becomes_video: 'Станет блоком видео',
    content_link_apply: 'Готово',
    content_link_change: 'Изменить ссылку',
    content_block_add: 'Добавить блок',
    content_block_settings: 'Настройки блока. Потяните, чтобы переместить',
    content_block_toolbox: 'Блоки',
    ai_template_run: 'Проверить новое в архиве',
    ai_template_nothing_new: (title) => `«${title}»: проверять нечего`,
    ai_template_looked_all: (title, looked, key) =>
      `«${title}»: нового нет — всё просмотрено (${checkUnits(looked, key)})`,
    ai_template_last_open: 'Прошлая проверка',
    ai_template_again: 'Проверить заново',
    ai_template_nothing_here: (title) => `«${title}»: здесь нечего проверять`,
    ai_template_edit: 'Настроить',
    ai_template_running: 'идёт сейчас',
    ai_template_never_run: 'ещё не запускалась',
    ai_template_started: (title) => `Сессия «${title}» начата`,
    ai_template_saved: 'Просьба сохранена',
    ai_template_deleted: 'Просьба удалена',
    ai_template_copied: 'Копия сделана — теперь это ваша просьба',
    ai_template_modal_title: 'Готовая просьба',
    ai_template_modal_new: 'Новая просьба',
    ai_template_name: 'Название',
    ai_template_name_placeholder: 'Например, «Неделя путешествия»',
    ai_template_instruction: 'Запрос',
    ai_template_instruction_placeholder:
      'Что сделать модели — как сказали бы человеку. Например: «Посмотри эту запись и скажи, чего в ней не хватает…»',
    ai_template_sessions: 'Сессии по этой просьбе',
    ai_template_copy: 'Сделать копию',
    ai_template_delete: 'Удалить просьбу',
    ai_template_delete_confirm: (title) =>
      `Удалить просьбу «${title}»? Её сессии останутся.`,
    ai_sessions_search: 'Найти сессию',
    ai_sessions_filter: 'Какие сессии',
    ai_sessions_filters: {
      all: 'Все сессии',
      waiting: 'Ждут вас',
      applied: 'С применённым',
      rejected: 'С отклонённым',
      app: 'Из приложений',
      template: 'Из готовых просьб',
    },
    ai_session_new: 'Новая сессия',
    ai_session_groups: {
      pinned: 'Закреплённые',
      waiting: 'Ждут вас',
      running: 'Работают',
      week: 'На этой неделе',
      earlier: 'Раньше',
      archive: 'Архив',
    },
    ai_session_untitled: 'Новая сессия',
    ai_session_you: 'Вы',
    ai_session_template: 'Готовая просьба',
    ai_session_running: 'Работает',
    ai_session_recent: 'Недавно завершены',
    ai_session_waiting: (count) => `Ждут решения: ${count}`,
    ai_session_starting: 'Начинаю сессию…',
    ai_sessions_archive_note: 'Старше 30 дней удаляются',
    ai_sessions_empty: 'Сессий пока нет',
    ai_session_about_more: (count) => `ещё ${count}`,
    ai_session_about_less: 'Свернуть',
    ai_sessions_empty_description:
      'Сессия — это разговор с ИИ: спросите о чём угодно в архиве, и ответ с предложениями останется здесь.',
    ai_sessions_more: 'Показать ещё',
    ai_sessions_back: 'К сессиям',
    ai_no_model_title: 'Модель не настроена',
    ai_no_model_text:
      'Здесь разговаривает модель из «Подключения»: модель сервиса по ключу API или своя, в Ollama и LM Studio. Сессии приложений через MCP — ниже.',
    ai_no_model_action: 'Настроить',
    ai_session_menu: 'Сессия',
    ai_session_pin: 'Закрепить',
    ai_session_unpin: 'Открепить',
    ai_session_rename: 'Переименовать',
    ai_session_archive: 'В архив',
    ai_session_unarchive: 'Вернуть из архива',
    ai_session_delete: 'Удалить',
    ai_session_delete_confirm: (title) =>
      `Удалить сессию «${title}»? Применённое останется, но отменить его отсюда будет нельзя.`,
    ai_session_by_you: (when) => `Начата вами · ${when}`,
    ai_session_via_app: (client) => `${client} через MCP`,
    ai_session_tokens: (amount) =>
      // «1,2 тыс.» is followed by «токенов» whatever the number.
      /^\d+$/.test(amount)
        ? plural(Number(amount), 'токен', 'токена', 'токенов')
        : `${amount} токенов`,
    ai_session_app_note:
      'Здесь — то, что приложение предложило и применило. Сам разговор остался в приложении: писать ему — там.',
    ai_session_archived_note: 'Сессия в архиве: писать в неё нельзя',
    ai_session_model: 'Модель',
    ai_steps: {
      read: (count) =>
        `прочитал ${plural(count, 'страницу архива', 'страницы архива', 'страниц архива')}`,
      search: (queries) => `искал ${queries}`,
      list: 'смотрел список',
      graph: 'смотрел граф связей',
      timeline: 'смотрел хронологию',
      tags: 'подбирал теги',
      digests: (count) =>
        `пролистал ${plural(count, 'страницу архива', 'страницы архива', 'страниц архива')}`,
      proposed: (count) =>
        plural(count, 'предложение', 'предложения', 'предложений'),
      refused: (count) =>
        `${plural(count, 'предложение отсеяно', 'предложения отсеяны', 'предложений отсеяно')}`,
      refused_hint:
        'Код не пропустил их к вам: так уже есть, такое уже ждёт вашего решения или вы недавно от него отказались.',
      files: 'работал с файлами',
      failed: (count) =>
        `${plural(count, 'вызов отклонён', 'вызова отклонены', 'вызовов отклонено')}`,
    },
    ai_question: 'Вопрос',
    ai_question_own: 'Свой ответ…',
    ai_notices: {
      stopped: 'Остановлено вами. Ответьте, чтобы продолжить.',
      timeout: 'Пауза: ход шёл слишком долго. Ответьте, чтобы продолжить.',
      interrupted: 'Прервано перезапуском сайта.',
      limit:
        'Месячный лимит исчерпан. Сессия продолжится в следующем месяце или когда вы поднимете лимит.',
      'no-model': 'Модель для ответа не настроена.',
      key: 'Сервис не принял ключ API.',
      busy: 'Сервис занят — попробуйте позже.',
      address: 'Сервис не отвечает по своему адресу.',
      model: 'Сервис не знает такой модели.',
      refused: 'Модель отказалась отвечать.',
      length: 'Оборвано: ответу не хватило места.',
      turns:
        'Пауза: за один ход ИИ делает ограниченное число шагов. Ответьте, чтобы продолжить.',
      error: 'Что-то пошло не так.',
    },
    ai_notice_connection: 'Подключение',
    ai_comment_on: (what) => `К действию: ${what}`,
    ai_action_open_file: 'Открыть файл',
    ai_field_ask: (field) => `Спросить ИИ о поле «${field}»`,
    ai_field_ask_placeholder: 'Что сделать с полем?',
    ai_editor_ask: 'ИИ об этом тексте',
    ai_editor_ask_about: (title) => `Спросить ИИ о тексте «${title}»`,
    ai_editor_ask_placeholder: 'Что сделать с текстом?',
    ai_editor_ask_nothing: 'Ответил, править нечего',
    ai_field_asking: 'ИИ отвечает…',
    ai_field_ask_nothing: 'Ответил, ничего не предложив',
    ai_field_ask_open: 'Сессия',
    ai_field_ask_quick: {
      title: ['Предложи название'],
      summary: ['Напиши суть'],
      description: ['Напиши описание'],
      synonyms: ['Предложи синонимы'],
      slogan: ['Предложи слоган'],
      reminder: ['Напиши напоминание'],
      periods: [],
      tags: ['Предложи теги'],
      relations: ['Найди связи'],
      text: [],
      file: ['Опиши файл'],
      other: ['Предложи вариант'],
    },
    ai_field_ask_empty:
      'Здесь пока пусто — проверять нечего. Попросите своими словами',
    ai_field_ask_quick_filled: {
      summary: ['Сделай короче'],
      periods: ['Проверь даты'],
      text: ['Проверь ошибки', 'Почини ссылки', 'Наведи порядок'],
    },
    ai_action_edit: 'Исправить самому',
    ai_action_edit_cancel: 'Вернуть как было',
    ai_action_edit_apply: 'Применить с правкой',
    ai_action_edit_save: 'Сохранить правку',
    ai_action_corrected: 'с вашей правкой',
    ai_action_model_words: (words) => `Модель предлагала: ${words}`,
    ai_action_text_roles: {
      description: 'Описание',
      text: 'Текст',
      fact: 'Факт',
      word: 'Слово',
      meaning: 'Что значит',
      tag: 'Новый тег',
      note: 'Заметка',
      'note-this': 'С этой стороны',
      'note-other': 'С той стороны',
    },
    ai_message_template: (title) => `Готовая просьба «${title}»`,
    ai_message_field: (field) => `У поля «${field}»`,
    ai_continue_text: 'Дальше',
    ai_continue_more: (count, key) =>
      `Проверить ещё ${key ? checkUnits(count, key) : count}`,
    ai_continue_looked: (count, key) =>
      `Просмотрено: ${key ? checkUnits(count, key) : count}`,
    ai_continue_hint: 'Следующая порция — в этой же сессии',
    ai_continue_nothing: 'Больше смотреть нечего',
    ai_continue_done: 'Просмотрено всё, что было',
    ai_answer_to: (question) => `Ответ: ${question}`,
    ai_composer_placeholder: 'Что сделать?',
    ai_composer_running: 'Можно дописать — модель учтёт',
    ai_composer_attach: 'Прикрепить',
    ai_composer_files: {
      title: 'Фото или файл',
      hint: 'Можно и вставить, и перетащить сюда',
    },
    ai_composer_file_remove: 'Убрать файл',
    ai_composer_file_failed: 'Не загрузился',
    ai_composer_files_limit: (max) =>
      `В одном сообщении — не больше ${max} файлов`,
    ai_composer_file_unnamed:
      'У файла нет расширения — по нему сайт узнаёт, что это',
    ai_composer_drop: 'Отпустите, чтобы приложить',
    ai_message_file_gone: 'Файл удалён',
    ai_composer_mention: {
      title: 'Запись, проект, событие',
      hint: 'То же, что @ в тексте',
    },
    ai_send: 'Отправить',
    ai_stop: 'Остановить',
    ai_usage_title: (month) => `Токены за ${month}`,
    ai_usage_amount: (spent, limit) => `${spent} из ${limit}`,
    ai_usage_average: (average, averageText) =>
      `Ответ модели обычно стоит ${averageText} ${
        // «1,2 тыс.» is followed by «токенов» whatever the number.
        average >= 1000
          ? 'токенов'
          : plural(average, 'токен', 'токена', 'токенов', false)
      }`,
    ai_new_title: 'О чём поговорим?',
    ai_new_text:
      'Спросите про архив, попросите оформить, вычитать или навести порядок. ИИ предложит действия — ничего не изменится, пока вы не примете.',
    ai_template_builtins: {
      proofread: {
        title: 'Ошибки в тексте',
        instruction:
          'Найди и исправь очевидные ошибки в тексте. Если есть сомнения, прокомментируй и предоставь выбор мне. Только то, что ещё не было вычитано или изменилось с тех пор.\n\n' +
          'Не исправляй авторский стиль подачи текста и мат. Ты проверяешь правильность написания текста, а не «корректность», «красоту», «лаконичность» и другие субъективные критерии!',
      },
      describe: {
        title: 'Описания файлов',
        instruction:
          'Добавь описания для файлов, у которых их нет. При составлении описания анализируй не только сам файл, но и контекст мест, в которых он используется (проект, событие или раздел, где он стоит, подписи, окружающий текст и т. д.).\n\n' +
          'Если нет уверенности или описание для файла составить не получается по любой причине, сообщай мне.',
      },
      links: {
        title: 'Битые ссылки',
        instruction:
          'Найди сломанные внутренние ссылки. Для каждой разбери, в чем проблема поломки: то, на что вела ссылка, удалено, заголовок, на который она вела, удалён или изменён и так далее.\n\n' +
          'Попытайся исправить ситуацию и найти уверенную замену с сохранением сути ссылки. Крайняя мера — убрать ссылку совсем.',
      },
      graph: {
        title: 'Связи и ссылки',
        instruction:
          'Проанализируй связи и ссылки между проектами, событиями и записями дневника.\n\n' +
          'Предложи недостающие связи и удаление слабых — тех, у которых нет достаточного обоснования.\n\n' +
          'Ищи в текстах упоминания других проектов, событий и записей без ссылки и, если сильно уверен, что ссылка нужна, предлагай её — в том числе на разделы проектов и на конкретные заголовки. Явно ошибочные или лишние ссылки предлагай удалить.',
      },
      tags: {
        title: 'Аудит тегов',
        instruction:
          'Проверь теги: каким проектам и событиям нужно добавить подходящие теги или убрать лишние, какие теги создать, а какие удалить, и какие синонимы добавить тегам.\n\n' +
          'Создание или удаление тега — только с уверенным обоснованием и примерами проектов и событий, которых это коснётся.',
      },
    },
    ai_template_copy_title: (title) => `${title} (копия)`,
    ai_template_note: (title, count) =>
      count === null
        ? `«${title}» — запущено вами`
        : `«${title}» — запущено вами · к проверке: ${count}`,
    ai_action_kinds: {
      update: 'Изменить',
      field: 'Поле',
      periods: 'Даты',
      tags: 'Теги',
      relation: 'Связь',
      note: 'В заметки',
      access: 'Доступ',
      write: 'Текст',
      revise: 'Правка текста',
      create: 'Создать',
      delete: 'Удалить',
      remember: 'Запомнить',
      term: 'В словарь',
      'memory-compact': 'Сжать память',
      describe: 'Описание файла',
    },
    ai_memory_owner: 'О вас',
    ai_review_title: 'Правка текста',
    ai_review_compare_title: (when) => `Сравнение · ${when}`,
    ai_review_compare_why:
      'Сравнение с текстом в этом окне. Возьмите всё или только нужное — остальное останется как сейчас. Взятое ляжет в текст окна; сохраните, как обычно.',
    ai_review_view: 'Вид правки',
    ai_review_views: {
      read: 'Чтение',
      diff: 'Было и стало',
      list: 'Список',
    },
    ai_review_kinds: {
      spelling: 'Орфография',
      grammar: 'Грамматика',
      punctuation: 'Пунктуация',
      case: 'Заглавная буква',
      'missing-letter': 'Пропущенная буква',
      link: 'Ссылка',
      changed: 'Блок изменён',
      added: 'Новый блок',
      removed: 'Блок уходит',
      heading: 'Новый заголовок',
      delimiter: 'Разделитель',
      removal: 'Повтор убран',
      split: 'Абзац разделён',
      order: 'Новый порядок',
    },
    ai_review_where: {
      caption: 'в подписи',
      file: 'в названии или подписи файла',
      link: 'в заметке к ссылке',
    },
    ai_review_unsure: 'на ваше решение',
    ai_review_private: 'приватная часть',
    ai_review_settled: {
      applied: 'Уже в тексте',
      stale: 'Этих слов в тексте уже нет',
    },
    ai_review_modes: {
      ai: {
        accept: 'Принять',
        keep: 'Оставить как было',
        sure: 'Принять уверенные правки',
        take_sure: (count) => `Принять уверенные · ${count}`,
        was: 'Было',
        will: 'Будет',
        accepted: 'Принято',
        kept: 'Как было',
        apply: (count) => `Применить · ${count}`,
        finish: (decided, total) => `Решено ${decided} из ${total}`,
        finish_hint:
          'Принятое ляжет в текст сейчас — прежний останется в истории версий. Нерешённое подождёт в сессии.',
      },
      version: {
        accept: 'Взять',
        keep: 'Оставить как сейчас',
        sure: 'Взять всё',
        take_sure: (count) => `Взять всё · ${count}`,
        was: 'Сейчас',
        will: 'Там',
        accepted: 'Взято',
        kept: 'Как сейчас',
        apply: (count) => `Взять · ${count}`,
        finish: (decided, total) => `Отмечено ${decided} из ${total}`,
        finish_hint:
          'Взятое ляжет в текст окна; остальное останется как сейчас.',
      },
    },
    ai_review_put: (count) => `Подставить · ${count}`,
    ai_review_finish_editor:
      'Принятое ляжет в текст окна; сохраните, как обычно. Нерешённое подождёт в сессии.',
    ai_review_close: 'Закрыть',
    ai_review_go_on: 'Продолжить',
    ai_review_undo: 'Отменить решение',
    ai_review_prev: 'Предыдущая',
    ai_review_next: 'Следующая',
    ai_review_words: (count) =>
      plural(count, 'правка слов', 'правки слов', 'правок слов'),
    ai_review_blocks: (count) =>
      plural(count, 'правка блоков', 'правки блоков', 'правок блоков'),
    ai_review_unsure_count: (count) => `${count} на ваше решение`,
    ai_review_all_decided: 'всё решено',
    ai_review_filters: {
      all: 'Все',
      unsure: 'На ваше решение',
      words: 'Слова',
      blocks: 'Блоки',
    },
    ai_review_gone: 'Блок уйдёт',
    ai_review_gone_taken: 'Блок убран',
    ai_review_files: (count, extensions) =>
      count === 1
        ? extensions
          ? `Файл ${extensions}`
          : 'Файл'
        : `${plural(count, 'файл', 'файла', 'файлов')}${extensions ? `: ${extensions}` : ''}`,
    ai_review_not_added: 'Блок не добавлен',
    ai_review_file_added: 'Новый файл',
    ai_review_file_removed: 'Файл уходит',
    ai_review_changes: {
      type: (from, to) => (from && to ? `${from} → ${to}` : 'Другой вид блока'),
      level: (from, to) => `Уровень заголовка ${from} → ${to}`,
      style: (from, to) => `Список: ${from} → ${to}`,
      spoiler: (on) => (on ? 'Спрятан под спойлер' : 'Спойлер снят'),
      numbering: 'Нумерация списка',
      checks: 'Отметки в списке',
      markup: 'Оформление слов',
      alignment: 'Выравнивание цитаты',
      layout: 'Размер на странице',
      title: 'Название',
      caption: 'Подпись',
      files: 'Файлы',
      target: 'Куда ведёт',
      note: 'Заметка к ссылке',
      other: 'Настройки блока',
    },
    ai_review_moved: (count) =>
      `Переставит ${plural(count, 'блок', 'блока', 'блоков')}`,
    ai_review_split_into: (count) =>
      `Разделится на ${plural(count, 'абзац', 'абзаца', 'абзацев')}`,
    ai_review_comment_placeholder: 'Что сделать иначе?',
    ai_review_comment_sent:
      'Комментарий в сессии: модель пришлёт новую версию правки.',
    ai_review_from_session: (title) =>
      title ? `Из сессии «${title}»` : 'Из сессии',
    ai_review_applied: (count) =>
      `В тексте ${plural(count, 'правка', 'правки', 'правок')}`,
    ai_review_taken: (count) =>
      `Взято ${plural(count, 'часть', 'части', 'частей')}`,
    ai_memory_search: 'Найти в памяти — слово, имя, проект',
    ai_memory_owner_hint:
      'Любая модель — на сайте или в приложении — читает это в каждой сессии: как вы пишете, что не трогать, что для вас важно.',
    ai_memory_owner_never: 'Больше не предлагать нигде',
    ai_memory_chars: (count, max) => `${count} из ${max} знаков`,
    ai_memory_terms: 'Словарь',
    ai_memory_terms_hint:
      'Имена, места, ваши слова. Модель читает слово, когда оно есть в тексте; слово «не исправлять» вычитка оставляет как есть.',
    ai_memory_term_new: 'Имя, место или ваше слово',
    ai_memory_term_exists: 'Такое слово уже есть в словаре.',
    ai_memory_term_add: 'Добавить в словарь',
    ai_memory_term_word: 'Слово',
    ai_memory_term_note: 'Что это',
    ai_memory_term_note_placeholder: 'Например: брат; архипелаг в Белом море',
    ai_memory_term_forms: 'Другие формы',
    ai_memory_term_forms_placeholder: 'Через запятую: на Кузова, на Кузовах',
    ai_memory_term_keep: 'Не исправлять',
    ai_memory_term_keep_hint: 'Вычитка оставит слово так, как оно написано',
    ai_memory_term_uses: (count) =>
      count
        ? `в ${count} ${plural(count, 'тексте', 'текстах', 'текстах', false)}`
        : 'пока нигде',
    ai_memory_term_remove: 'Убрать из словаря',
    ai_memory_kinds_title: 'Общие правила',
    ai_memory_kinds_hint:
      'Не про что-то одно, а про всё такое сразу: все записи дневника, все проекты, все файлы. Например: «Все записи дневника: теги не предлагать». Модель держится правила, когда работает с любым из них.',
    ai_memory_entities_title: 'О проектах, событиях и записях',
    ai_memory_entities_hint:
      'Модель читает это вместе с тем, о чём оно. То же видно в его форме.',
    ai_memory_entity_kinds: {
      project: 'проект',
      'project-section': 'раздел проекта',
      event: 'событие',
      'diary-entry': 'запись дневника',
      page: 'страница',
      tag: 'тег',
      asset: 'файл',
    },
    ai_memory_nothing: 'Пока ничего.',
    ai_memory_by_you: 'вы',
    ai_memory_edit: 'Изменить',
    ai_memory_forget: 'Забыть',
    ai_memory_allow: 'Снова можно предлагать',
    ai_memory_forgotten: 'Забыто',
    ai_memory_restore: 'Вернуть',
    ai_offer_take: 'Попадёт в форму — изменится, когда вы её сохраните',
    ai_offer_put: { put: 'Подставить', add: 'Добавить', remove: 'Убрать' },
    ai_offer_in_session: 'Открыть в сессии',
    ai_offer_taken: 'Форма изменена — сохраните её',
    ai_offer_taken_file: 'Описание подставлено — сохраните его',
    ai_offer_take_back: 'Отменить',
    ai_offer_take_back_hint: 'Вернуть в форме, как было',
    ai_offer_taken_row: 'В форме — изменится, когда вы её сохраните',
    ai_offer_chip: (label) => `Предложено ИИ: ${label}`,
    ai_field_offers: (count) =>
      count === 1 ? 'Предложение ИИ' : `Предложения ИИ: ${count}`,
    ai_field_offer_prev: 'Предыдущее предложение',
    ai_field_offer_next: 'Следующее предложение',
    ai_remember_title: 'Запомнить',
    ai_remember_placeholder:
      'Что модели знать об этом? Например: «маршрут больше не секрет»',
    ai_remember_hint:
      'Модель прочитает это, только когда будет работать с этим.',
    ai_remember_save: 'Запомнить',
    ai_remember_saved: 'Запомнено',
    ai_memory_block_title: 'Что помнит ИИ',
    ai_memory_block_hint: (withIt) =>
      `Модель читает это, только когда работает с ${withIt}.`,
    ai_memory_digest_fresh: (when) =>
      `Так модель коротко помнит это · по версии от ${when}; изменится — перепишет`,
    ai_memory_digest_stale: (when) =>
      `Написано по версии от ${when}; с тех пор изменилось — модель перепишет при следующем чтении`,
    ai_memory_parts: 'И у частей:',
    ai_entity_this: {
      profile: 'ваш профиль',
      project: 'этот проект',
      'project-section': 'этот раздел',
      event: 'это событие',
      'diary-entry': 'эта запись',
      page: 'эта страница',
      tag: 'этот тег',
    },
    ai_entity_with: {
      project: 'этим проектом',
      'project-section': 'этим разделом',
      event: 'этим событием',
      'diary-entry': 'этой записью',
      page: 'этой страницей',
      tag: 'этим тегом',
    },
    ai_entity_menu: (it) => `ИИ и ${it}`,
    ai_entity_new_session: (title) => `Новая сессия о «${title}»`,
    ai_entity_sessions: (count) => `Сессии · ${count}`,
    ai_entity_no_sessions: 'Сессий о нём ещё не было',
    ai_entity_all_sessions: 'Все сессии о нём',
    ai_session_applied_count: (count) => `Применено: ${count}`,
    ai_form_outdated: 'Изменено в сессии ИИ, пока форма открыта',
    ai_form_outdated_hint:
      'Обновите форму: сохранить поверх изменения не получится.',
    ai_form_reload: 'Обновить',
    ai_sessions_about: 'Только о',
    ai_sessions_about_clear: 'Показать все сессии',
    ai_new_about: 'О чём:',
    ai_bar_new_plain: 'Новая сессия без привязки',
    ai_bar_waiting_title: (count) => `Ждут вас · ${count}`,
    ai_bar_nothing_waits: 'Ничего не ждёт вашего решения.',
    ai_bar_all_sessions: 'Все сессии',
    ai_memory_open: 'Открыть',
    ai_memory_more: (count) => `Ещё ${count}`,
    ai_memory_cancel: 'Отмена',
    ai_memory_kinds: {
      project: 'Все проекты',
      'project-section': 'Все разделы проектов',
      event: 'Все события',
      'diary-entry': 'Все записи дневника',
      page: 'Все страницы',
      tag: 'Все теги',
      asset: 'Все файлы',
    },
    ai_action_and: 'и',
    ai_action_term_keep: 'Не исправлять',
    ai_action_facts: (count) => plural(count, 'факт', 'факта', 'фактов'),
    ai_action_card_title: (count) => `Действия · ${count}`,
    ai_action_apply: 'Применить',
    ai_action_apply_count: (count) => `Применить · ${count}`,
    ai_action_apply_sure: 'Принять уверенные части',
    ai_action_apply_final: 'Применить — окончательно',
    ai_action_reject: 'Отклонить',
    ai_action_reject_all: 'Отклонить все',
    ai_action_comment: 'Комментировать',
    ai_action_open: 'Открыть',
    ai_action_undo: 'Отменить',
    ai_action_restore: 'Вернуть к решению',
    ai_action_restore_never: 'Вернуть к решению — и снова предлагать такое',
    ai_action_accept_short: 'Принять',
    ai_action_restore_short: 'Вернуть',
    ai_entity_offer_at: (field) => `Предложение ждёт у поля «${field}»`,
    ai_entity_offer_came: 'Предложение ждёт в форме',
    ai_entity_offers_came: (count) =>
      `${plural(count, 'предложение ждёт', 'предложения ждут', 'предложений ждут')} в форме`,
    ai_entity_offer_show: 'Показать',
    ai_action_never: 'Больше не предлагать',
    ai_action_pick: 'Включить в применение',
    ai_action_unsure: 'На ваше решение.',
    ai_action_applied: (by, when) => `Применено ${by} · ${when}`,
    ai_action_by: { owner: 'вами', app: 'приложением' },
    ai_action_states: {
      rejected: 'Отклонено',
      never: 'Больше не предложит',
      undone: 'Отменено',
      stale: 'Устарело: изменилось после предложения',
      failed: 'Не применилось:',
      superseded: 'Заменено новой версией',
      applying: 'Применяется…',
    },
    ai_action_undo_states: {
      changed: 'С тех пор изменено: отмена сняла бы и это',
      gone: 'С тех пор удалено',
      final: 'Отменить нельзя',
      undone: 'Уже отменено',
    },
    ai_action_atomic_hint:
      'Проверятся вместе; при сбое ничего не останется наполовину',
    ai_action_unticked_hint: 'Без галочки — отклонятся',
    ai_action_final_note: 'Удаление окончательное — отменить нельзя',
    ai_action_by_ai: 'написано ИИ',
    ai_action_corrections: (count) =>
      plural(count, 'правка', 'правки', 'правок'),
    ai_action_unsure_count: (count) => `${count} на решение`,
    ai_action_order: 'Новый порядок',
    ai_action_order_parts: (count) => plural(count, 'часть', 'части', 'частей'),
    ai_action_relink: 'Починка ссылок',
    ai_action_relinks: (count) => plural(count, 'ссылка', 'ссылки', 'ссылок'),
    ai_review_link_gone: 'то, куда она вела, удалено',
    ai_review_link_off: 'без ссылки, слова остаются',
    ai_review_link_none: 'без ссылки',
    ai_review_link_changed: 'Ссылка ведёт уже в другое место',
    ai_action_relations: {
      related: 'Связаны',
      'depends-on': 'зависит от',
      affects: 'влияет на',
    },
    ai_action_relation_removed: 'Убрать связь',
    ai_action_write_modes: {
      new: 'Новый текст',
      append: 'Дописать',
      replace: 'Переписать',
    },
    ai_action_texts: {
      body: 'текст',
      notes: 'заметки',
      description: 'описание',
      about: 'о себе',
    },
    ai_action_fields: {
      title: 'Название',
      summary: 'Суть',
      reminder: 'Напоминание',
      showcase: 'Витрина',
      cv: 'Резюме',
      description: 'Описание',
      synonyms: 'Синонимы',
      slogan: 'Слоган',
      statuses: 'Статусы',
      actionText: 'Текст кнопки',
      access: 'Доступ',
      slug: 'Адрес',
      publicId: 'Публичный ID',
      icon: 'Иконка',
      banner: 'Баннер',
      showcaseFiles: 'Файлы витрины',
      files: 'Файлы',
      links: 'Ссылки',
      tags: 'Теги',
      relations: 'Связи',
      notes: 'Заметки',
      sections: 'Разделы',
      sectionOrder: 'Порядок разделов',
      private: 'Приватный',
      periods: 'Даты',
      body: 'Текст',
      date: 'День',
      displayName: 'Имя',
      nickname: 'Псевдоним',
      about: 'Обо мне',
      favicon: 'Иконка сайта',
    },
    ai_action_flag: { on: 'да', off: 'нет' },
    ai_action_cleared: 'пусто',
    ai_action_more: (count) => `ещё ${count}`,
    ai_action_term_note: 'Пояснение',
    ai_action_term_forms: 'Формы',
    ai_action_create: {
      project: 'Создать проект',
      'project-section': 'Создать раздел',
      event: 'Создать событие',
      'diary-entry': 'Создать запись',
      page: 'Создать страницу',
      tag: 'Создать тег',
    },
    ai_action_parts: {
      sections: 'Разделы',
      tags: 'Теги',
      relations: 'Связи',
    },
    ai_action_access: {
      public: 'Публичный',
      'link-only': 'По ссылке',
      private: 'Приватный',
    },
    ai_action_update_fields: (fields) => `Изменить: ${fields}`,
    ai_toast_declined: (count) =>
      count === 1 ? 'Отклонено' : `Отклонено: ${count}`,
    ai_toast_never: 'Больше не предложит',
    ai_toast_comment_sent: 'Отправлено — модель ответит новой версией',
    ai_toast_pinned: 'Закреплена — останется наверху и не уйдёт в архив',
    ai_toast_unpinned: 'Откреплена',
    ai_toast_undone: 'Отменено',
    ai_toast_applied: (count) =>
      count === 1 ? 'Применено' : `Применено: ${count}`,
    ai_session_waiting_next: 'К следующему ждущему',
    ai_session_apply_sure: (count) => `Применить уверенные · ${count}`,
    ai_session_apply_sure_hint:
      'Применит все уверенные предложения этой сессии. Остальные будут ждать вашего решения',
    ai_toast_restored: 'Возвращено к решению',
    ai_comment_label: 'Комментарий',
    ai_comment_placeholder: 'Что изменить?',
    ai_comment_too_long: (max) => `Не больше ${max} символов`,
    ai_comment_quick: ['Другой вариант', 'Почему так?'],
    ai_model_states: {
      ready: 'работает',
      off: 'ИИ в Thei выключен',
      none: 'модель не настроена',
      'no-key': 'нет ключа API',
      'no-address': 'не указан адрес API',
      'no-model': 'не указана модель',
      budget: 'лимит на месяц исчерпан',
    },
    ai_model_provider_label: 'Кто отвечает в сессиях',
    ai_model_provider_cards: {
      none: {
        title: 'Только мои ИИ-приложения',
        text: 'Здесь не отвечает никакая модель: свои сессии оставляют ваши приложения через MCP, по вашей подписке.',
      },
      api: {
        title: 'Модель по ключу API',
        text: 'Thei сам обращается к выбранному сервису; оплата — по факту, на счёт ключа.',
      },
    },
    ai_model_service_label: 'Сервис',
    ai_model_no_sound:
      'Claude видит картинки, PDF и тексты, но не слышит звук: о записи или о звуке видео ему только скажут, что их не удалось показать.',
    ai_model_service_choose: 'Выберите сервис',
    ai_model_service_custom: 'Свой адрес…',
    ai_model_service_local: (name) => `${name} — на вашем компьютере`,
    ai_model_service_missing: 'Выберите сервис.',
    ai_model_base_url: 'Адрес API',
    ai_model_label: 'Модель',
    ai_model_list_refresh: 'Обновить список моделей',
    ai_model_unlisted:
      'Сервис не дал списка моделей — впишите название вручную.',
    ai_model_choose: 'Выберите модель',
    ai_model_other: 'Другая…',
    ai_model_choice: 'Модель сессии',
    ai_model_id_placeholder: 'Название модели',
    ai_model_missing: 'Укажите модель.',
    ai_model_address_invalid:
      'Адрес API должен начинаться с http:// или https://.',
    ai_model_key: 'Ключ API',
    ai_model_key_placeholder: 'Вставьте ключ API',
    ai_model_key_replace_placeholder: (hint) =>
      `Задан ключ …${hint}. Вставьте новый, чтобы заменить`,
    ai_model_key_remove: 'Удалить ключ',
    ai_model_key_remove_confirm:
      'Удалить ключ API? Модель перестанет отвечать, пока вы не вставите новый.',
    ai_model_key_where: 'Где взять ключ API',
    ai_model_key_optional: 'Модели на вашем компьютере ключ не нужен.',
    ai_model_limit_label: 'Лимит в месяц',
    ai_model_limit_hint:
      'Исчерпав лимит, Thei не обращается к модели до следующего месяца. ' +
      'Деньги считает сервис — задайте предел расходов и у него.',
    ai_model_limit_unit: 'млн токенов',
    ai_model_limit_tokens:
      'Токен — единица расхода модели: примерно слог прочитанного или ' +
      'написанного. Прочитанное из кеша считается за десятую часть — ' +
      'примерно столько оно и стоит.',
    ai_model_limit_tokens_link: 'Что такое токены?',
    ai_model_limit_invalid: 'Лимит — число миллионов больше нуля.',
    ai_model_usage_line: (month, spent, limit) =>
      `${month}: ${spent} из ${limit} токенов`,
    ai_model_average: (amount) => `Ответ в среднем ≈ ${amount} токенов`,
    ai_model_check: 'Проверить',
    ai_model_check_outcomes: {
      ok: 'работает',
      key: 'ключ API не подошёл',
      model: 'модель не найдена',
      address: 'адрес не отвечает',
      busy: 'провайдер занят, попробуйте позже',
      error: 'ошибка',
    },
    ai_bar_waiting: (count) => (count ? `ИИ: ждут вас — ${count}` : 'ИИ'),
    ai_error: 'Не получилось. Попробуйте ещё раз.',
    ai_off_notice: 'ИИ в Thei выключен.',
    x_sections: (count) => plural(count, 'раздел', 'раздела', 'разделов'),
  },
});

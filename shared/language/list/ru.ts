import { generalNormalize } from '../general-normalize';
import { defineI18nModule } from '../define';

function normalize(text: string): string {
  return (
    generalNormalize(text)
      // "text" → «text» (guillemets)
      .replace(/"([^"]*)"/g, '\u00AB$1\u00BB')
  );
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

export default defineI18nModule({
  code: 'ru',
  normalize,
  sizeUnits: { b: 'байт', kb: 'Кб', mb: 'Мб', gb: 'Гб' },
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
    language_name: 'Русский',
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
      'Эти настройки применяются для всех. Выбирайте с умом.',
    ui_language: 'Язык интерфейса',
    ui_language_hint: 'Выберите тот же язык, на котором будете писать контент.',
    site_access: 'Доступ к сайту',
    site_access_open: 'Открытый',
    site_access_closed: 'Закрытый',
    site_access_open_description:
      'Посетить сайт может любой. Можно точечно ограничивать доступ к отдельным проектам, событиям и файлам. Подойдет большинству.',
    site_access_closed_description:
      'Любой контент сайта сможете просматривать только вы. Подойдет секретным агентам, которые держат все аспекты своей жизни в строжайшем секрете.',
    admin_data: 'Данные администратора',
    admin_data_description:
      'Базовая информация о вас и способ войти в админ-панель.',
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
    unknown: 'Неизвестно',
    system: 'Система',
    admin_sessions: 'Сессии администратора',
    admin_sessions_description:
      'Последние сессии, которые задействовали админ-доступ.',
    active_admin_sessions: 'Активные сессии',
    active_admin_sessions_description: 'Эти сессии имеют админ-доступ.',
    destroyed_admin_sessions: 'Отключенные сессии',
    destroyed_admin_sessions_description:
      'Эти сессии больше не имеют админ-доступа.',
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
    admin_projects_description: 'Все проекты, управляемые на этом сайте.',
    to_admin_panel: 'В админ-панель',
    to_website: 'На сайт',
    project: 'Проект',
    x_projects: (count: number) =>
      plural(count, 'проект', 'проекта', 'проектов'),
    event: 'Событие',
    x_events: (count: number) => plural(count, 'событие', 'события', 'событий'),
    new_project: 'Новый проект',
    new_event: 'Новое событие',
    create: 'Создать',
    edit_project: 'Изменить проект',
    view_project: 'Смотреть на сайте',
    unsaved_changes_confirm: 'Есть несохранённые изменения. Покинуть страницу?',
    project_title: 'Название проекта',
    project_title_hint:
      'Одно или несколько слов: название продукта, пройденной игры, посещенного мероприятия...',
    project_summary: 'Суть проекта',
    project_summary_hint:
      'О чём проект? Опишите одним или несколькими предложениями. Чем короче, тем лучше.',
    edit_event: 'Изменить событие',
    drafts: 'Черновики',
    save: 'Сохранить',
    delete: 'Удалить',
    asset_profile_hint_icon:
      'Рекомендуемое соотношение: <strong>1:1</strong>.<br/>Будет изменено до <strong>256×256</strong>.',
    asset_profile_hint_banner:
      'Рекомендуемое соотношение: <strong>16:9</strong>.<br/>Будет изменено до <strong>1200×675</strong>.',
    file_formats: 'Форматы',
    file_max_size: 'Макс. размер',
    file_any_format: 'любой',
    project_slug: 'Часть ссылки проекта',
    project_slug_hint: 'Уникальный ID проекта в составе ссылки на него.',
    generate_random: 'Сгенерировать случайный',
    duplicate_slug: 'Этот ID уже занят! Выберите другой.',
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
    saved: 'Сохранено!',
    important_project: 'Важный проект?',
    important_project_hint:
      'Проект запомнился надолго и/или сильно повлиял на вашу жизнь.',
    cv_project: 'Часть резюме?',
    cv_project_hint:
      'Потенциальному работодателю будет интересно увидеть этот проект.',
    project_files: 'Файлы проекта',
    project_files_description: 'Иконка, баннер, витрина и остальные файлы...',
    project_icon: 'Иконка проекта',
    project_icon_hint: 'Яркая и запоминающаяся.',
    delete_project: 'Удалить проект',
    delete_project_confirm:
      'Это действие необратимо. Введите название проекта, чтобы подтвердить удаление:',
    size: 'Размер',
    just_now: 'Сейчас',
  },
});

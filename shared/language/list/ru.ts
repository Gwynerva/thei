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
      title: 'Марафонская подготовка',
      summary:
        'За 6 месяцев прошёл путь от дивана до 42 км по структурированному плану тренировок.',
    },
    {
      title: 'Полгода в тренажёрном зале',
      summary:
        'Отслеживал прогресс в силовых упражнениях от новичка до уверенного атлета.',
    },
    {
      title: 'Короткометражка: Эхо',
      summary: '12-минутный триллер, снятый за один уикенд вдвоём.',
    },
    {
      title: 'Кинодневник 2024',
      summary: 'Посмотрел и оценил более 150 фильмов за год.',
    },
    {
      title: 'Инди-игра: Luminos',
      summary:
        'Головоломка-платформер на Godot, разработанная за три месяца и выложенная на itch.io.',
    },
    {
      title: 'Elden Ring — все достижения',
      summary: 'Прошёл игру вместе со всеми DLC, открыв каждое достижение.',
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
    last_active_at: 'Активность',
    online: 'Онлайн',
    this_is_you: 'Это вы',
    failed_to_fetch_data: 'Не удалось загрузить данные!',
    admin_panel: 'Админ-панель',
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
  },
});

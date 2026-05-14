import { defineLanguagePhrases } from '../phrases';

export default defineLanguagePhrases({
  language_code: 'ru',
  language_name: 'Русский',

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
  global_settings_title: 'Глобальные настройки',
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

  // #region Install
  install_title: 'Установка Thei',
  install_subtitle: 'Цифровой архив вашей жизни!',
  install_language_label: 'Язык интерфейса',
  install_language_hint:
    'Выберите тот же язык, на котором будете писать контент. Этот параметр применяется для всех пользователей.',
  install_display_name_label: 'Как к вам обращаться?',
  install_display_name_variants: 'Петр,Евгений,Анна,Светлана,Алексей,Мария',
  install_display_name_description: (name: string) =>
    `Можно имя или ник: "Привет, ${name}!"`,
  install_auth_path_label: 'Адрес входа в админ-панель',
  install_auth_path_prefix: '/auth/',
  install_auth_path_placeholder: 'мой/секретный/адрес',
  install_auth_path_description:
    'Держите его в секрете вместе с паролем! Не раскрывайте его третьим лицам.',
  install_password_label: 'Пароль',
  install_password_placeholder: 'Введите пароль',
  install_confirm_password_label: 'Подтверждение пароля',
  install_confirm_password_placeholder: 'Повторите пароль',
  install_theme_label: 'Тема',
  install_theme_hint:
    'Применяется только для вас. Посетители могут выбрать собственную тему.',
  install_theme_system: 'Системная',
  install_theme_light: 'Светлая',
  install_theme_dark: 'Тёмная',
  install_access_label: 'Доступ к сайту',
  install_access_open: 'Открытый',
  install_access_closed: 'Закрытый',
  install_access_open_description:
    'Посетить сайт может любой. Можно точечно ограничивать доступ к отдельным проектам, событиям и файлам. Подойдет большинству.',
  install_access_closed_description:
    'Вообще любой контент сайта сможете просматривать только вы и больше никто. Подойдет секретным агентам, которые держат все аспекты своей жизни в строжайшем секрете.',
  install_submit: 'Установить',
  install_installing: 'Установка...',
  install_error_passwords_mismatch: 'Пароли не совпадают!',
  install_error_fields_required: 'Все поля обязательны.',
  install_error_auth_path_spaces:
    'Путь для авторизации не должен содержать пробелы.',
  // #endregion

  // #region Auth
  auth_tab_title: 'Вход',
  auth_subtitle: 'Вход в админ-панель Thei',
  auth_password_placeholder: 'Введите пароль',
  auth_submit: 'Войти',
  auth_submitting: 'Вход...',
  auth_error_wrong_password: 'Неверный пароль!',
  auth_error_rate_limited:
    'Слишком много попыток входа! Подождите перед следующей попыткой!',
  // #endregion

  secret_admin: 'Секретный админ',
  to_admin_panel: 'В админ-панель',
  to_website: 'На сайт',
  sign_out: 'Выйти',
  project: 'Проект',
  x_projects: (count: number) => m(count, 'проект', 'проекта', 'проектов'),
  event: 'Событие',
  x_events: (count: number) => m(count, 'событие', 'события', 'событий'),
  new_project: 'Новый проект',
  new_event: 'Новое событие',
  edit_project: 'Изменить проект',
  edit_event: 'Изменить событие',
});

export function m(
  number: number,
  one: string,
  two: string,
  five: string,
  includeNumber = true,
) {
  const text = [five, one, two, two, two, five][
    number % 100 > 10 && number % 100 < 20 ? 0 : Math.min(number % 10, 5)
  ]!;
  return includeNumber ? `${number} ${text}` : text;
}

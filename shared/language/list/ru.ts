import { defineLanguagePhrases } from '../phrases';

export default defineLanguagePhrases({
  language_code: 'ru',
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
  display_name_variants: 'Петр,Петра,Евгений,Анна,Светлана,Алексей,Мария',
  display_name_hint: (name: string) => `Можно имя или ник: "Привет, ${name}!"`,
  secret_phrase: 'Секретная фраза',
  secret_phrase_variants:
    'Мой любимый 🐈 - Пушок;Быть или не быть, вот в чем вопрос;Пароль рыба-меч;Никто никогда не вернется в 2007 год;Ничто не истина, всё дозволено',
  secret_phrase_hint:
    'Любая фраза для входа в админ-панель вместе с паролем. Чем сложнее, тем лучше! Можно с эмоджи 😎',
  password: 'Пароль',
  repeat_password: 'Повторите пароль',
  install: 'Установить',
  installing: 'Установка',
  this_field_must_be_filled: 'Это поле должно быть заполнено!',

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

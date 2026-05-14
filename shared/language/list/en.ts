import { defineLanguagePhrases } from '../phrases';

export default defineLanguagePhrases({
  language_code: 'en',
  language_name: 'English',

  visuals: 'Visuals',
  visuals_description:
    'Only applies for you. Visitors can choose their own settings.',
  theme: 'Theme',
  theme_system: 'System',
  theme_light: 'Light',
  theme_dark: 'Dark',
  accent_color: 'Accent Color',
  font_style: 'Font Style',
  font_sans: 'Sans',
  font_serif: 'Serif',
  global_settings_title: 'Global Settings',
  global_settings_description:
    'These settings apply for everyone. Choose wisely.',
  ui_language: 'UI Language',
  ui_language_hint:
    'Choose the same language you will use for writing content.',
  site_access: 'Site Access',
  site_access_open: 'Open',
  site_access_closed: 'Closed',
  site_access_open_description:
    'Anyone can visit the site. You can restrict access to individual projects, events, and files. Suitable for most people.',
  site_access_closed_description:
    'Only you and no one else will be able to view any content on the site. Suitable for secret agents who keep all aspects of their lives in strict secrecy.',
  admin_data: 'Admin Data',
  admin_data_description:
    'Basic information about you and how to log in to the admin panel.',

  // #region Install
  install_title: 'Install Thei',
  install_subtitle: "Your life's digital archive!",
  install_language_label: 'UI Language',
  install_language_hint:
    'Choose the same language you will use for writing content. This setting applies to all users.',
  install_display_name_label: 'Display Name',
  install_display_name_variants: 'Alex,Jordan,Morgan,Taylor,Casey',
  install_display_name_description: (name: string) =>
    `Can be a name or nickname: "Hello, ${name}!"`,
  install_auth_path_label: 'Admin Panel Login URL',
  install_auth_path_prefix: '/auth/',
  install_auth_path_placeholder: 'my/secret/path',
  install_auth_path_description:
    'Keep it secret along with the password! Do not disclose it to third parties.',
  install_password_label: 'Password',
  install_password_placeholder: 'Enter password',
  install_confirm_password_label: 'Confirm Password',
  install_confirm_password_placeholder: 'Repeat password',
  install_theme_label: 'Theme',
  install_theme_hint:
    'Only applies for you. Visitors can choose their own theme.',
  install_theme_system: 'System',
  install_theme_light: 'Light',
  install_theme_dark: 'Dark',
  install_access_label: 'Site Access',
  install_access_open: 'Open',
  install_access_closed: 'Closed',
  install_access_open_description:
    'Anyone can visit the site. You can restrict access to individual projects, events, and files. Suitable for most people.',
  install_access_closed_description:
    'Only you and no one else will be able to view any content on the site. Suitable for secret agents who keep all aspects of their lives in strict secrecy.',
  install_submit: 'Install',
  install_installing: 'Installing...',
  install_error_passwords_mismatch: 'Passwords do not match!',
  install_error_fields_required: 'All fields are required.',
  install_error_auth_path_spaces: 'Auth URL path must not contain spaces.',
  // #endregion

  // #region Auth
  auth_tab_title: 'Sign In',
  auth_subtitle: 'Thei Admin Panel Sign In',
  auth_password_placeholder: 'Enter password',
  auth_submit: 'Sign In',
  auth_submitting: 'Signing in...',
  auth_error_wrong_password: 'Wrong password!',
  auth_error_rate_limited:
    'Too many attempts! Please wait before trying again!',
  // #endregion

  secret_admin: 'Secret Admin',
  to_admin_panel: 'To Admin Panel',
  to_website: 'To Website',
  sign_out: 'Sign Out',
  project: 'Project',
  x_projects: (count: number) => m(count, 'project', 'projects'),
  event: 'Event',
  x_events: (count: number) => m(count, 'event', 'events'),
  new_project: 'New Project',
  new_event: 'New Event',
  edit_project: 'Edit Project',
  edit_event: 'Edit Event',
});

export function m(
  number: number,
  one: string,
  few: string,
  includeNumber = true,
) {
  const text = number === 1 ? one : few;
  return includeNumber ? `${number} ${text}` : text;
}

import { defineLanguagePhrases } from '../phrases';

export default defineLanguagePhrases({
  language_code: 'en',
  language_name: 'English',

  install_thei: 'Install Thei',
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
  global_settings: 'Global Settings',
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
  how_to_address_you: 'How to address you?',
  display_name_variants: 'Peter,Petra,Alex,Jordan,Morgan,Taylor,Casey',
  display_name_hint: (name: string) =>
    `Can be a name or nickname: "Hello, ${name}!"`,
  secret_phrase: 'Secret Phrase',
  secret_phrase_variants:
    'My favorite 🐈 - Fluffy;To be or not to be, that is the question;No one ever goes back to 2007;Nothing is true, everything is permitted',
  secret_phrase_hint:
    'Any phrase to log in to the admin panel along with the password. The more complex, the better! Can include emojis 😎',
  password: 'Password',
  repeat_password: 'Repeat Password',
  install: 'Install',
  installing: 'Installing',
  this_field_must_be_filled: 'This field must be filled!',
  administrator: 'Administrator',
  thei_admin_panel_sign_in: 'Thei Admin Panel Sign In',
  sign_in: 'Sign In',
  sign_out: 'Sign Out',
  signing_in: 'Signing in',
  invalid_secret_phrase_or_password: 'Invalid secret phrase or password!',
  unknown: 'Unknown',
  system: 'System',
  active_sessions: 'Active Sessions',
  active_sessions_description:
    'Listed sessions have full access to the admin panel right now.',
  archived_sessions: 'Archived Sessions',
  archived_sessions_description:
    'Old sessions that no longer have access to the admin panel.',
  failed_to_fetch_data: 'Failed to fetch data!',
  to_admin_panel: 'To Admin Panel',
  to_website: 'To Website',
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

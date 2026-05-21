import { generalNormalize } from '../general-normalize';
import { defineI18nBase } from '../define';

function normalize(text: string): string {
  return (
    generalNormalize(text)
      // "text" → "text" (curly double quotes)
      .replace(/"([^"]*)"/g, '\u201C$1\u201D')
      // Smart apostrophe in contractions: don't → don't
      .replace(/(\w)'(\w)/g, '$1\u2019$2')
  );
}

export function plural(
  count: number,
  one: string,
  few: string,
  includeNumber = true,
): string {
  const text = count === 1 ? one : few;
  return includeNumber ? `${count} ${text}` : text;
}

export default defineI18nBase({
  code: 'en',
  normalize,
  sampleDisplayNames: [
    'Peter',
    'Petra',
    'Alex',
    'Jordan',
    'Morgan',
    'Taylor',
    'Casey',
  ],
  sampleSecretPhrases: [
    'My favorite \uD83D\uDC08 - Fluffy',
    'To be or not to be, that is the question',
    'No one ever goes back to 2007',
    'Nothing is true, everything is permitted',
  ],
  phrases: {
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
    display_name_hint: (name: string) =>
      `Can be a name or nickname: "Hello, ${name}!"`,
    secret_phrase: 'Secret Phrase',
    secret_phrase_hint:
      'Any phrase to log in to the admin panel along with the password. The more complex, the better! Can include emojis \uD83D\uDE0E',
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
    admin_sessions: 'Admin Sessions',
    admin_sessions_description:
      'Recent sessions that have accessed admin privileges.',
    active_admin_sessions: 'Active Sessions',
    active_admin_sessions_description: 'These sessions have admin access.',
    destroyed_admin_sessions: 'Terminated Sessions',
    destroyed_admin_sessions_description:
      'These sessions no longer have admin access.',
    destroy_session: 'Terminate session',
    show_x_destroyed_sessions: (count: number) =>
      `Show ${plural(count, 'terminated session', 'terminated sessions')}`,
    session_details: 'Session Details',
    created_at: 'Created',
    last_active_at: 'Last Active',
    online: 'Online',
    this_is_you: 'This is you',
    failed_to_fetch_data: 'Failed to fetch data!',
    admin_panel: 'Admin Panel',
    to_admin_panel: 'To Admin Panel',
    to_website: 'To Website',
    project: 'Project',
    x_projects: (count: number) => plural(count, 'project', 'projects'),
    event: 'Event',
    x_events: (count: number) => plural(count, 'event', 'events'),
    new_project: 'New Project',
    new_event: 'New Event',
    create: 'Create',
    edit_project: 'Edit Project',
    edit_event: 'Edit Event',
    drafts: 'Drafts',
    save: 'Save',
  },
});

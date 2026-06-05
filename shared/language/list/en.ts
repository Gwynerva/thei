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
  sizeUnits: { b: 'bytes', kb: 'Kb', mb: 'Mb', gb: 'Gb' },
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
  sampleProjects: [
    {
      title: 'Digital Garden',
      summary:
        'A personal site for thinking in public — notes, half-baked ideas, and essays that grow over time.',
      slug: 'digital-garden',
    },
    {
      title: '365 Days of Photography',
      summary:
        'Shot one photo every day for a full year to develop an eye for composition.',
      slug: '365-photography',
    },
    {
      title: 'Japanese: Year One',
      summary:
        'Reached conversational level in Japanese through daily study and a month-long immersion experiment.',
      slug: 'japanese-year-one',
    },
    {
      title: 'Custom Keyboard Build',
      summary:
        'Designed and soldered a 65% mechanical keyboard from bare PCB to finished keycaps.',
      slug: 'custom-keyboard',
    },
    {
      title: 'Open Source Month',
      summary:
        'Spent a month submitting pull requests to open source projects I use every day.',
      slug: 'open-source-month',
    },
    {
      title: 'Campaign: The Iron Coast',
      summary:
        'Wrote, ran, and improvised a 12-session tabletop RPG campaign for five players.',
      slug: 'campaign-iron-coast',
    },
    {
      title: 'Chess: 1000 → 1500',
      summary:
        'Studied endgames and tactics puzzles for three months and climbed 500 rating points.',
      slug: 'chess-climb',
    },
    {
      title: 'Podcast: Side Effects',
      summary:
        'Hosted and edited six episodes about unexpected consequences in tech and science.',
      slug: 'podcast-side-effects',
    },
    {
      title: 'Blender Basics',
      summary:
        'Completed a structured 3D modeling course and built five scenes from scratch.',
      slug: 'blender-basics',
    },
    {
      title: 'CTF Season',
      summary:
        'Competed in eight capture-the-flag competitions with a team, solving over 40 challenges.',
      slug: 'ctf-season',
    },
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
    updated_at: 'Updated',
    last_active_at: 'Last Active',
    online: 'Online',
    this_is_you: 'This is you',
    failed_to_fetch_data: 'Failed to fetch data!',
    admin_panel: 'Admin Panel',
    admin_projects: 'Projects',
    admin_projects_description: 'All projects managed on this site.',
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
    view_project: 'View on Site',
    unsaved_changes_confirm: 'You have unsaved changes. Leave anyway?',
    project_title: 'Project Title',
    project_title_hint:
      'One or a few words: the name of the product, completed game, attended event...',
    project_summary: 'Project Summary',
    project_summary_hint:
      'What is the project about? Describe it in one or a few sentences. The shorter, the better.',
    edit_event: 'Edit Event',
    edit: 'Edit',
    drafts: 'Drafts',
    save: 'Save',
    delete: 'Delete',
    asset_profile_hint_icon:
      'Recommended aspect ratio: <strong>1:1</strong>.<br/>Cropped to fit, up to <strong>256×256</strong>.',
    asset_profile_hint_banner:
      'Recommended aspect ratio: <strong>16:9</strong>.<br/>Cropped to fit, up to <strong>1200×675</strong>.',
    file_formats: 'Formats',
    file_max_size: 'Max size',
    file_any_format: 'any',
    file_formats_images: 'Images',
    file_formats_videos: 'Videos',
    file_formats_images_videos: 'Images + Videos',
    file_formats_any: 'Any file',
    project_slug: 'Project Slug',
    project_slug_hint: 'Unique ID for the project in the URL.',
    generate_random: 'Generate random',
    duplicate_slug: 'This slug is already taken! Choose another one.',
    project_access: 'Project Access',
    public: 'Public',
    link_only: 'Link-only',
    private: 'Private',
    public_hint: 'Anyone can view.',
    link_only_hint: 'Anyone with the link can view.',
    private_hint: 'Only you can view.',
    site_access_close_priority: 'Site closed! Only you will have access!',
    view_event: 'View on Site',
    saved: 'Saved!',
    important_project: 'Important Project?',
    important_project_hint:
      'This project stayed with you for a long time and/or strongly influenced your life.',
    important_project_label: 'Important project',
    cv_project: 'In Your CV?',
    cv_project_hint:
      'A potential employer would be interested to see this project.',
    cv_project_label: 'CV',
    project_files: 'Project Files',
    project_files_description: 'Icon, banner, showcase, and other files...',
    project_icon: 'Project Icon',
    project_icon_hint: 'Bright and memorable.',
    project_banner: 'Project Banner',
    project_banner_hint: 'Wide image for the project page.',
    delete_project: 'Delete Project',
    delete_project_confirm:
      'This action is irreversible. Enter the project title to confirm deletion:',
    size: 'Size',
    just_now: 'Just now',
    showcase: 'Showcase',
    showcase_description:
      'Images and videos that show what the project looks like.',
    showcase_add: 'Add to Showcase',
    showcase_details: 'Details',
    showcase_quality: 'Quality',
    showcase_quality_small: 'Small (640px)',
    showcase_quality_normal: 'Normal (1280px)',
    showcase_quality_high: 'High (1920px)',
    showcase_quality_as_uploaded: 'Original Size',
    showcase_caption: 'Caption',
    showcase_caption_hint: 'Optional description for this asset.',
    showcase_access_same_as_project: 'Same as project',
    showcase_access_private: 'Private (admin only)',
    showcase_confirm_add: 'Add',
    showcase_drop_hint: 'Drop an image or video here, or click to browse',
    showcase_upload_image: 'Upload Image',
    showcase_upload_video: 'Upload Video',
    other_files: 'Other Files',
    other_files_description: 'Arbitrary files for this project in any format.',
    other_add: 'Add File',
    other_details: 'File Details',
    other_title: 'Title',
    other_description: 'Description',
    other_quality_as_is: 'Original File',
    asset_quality_optimized: 'Optimized',
    asset_pick_upload: 'Upload',
    asset_replace: 'Replace',
    asset_upload_drop_hint: 'Drop or Browse file…',
    asset_upload_hashing: 'Calculating file hash…',
    asset_upload_checking: 'Checking for duplicate…',
    asset_upload_uploading: (percent: number) => `Uploading… ${percent}%`,
    asset_upload_processing: 'Processing…',
    asset_upload_failed: 'Upload failed',
    asset_upload_retry: 'Try again',
    drop_browse_paste: 'Drop • Browse • Paste',
    format: 'Format',
    max_size: 'Max size',
    image: 'Image',
    video: 'Video',
    audio: 'Audio',
    any_file: 'Any file',
    file_wrong_type: (ext) => `Unsupported file type: .${ext}`,
    file_too_large: (size) => `File is too large: ${size}`,
    only_site_owner_has_access_to_asset:
      'Only the site owner has access to this file!',
    direct_link_to_asset: 'Direct link to asset',
    asset: 'Asset',
    upload_variants: 'Upload Variants',
    pick_another_file: 'Pick another file',
    upload_without_changes: 'Upload without changes',
  },
});

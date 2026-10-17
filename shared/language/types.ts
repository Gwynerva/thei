import type { ContentHistoryReason } from '../content-history';
import type { RelationEntityType } from '../relation';
import type { ProofreadCategory, TidyCommentKind } from '../ai-revise';
import type { AiActionKind } from '../ai-actions';
import type { ContentFileSkip } from '../content-file-placement';

export const languagesInfo = {
  en: 'English',
  ru: 'Русский',
} as const satisfies Record<string, string>;

export const languageCodes = Object.keys(languagesInfo) as LanguageCode[];

export type LanguageCode = keyof typeof languagesInfo;

export type LanguageSizeUnits = {
  b: string;
  kb: string;
  mb: string;
  gb: string;
};

export interface I18nProjectSample {
  title: string;
  summary: string;
  slug: string;
}

export type I18nModuleSpec = {
  code: LanguageCode;
  normalize?: (text: string) => string;
  slugify?: (text: string) => string;
  sampleDisplayNames?: string[];
  sampleSecretPhrases?: string[];
  sampleProjects?: I18nProjectSample[];
  /** Codenames given to secret entities: "Secret project Gamma". */
  secretCodenames?: string[];
  /** One-line summaries shown on secrets in place of their real one. */
  secretSummaries?: string[];
  sizeUnits?: Partial<LanguageSizeUnits>;
  /**
   * The lowercase letters a lettered list counts in, in order: "а, б, в" in
   * Russian. A language that counts in Latin leaves it out.
   */
  listLetters?: string;
  phrases: Partial<LanguagePhrases>;
};

export type I18nBaseModule = I18nModuleSpec & {
  slugify: (text: string) => string;
  secretCodenames: string[];
  secretSummaries: string[];
  phrases: LanguagePhrases;
  sizeUnits: LanguageSizeUnits;
};

export type I18nController = {
  code: LanguageCode;
  normalize: (text: string) => string;
  slugify: (text: string) => string;
  sampleDisplayNames: string[];
  sampleSecretPhrases: string[];
  sampleProjects: I18nProjectSample[];
  secretCodenames: string[];
  secretSummaries: string[];
  sizeUnits: LanguageSizeUnits;
  listLetters?: string;
  phrase: LanguagePhrases;
};

export type EditorJsPhrases = {
  add: string;
  convert_to: string;
  tune: string;
  text: string;
  bold: string;
  italic: string;
  heading: string;
  subheading: string;
  list: string;
  checklist: string;
  quote: string;
  delimiter: string;
  file: string;
  enter_quote: string;
  enter_caption: string;
  align_left: string;
  align_center: string;
  unordered: string;
  ordered: string;
  start_with: string;
  counter_type: string;
  numeric: string;
  lower_roman: string;
  upper_roman: string;
  lower_alpha: string;
  upper_alpha: string;
  delete: string;
  click_to_delete: string;
  move_up: string;
  move_down: string;
};

export type LanguagePhrases = {
  asset_library: string;
  asset_library_search: string;
  asset_aspect_hint: (ratio: string, size: string) => string;
  asset_library_pending_deletion: (date: string) => string;
  asset_library_in_history: string;
  /** Unused, but kept while an AI action still needs it. */
  asset_library_held_by_ai: string;
  asset_library_empty: string;
  asset_library_unused: string;
  asset_library_unused_hint: string;
  /** Files used anywhere at all: no kind of entity singled out. */
  asset_library_anywhere: string;
  /** Leads the ways out of a narrowed search that found nothing. */
  asset_library_widen: string;
  asset_library_used: string;
  asset_library_more: string;
  asset_library_insert: string;
  asset_library_usage: string;
  asset_used_elsewhere: string;
  asset_library_properties: string;
  asset_library_settings: string;
  asset_recipe_original: string;
  asset_recipe_zip: string;
  asset_recipe_crop: (region: string, source: string) => string;
  asset_recipe_crop_region: (region: string) => string;
  asset_recipe_rotation: (degrees: number) => string;
  asset_recipe_stretched: string;
  asset_recipe_quality: (quality: number) => string;
  asset_recipe_quality_level: (level: string) => string;
  asset_recipe_lossless: string;
  asset_recipe_no_audio: string;
  asset_recipe_fast: string;
  asset_recipe_bitrate: (kbps: number) => string;
  asset_recipe_mono: string;
  // Quality levels
  asset_quality_minimal: string;
  asset_quality_low: string;
  asset_quality_medium: string;
  asset_quality_high: string;
  asset_quality_maximum: string;
  asset_quality_lossless: string;
  asset_library_description: string;
  /** A file's own description («Описание файла»): its field and its public block. */
  asset_description: string;
  asset_description_hint: string;
  asset_description_placeholder: string;
  asset_description_global: string;
  asset_description_global_hint: string;
  asset_description_why: string;
  asset_detach_hint: string;
  asset_here: string;
  asset_library_other_variants: string;
  asset_library_unused_line: string;
  asset_library_history_line: string;
  asset_library_held_by_ai_line: string;
  asset_open_place: (title: string) => string;
  asset_open_variant: string;
  asset_description_save: string;
  asset_description_saved: string;
  asset_description_conflict: string;
  asset_description_too_long: (max: number) => string;
  asset_description_error: string;
  asset_hash_check: string;
  asset_hash_error: string;
  asset_selection_type: string;
  asset_selection_size: string;
  asset_library_retry: string;
  asset_library_selection_failed: string;
  asset_library_missing: string;
  asset_role_favicon: string;
  asset_role_icon: string;
  asset_role_banner: string;
  asset_role_content: string;
  asset_role_project_description: string;
  asset_role_event_description: string;
  asset_role_page_content: string;
  asset_role_profile_about: string;
  asset_role_showcase: string;
  asset_role_other: string;
  asset_role_preview: string;
  asset_role_action_icon: string;
  asset_role_action_background: string;
  asset_role_action_file: string;
  asset_role_ai_attachment: string;
  asset_role_avatar: string;
  asset_role_status: string;
  asset_source_profile: string;
  asset_source_ai_session: string;
  site_settings: string;
  about_me: string;
  profile_name: string;
  profile_slogan: string;
  profile_detailed_description: string;
  profile_avatar: string;
  profile_avatar_hint: string;
  profile_banner: string;
  profile_banner_hint: string;
  profile_favicon: string;
  profile_favicon_hint: string;
  profile_status: string;
  profile_statuses: string;
  profile_status_hint: string;
  project_status: string;
  project_statuses: string;
  project_tabs: string;
  project_tab_overview: string;
  project_tab_timeline: string;
  project_timeline_seo_description: (title: string) => string;
  project_status_hint: string;
  project_new_status: string;
  project_status_empty: string;
  profile_facts: string;
  profile_facts_hint: string;
  profile_custom_facts: string;
  profile_nickname: string;
  profile_birth_date: string;
  profile_field: string;
  profile_value: string;
  profile_pinned_pages: string;
  profile_pinned_pages_hint: string;
  profile_links: string;
  profile_links_hint: string;
  profile_popular_tags: string;
  profile_show_all: string;
  profile_hide: string;
  profile_pinned_page_add: string;
  profile_empty: string;
  profile_load_error: string;
  profile_new_avatar: string;
  profile_avatar_history: string;
  profile_best_projects: string;
  profile_new_status: string;
  profile_new_project_status: string;
  profile_new_life_status: string;
  profile_edit_status: string;
  profile_status_placeholder: string;
  profile_status_icon: string;
  profile_status_date: string;
  profile_empty_status: string;
  profile_password_hint: string;
  profile_password_mismatch: string;
  profile_settings_description: string;
  profile_about_description: string;
  profile_personal_hint: string;
  profile_avatar_count: (count: number) => string;
  profile_age: (age: number) => string;
  profile_reorder: string;
  profile_more: string;
  language_name: string;
  life: string;
  life_activity: string;
  life_activity_actions: (count: number) => string;
  life_activity_empty: string;
  life_activity_loading: string;
  life_activity_close: string;
  life_activity_events: (count: number) => string;
  life_activity_projects: (count: number) => string;
  life_activity_pages: (count: number) => string;
  life_activity_sections: (count: number) => string;
  life_activity_profile: (count: number) => string;
  life_activity_statuses: (count: number) => string;
  life_activity_secret: (count: number) => string;
  life_activity_diary: (count: number) => string;
  projects: string;
  events: string;
  pages: string;
  tags: string;
  settings: string;
  public_view_mode: string;
  public_view_admin: string;
  public_view_admin_hint: string;
  public_view_guest: string;
  public_view_guest_hint: string;
  public_navigation: string;
  public_sign_in: string;
  public_sign_in_hint: string;
  activity_summary: string;
  life_rewind: (day: string) => string;
  life_rewind_seo_title: string;
  life_rewind_description: string;
  life_rewind_empty: string;
  life_rewind_empty_description: string;
  life_rewind_explore_life: string;
  event_ongoing: string;
  event_was_ongoing: string;
  period_until: (date: string) => string;
  period_state_ongoing: string;
  period_state_upcoming: string;
  public_timeline_ongoing_until: (date: string) => string;
  view_all: string;
  life_empty: string;
  event_started: string;
  event_ended: string;
  event_occurred: string;
  project_created: string;
  page_created: string;
  section_created: string;
  section_started: string;
  section_ended: string;
  section_occurred: string;
  section_ongoing: string;
  section_was_ongoing: string;
  diary_written: string;
  secret_event: (codename: string) => string;
  secret_project: (codename: string) => string;
  secret_page: (codename: string) => string;
  secret_diary_entry: (codename: string) => string;
  secret_section: (codename: string) => string;
  secret_media: (codename: string) => string;
  secret_file: (codename: string) => string;
  secret_hint: string;
  life_gap: (years: number, months: number, days: number) => string;
  life_copy_link: string;
  life_filter: string;
  life_filter_all: string;
  life_filter_kind: (kind: string) => string;
  public_timeline_from: (date: string) => string;
  public_timeline_until: (date: string) => string;
  public_timeline_duration: (
    years: number,
    months: number,
    days: number,
  ) => string;
  public_life_description: string;
  home: string;
  llms_txt_intro: string;
  llms_txt_sections: string;
  llms_txt_home: string;
  llms_txt_life: string;
  llms_txt_diary: string;
  llms_txt_tags: string;
  llms_txt_pages: string;
  llms_txt_sitemap: string;
  llms_txt_markdown_title: string;
  llms_txt_markdown: string;
  public_life_period_description: (period: string, siteName: string) => string;
  public_pages_description: string;
  public_tags_description: string;
  public_tag_description: (title: string) => string;
  search: string;
  public_search_description: string;
  public_search_query_title: (query: string) => string;
  public_search_query_description: (query: string) => string;
  search_placeholder: string;
  search_clear: string;
  search_filters: string;
  search_filter_type: string;
  search_type_all: string;
  search_filter_projects: string;
  search_tags_filter_placeholder: string;
  search_tags_active: string;
  search_tags_none: string;
  search_tag_include: (tag: string) => string;
  search_tag_exclude: (tag: string) => string;
  search_tag_remove: (tag: string) => string;
  search_reset_filters: string;
  search_results_count: (projects: number, events: number) => string;
  search_empty: string;
  search_empty_description: string;
  forbidden_title: string;
  forbidden_description: string;
  not_found_title: string;
  not_found_description: string;
  error_title: string;
  error_description: string;
  back_home: string;
  open_life: string;
  pagination: string;
  previous: string;
  next: string;
  public_details_expand: string;
  content_integration_youtube: string;
  public_details_links: string;
  public_details_files: string;
  public_details_overview: string;
  public_details_contents: string;
  public_project_description: string;
  public_details_neighbour_sections: string;
  public_details_neighbour_entries: string;
  public_neighbour_next: string;
  public_neighbour_previous: string;
  public_details_chronology: string;
  public_details_timeline: string;
  project_chronology_page: string;
  project_chronology_updated: string;
  page_chronology_created: string;
  page_chronology_updated: string;
  section_chronology_created: string;
  section_chronology_updated: string;
  event_chronology_created: string;
  event_chronology_updated: string;
  diary_chronology_created: string;
  diary_chronology_updated: string;
  install_thei: string;
  visuals: string;
  visuals_description: string;
  theme: string;
  theme_system: string;
  theme_light: string;
  theme_dark: string;
  accent_color: string;
  font_style: string;
  font_sans: string;
  font_serif: string;
  global_settings: string;
  global_settings_description: string;
  ui_language: string;
  ui_language_hint: string;
  site_access: string;
  site_access_open: string;
  site_access_closed: string;
  site_access_open_hint: string;
  site_access_closed_hint: string;
  site_access_open_description: string;
  site_access_closed_description: string;
  site_url: string;
  site_url_hint: string;
  site_url_invalid: string;
  site_url_rebuild_pending: (base: string) => string;
  site_url_robots_title: string;
  site_url_robots_hint: string;
  analytics: string;
  analytics_description: string;
  analytics_invalid: string;
  analytics_google_tag: string;
  analytics_google_tag_hint: string;
  analytics_google_verification: string;
  analytics_google_verification_hint: string;
  analytics_yandex_metrika: string;
  analytics_yandex_metrika_hint: string;
  analytics_yandex_verification: string;
  analytics_yandex_verification_hint: string;
  admin_data: string;
  admin_data_description: string;
  how_to_address_you: string;
  display_name_hint: (name: string) => string;
  secret_phrase: string;
  secret_phrase_hint: string;
  password: string;
  repeat_password: string;
  install: string;
  installing: string;
  this_field_must_be_filled: string;
  administrator: string;
  thei_admin_panel_sign_in: string;
  sign_in: string;
  sign_out: string;
  signing_in: string;
  invalid_secret_phrase_or_password: string;
  sign_in_too_many_attempts: string;
  sign_in_link: string;
  sign_in_link_description: string;
  sign_in_link_renew: string;
  sign_in_link_invalid: string;
  sign_in_link_too_many: string;
  sign_in_link_expires: (time: string) => string;
  sign_in_link_confirm: string;
  sign_in_link_copy: string;
  sign_in_link_copy_qr: string;
  sign_in_link_qr: string;
  copy: string;
  copied: string;
  /** Words quoted as the language quotes them: “words”, «слова». */
  quoted: (text: string) => string;
  share_links: string;
  share_links_description: string;
  share_link_create: string;
  share_link_label: string;
  share_link_label_placeholder: string;
  share_link_unlabeled: string;
  share_link_duration: string;
  share_link_extend: string;
  share_link_extend_by: string;
  share_link_empty: string;
  /** "Closes in 5 h 12 min", from whole hours and minutes. */
  share_link_closes_in: (hours: number, minutes: number) => string;
  share_link_expired: string;
  share_link_too_many: string;
  share_link_private_site: string;
  share_banner_whole: string;
  share_banner_part: string;
  share_banner_ended: string;
  share_link_duration_30m: string;
  share_link_duration_1h: string;
  share_link_duration_6h: string;
  share_link_duration_24h: string;
  admin_sessions: string;
  admin_sessions_description: string;
  active_admin_sessions: string;
  active_admin_sessions_description: string;
  destroyed_admin_sessions: string;
  destroyed_admin_sessions_description: string;
  destroy_session: string;
  show_x_destroyed_sessions: (count: number) => string;
  session_details: string;
  created_at: string;
  updated_at: string;
  last_active_at: string;
  online: string;
  this_is_you: string;
  failed_to_fetch_data: string;
  admin_panel: string;
  admin_projects: string;
  admin_events: string;
  admin_diary: string;
  admin_diary_description: string;
  admin_kind_project_title: string;
  admin_kind_project_what: string;
  admin_kind_project_rank: string;
  admin_kind_project_examples: string;
  admin_kind_event_title: string;
  admin_kind_event_what: string;
  admin_kind_event_rank: string;
  admin_kind_event_examples: string;
  admin_kind_diary_title: string;
  admin_kind_diary_what: string;
  admin_kind_diary_rank: string;
  admin_kind_diary_examples: string;
  admin_pages: string;
  admin_pages_description: string;
  to_admin_panel: string;
  to_website: string;
  project: string;
  x_projects: (count: number) => string;
  event: string;
  x_events: (count: number) => string;
  /** A section of a project, named by its kind alone, as on a life card. */
  section: string;
  page: string;
  new_project: string;
  new_event: string;
  new_page: string;
  new_diary_entry: string;
  diary_entry: string;
  diary: string;
  x_diary_entries: (count: number) => string;
  site_status: string;
  site_version: string;
  update_available: (version: string) => string;
  update_available_hint: string;
  disk_usage: string;
  disk_thei_files: string;
  disk_other_files: string;
  disk_free_space: string;
  disk_free_short: (size: string) => string;
  disk_thei_short: (size: string) => string;
  backups: string;
  backups_description: string;
  backup_last: string;
  backup_never: string;
  backup_stale_short: string;
  backup_stale_warning: string;
  backup_kind_auto: string;
  backup_kind_manual: string;
  backup_token: string;
  backup_token_hint: string;
  backup_token_generate: string;
  backup_token_regenerate: string;
  backup_token_revoke: string;
  backup_token_missing: string;
  backup_token_active: string;
  backup_token_shown_once: string;
  backup_script_windows: string;
  backup_script_unix: string;
  backup_setup_hint: string;
  backup_history: string;
  backup_run_summary: (files: number, size: string) => string;
  ai_access_on_hint: string;
  ai_access_off_hint: string;
  api_token_create: string;
  api_token_label: string;
  api_token_label_placeholder: string;
  api_token_label_required: string;
  api_token_access: string;
  api_token_preset_reader: string;
  api_token_preset_reader_hint: string;
  api_token_preset_editor: string;
  api_token_preset_editor_hint: string;
  api_token_preset_custom: string;
  api_token_empty: string;
  api_token_never_used: string;
  api_token_last_used: string;
  api_token_revoke: string;
  api_token_too_many: string;
  api_token_shown_once: string;
  api_token_endpoint: string;
  api_token_connect_hint: string;
  ai_page: string;
  ai_page_description: string;
  ai_tab_connection: string;
  ai_switch: string;
  ai_welcome: string;
  ai_ways_facts: Record<'what' | 'how' | 'pays' | 'rights', string>;
  ai_ways_cards: Record<
    'app' | 'model',
    Record<'title' | 'what' | 'how' | 'pays' | 'rights', string>
  >;
  api_tokens_title: string;
  api_tokens_hint: string;
  ai_connect_title: string;
  ai_connect_apps: Record<
    'claude' | 'chatgpt' | 'claude-code' | 'other',
    string
  >;
  ai_connect_steps: Record<
    'claude' | 'chatgpt' | 'claude-code' | 'other',
    string[]
  >;
  ai_connect_no_sign_in: string;
  ai_connect_proxy: string;
  api_token_signed_in: (client: string) => string;
  api_token_signed_in_verified: (client: string, host: string) => string;
  api_token_signed_in_unverified: (client: string) => string;
  oauth_consent: string;
  oauth_consent_title: (client: string, site: string) => string;
  oauth_verified: (host: string) => string;
  oauth_unverified: string;
  oauth_redirect_web: (host: string) => string;
  oauth_redirect_elsewhere: (host: string) => string;
  oauth_redirect_loopback: (port: string) => string;
  oauth_redirect_app: (scheme: string) => string;
  oauth_connections: (count: number) => string;
  oauth_rights: string;
  oauth_requested_edit: string;
  oauth_allow: string;
  oauth_deny: string;
  oauth_sign_in_needed: string;
  oauth_gone: string;
  oauth_returning: string;
  oauth_refused_title: string;
  oauth_refused: Record<
    'client' | 'client_document' | 'redirect_uri' | 'request',
    string
  >;
  oauth_restart: string;
  api_token_history: string;
  api_token_history_empty: string;
  ai_settings_link: string;
  ai_open_page: string;
  ai_instructions_placeholder: string;
  ai_check: string;
  ai_check_enabled_ok: string;
  ai_check_handshake_ok: (version: string) => string;
  ai_check_handshake_fail: string;
  ai_check_tools_ok: (count: number) => string;
  ai_check_tools_fail: string;
  ai_check_read_ok: (projects: number, events: number, diary: number) => string;
  ai_check_read_fail: string;
  ai_check_public_ok: string;
  ai_check_public_fail: (status: number) => string;
  ai_check_public_warn: string;
  ai_check_https_ok: string;
  ai_check_https_warn: string;
  ai_check_https_skip: string;
  ai_check_signin_ok: string;
  ai_check_signin_fail: (where: string) => string;
  ai_check_signin_https: string;
  ai_check_clients_ok: (label: string, client: string) => string;
  ai_check_clients_warn: string;
  entity_changed_since: string;
  api_token_revoke_confirm: (label: string) => string;
  api_token_last_client: (client: string) => string;
  admin_updates: string;
  updates_description: string;
  update_current_version: string;
  update_latest_version: string;
  update_check: string;
  update_checking: string;
  update_check_failed: string;
  update_up_to_date: string;
  update_available_x: (version: string) => string;
  update_start: string;
  update_confirm: (version: string) => string;
  update_backup_notice: string;
  update_last_backup: string;
  update_no_backup: string;
  update_in_progress: string;
  update_status_running: string;
  update_status_restarting: string;
  update_status_done: string;
  update_status_failed: string;
  update_steps: string;
  update_step_phase: string;
  update_step_migration: string;
  update_step_task: string;
  update_done_x: (version: string) => string;
  update_log: string;
  update_failed_hint: string;
  update_restart: string;
  update_restart_confirm: string;
  update_restart_pending: string;
  update_restarted: string;
  update_title_x: (version: string) => string;
  update_site_closed: string;
  update_waiting: string;
  update_unavailable_title: string;
  update_unavailable_note: string;
  update_continue: string;
  update_close: string;
  update_failed_title: string;
  update_retry: string;
  update_retry_hint: string;
  update_unmanaged: string;
  update_unmanaged_hint: string;
  update_never_checked: string;
  boot_update_title: string;
  boot_update_migration_failed: string;
  boot_update_downgrade: string;
  boot_update_task_failed: string;
  boot_update_error: string;
  boot_update_hint: string;
  admin_entity_search_placeholder: string;
  sort_order: string;
  sort_newest: string;
  sort_oldest: string;
  no_projects: string;
  no_events: string;
  no_pages: string;
  admin_search_no_results: string;
  admin_search_no_results_description: string;
  reset_search: string;
  admin_projects_empty_description: string;
  admin_events_empty_description: string;
  admin_pages_empty_description: string;
  no_diary_entries: string;
  admin_diary_empty_description: string;
  admin_tags_empty_description: string;
  admin_assets_empty: string;
  admin_assets_empty_description: string;
  public_tags_empty: string;
  public_tags_empty_description: string;
  public_pages_empty_description: string;
  life_empty_description: string;
  feed_empty: string;
  feed_empty_description: string;
  feed_empty_filtered: string;
  feed_empty_filtered_description: string;
  page_of: (page: number, pageCount: number) => string;
  admin_tags: string;
  tag: string;
  tags_description: string;
  new_tag: string;
  edit_tag: string;
  tag_title: string;
  tag_title_hint: string;
  tag_slug: string;
  tag_description: string;
  tag_description_hint: string;
  tag_icon: string;
  tag_icon_hint: string;
  tag_link_example: (slug: string, publicId: string) => string;
  project_tags: string;
  project_tags_hint: string;
  recommended_tags: string;
  tag_search_placeholder: string;
  create_tag_named: (title: string) => string;
  tag_usage: string;
  tag_usage_summary: (projects: number, events: number) => string;
  tag_delete_hint: string;
  tag_usage_sentence: (projects: number, events: number) => string;
  delete_tag: string;
  tag_delete_usage_warning: (projects: number, events: number) => string;
  tag_empty_list: string;
  tag_search_results: string;
  tag_search_loading: string;
  tag_search_no_results: string;
  tag_search_error: string;
  tag_recommendations_error: string;
  tag_recommendation_add: (title: string) => string;
  tag_reason_text: string;
  tag_reason_similar: string;
  tag_reason_related: string;
  tag_reason_together: string;
  tag_candidates: string;
  tag_candidates_hint: string;
  tag_candidates_empty: string;
  tag_candidates_error: string;
  tag_candidate_add: string;
  tag_candidate_added: string;
  tag_title_taken: string;
  tag_title_is_synonym: (tag: string) => string;
  tag_synonym_taken: (synonym: string, tag: string) => string;
  synonyms: string;
  synonyms_hint: string;
  synonyms_placeholder: string;
  synonyms_limit: (limit: number) => string;
  synonym_remove: (synonym: string) => string;
  synonym_suggestion_add: (word: string) => string;
  tag_synonyms_hint: string;
  tag_synonym_suggestions: string;
  tag_synonym_found_in: string;
  tag_synonym_already_added: (synonym: string, tag: string) => string;
  tag_slug_taken: string;
  tag_public_id_taken: string;
  tag_icon_not_found: string;
  create: string;
  edit_project: string;
  view_project: string;
  unsaved_changes_confirm: string;
  unsaved_modal_confirm: string;
  project_title: string;
  project_title_hint: string;
  project_summary: string;
  project_summary_hint: string;
  project_description: string;
  project_action: string;
  project_action_hint: string;
  project_action_enabled: string;
  project_action_disabled_hint: string;
  project_action_private: string;
  project_action_private_hint: string;
  project_action_preview: string;
  project_action_placeholder: string;
  project_action_group_action: string;
  project_action_group_look: string;
  project_action_text: string;
  project_action_type: string;
  project_action_link: string;
  project_action_file_type: string;
  project_action_file: string;
  project_action_link_url: string;
  project_action_target_file: string;
  project_action_file_select: string;
  project_action_file_select_hint: string;
  project_action_file_edit: string;
  project_action_file_edit_hint: string;
  project_action_icon: string;
  project_action_icon_default: string;
  project_action_icon_site: string;
  project_action_icon_custom: string;
  project_action_icon_custom_hint: string;
  project_action_icon_select: string;
  project_action_icon_edit: string;
  project_action_background: string;
  project_action_background_standard: string;
  project_action_background_standard_hint: string;
  project_action_background_auto: string;
  project_action_background_auto_hint: string;
  project_action_background_accent: string;
  project_action_background_accent_hint: string;
  project_action_background_image_hint: string;
  project_action_accent_color: string;
  project_action_background_select: string;
  project_action_background_edit: string;
  project_action_background_size: string;
  project_action_background_size_natural: string;
  project_action_background_size_contain: string;
  project_action_background_size_cover: string;
  project_action_background_size_stretch: string;
  project_action_background_repeat: string;
  project_action_background_repeat_none: string;
  project_action_background_repeat_x: string;
  project_action_background_repeat_y: string;
  project_action_background_repeat_both: string;
  project_action_issues: string;
  project_action_issue_text: string;
  project_action_issue_text_length: (max: number) => string;
  project_action_issue_url: string;
  project_action_issue_file: string;
  project_action_issue_icon: string;
  project_action_issue_background: string;
  project_action_issue_color: string;
  project_content_sections: string;
  project_content_sections_hint: string;
  project_sections_dated: string;
  project_sections_undated: string;
  related_entities: string;
  related_entities_hint: string;
  related_entity_add: string;
  relation_direction: string;
  /** What the other end is to this entity, in one word under its name. */
  relation_label_related: string;
  relation_label_influencing: string;
  relation_label_dependent: string;
  relation_popup_related: (current: string, other: string) => string;
  relation_popup_depends_on: (current: string, other: string) => string;
  relation_popup_affects: (current: string, other: string) => string;
  relations_empty_of: (kind: RelationEntityType) => string;
  project_sections_empty_of: (group: 'undated' | 'dated') => string;
  relation: string;
  relation_entity: string;
  relation_entity_choose: string;
  relation_edit: (title: string) => string;
  relation_note: string;
  relation_note_placeholder: string;
  relation_note_shared_hint: string;
  relation_note_split: string;
  relation_note_split_hint: string;
  /** Labels a side's note; that side's picture and name follow it. */
  relation_note_on_page: string;
  delete_relation: string;
  recommended_relations: string;
  relation_recommendation_add: (title: string) => string;
  relation_recommendation_reason: string;
  project_external_links: string;
  project_external_links_hint: string;
  add_external_link: string;
  external_link_url: string;
  external_link_name: string;
  external_link_loading: string;
  external_link_error: string;
  external_link_fallback: string;
  external_link_archived: string;
  external_link_duplicate: string;
  external_link_in_project_description: string;
  external_link_in_event_content: string;
  external_link_private: string;
  project_external_links_empty: string;
  refresh_external_link: string;
  search_entity_placeholder: string;
  search_entity_no_results: string;
  search_entity_error: string;
  content_section: string;
  content_section_delete_entity: string;
  section_periods: string;
  section_needs_body_or_period: string;
  section_undated_hint: string;
  public_section_dates_only: string;
  public_section_dates_only_description: string;
  public_section_content_empty: string;
  public_section_content_empty_description: string;
  content_section_title: string;
  content_section_summary: string;
  content_section_banner: string;
  content_section_banner_hint: string;
  content_section_private: string;
  content_section_private_hint: string;
  content_section_content: string;
  content_section_add: string;
  content_section_sort: string;
  delete_content_section: string;
  content_empty: string;
  content_text_empty: string;
  edit_content: (title: string) => string;
  content_block_count: (count: number) => string;
  content_word_count: (count: number) => string;
  content_file_count: (count: number) => string;
  content_file_with_extension: (extension?: string) => string;
  content_editor_placeholder: string;
  content_editor_save_error: string;
  content_editor_title: string;
  content_never_saved: string;
  content_history: string;
  content_history_empty: string;
  content_history_unavailable: string;
  content_history_load_error: string;
  content_history_opened_version: string;
  content_history_reasons: Record<ContentHistoryReason, string>;
  content_history_row_label: (time: string, changes: string) => string;
  content_history_delta: (value: string, delta: number) => string;
  content_history_missing_assets: (count: number) => string;
  content_restore_same: string;
  /** What the last change taken into the editor was, for its undo. */
  content_taken_from: (label: string) => string;
  content_restore_undo: string;
  content_draft_dismiss: string;
  content_draft_status_offline_short: string;
  content_draft_offline_hint: string;
  content_draft_notice: (time: string) => string;
  content_draft_notice_hint: string;
  content_draft_compare: string;
  content_stored_notice: (time: string) => string;
  content_stored_notice_hint: string;
  content_history_keeps: string;
  content_draft_status_synced: (time: string) => string;
  content_draft_status_offline: string;
  content_draft_status_refused_short: string;
  content_draft_status_refused: string;
  content_field_unsaved_draft: (time: string) => string;
  sign_out_unsynced_confirm: (count: number) => string;
  content_external_link: string;
  content_link_loading: string;
  content_link_broken_title: string;
  content_link_broken_description: string;
  content_link_remove: string;
  content_private_section: string;
  content_private_section_start: string;
  content_private_section_end: string;
  content_editor_i18n: EditorJsPhrases;
  content_asset_pick_error: string;
  content_media_pending_confirm: string;
  content_choose_media: string;
  content_gallery_tile: string;
  content_add_media: string;
  content_choose_file: string;
  content_choose_audio: string;
  content_show_as_player: string;
  content_show_as_file: string;
  content_show_as_picture: string;
  content_choose_entity: string;
  content_make_gallery: string;
  content_make_file_group: string;
  content_file_group_title: string;
  content_gallery_title: string;
  content_add_files: string;
  content_remove_file: string;
  content_move_file: string;
  content_upload_as_file: string;
  /** A file brought into a text that the site cannot store, and why. */
  content_file_skipped: (name: string, reason: ContentFileSkip) => string;
  /** Names the place inside the target a link leads to, its `#…`. */
  content_link_fragment: string;
  content_link_fragment_remove: string;
  content_caption: string;
  content_media_centered: string;
  content_media_natural: string;
  content_media_stretch: string;
  content_title: string;
  content_description: string;
  edit_event: string;
  edit_diary_entry: string;
  edit_content_section: string;
  diary_access: string;
  diary_date: string;
  diary_content: string;
  diary_content_hint: string;
  diary_date_already_taken: string;
  diary_date_taken_open: string;
  diary_seo_title: string;
  diary_seo_description: string;
  diary_entry_seo_description: (date: string) => string;
  diary_delete_confirm: string;
  edit_page: string;
  edit: string;
  save: string;
  add: string;
  clear: string;
  delete: string;
  close_modal: string;
  modal_waiting: string;
  done: string;
  asset_pick_title: string;
  asset_pick_upload: string;
  asset_pick_reuse: string;
  asset_pick_reuse_hint: string;
  public_link: (entityName: string) => string;
  human_readable_url: string;
  public_id: string;
  project_link_example: (slug: string, publicId: string) => string;
  event_link_example: (slug: string, publicId: string) => string;
  public_id_already_taken: string;
  disable_url_synchronization: string;
  enable_url_synchronization: string;
  generate_random: string;
  project_access: string;
  public: string;
  public_hint: string;
  link_only: string;
  link_only_hint: string;
  private: string;
  private_hint: string;
  site_access_close_priority: string;
  view_event: string;
  view_page: string;
  view_content_section: string;
  view_tag: string;
  saved: string;
  showcase_project: string;
  showcase_project_hint: string;
  showcase_project_label: string;
  cv_project: string;
  cv_project_hint: string;
  cv_project_label: string;
  project_showcase_badge: string;
  project_showcase_badge_hint: string;
  project_cv_badge_hint: string;
  project_files: string;
  project_files_description: string;
  event_title: string;
  event_title_hint: string;
  event_summary: string;
  event_summary_hint: string;
  event_access: string;
  event_periods: string;
  event_periods_hint: string;
  event_periods_empty: string;
  event_content: string;
  event_content_hint: string;
  page_title: string;
  page_title_hint: string;
  page_summary: string;
  page_summary_hint: string;
  page_access: string;
  page_content: string;
  page_content_hint: string;
  page_icon: string;
  page_icon_hint: string;
  page_slug: string;
  page_slug_hint: string;
  page_link_example: (slug: string) => string;
  page_slug_invalid: string;
  page_slug_already_taken: string;
  delete_page: string;
  event_files: string;
  event_files_description: string;
  event_banner: string;
  event_banner_hint: string;
  event_action: string;
  event_action_hint: string;
  event_external_links: string;
  event_external_links_hint: string;
  event_external_links_empty: string;
  event_tags: string;
  event_tags_hint: string;
  delete_event: string;
  project_icon: string;
  project_icon_hint: string;
  project_banner: string;
  project_banner_hint: string;
  delete_project: string;
  delete_confirmation_description: (
    entityType: string,
    entityName: string,
  ) => string;
  delete_confirmation_confirm: string;
  size: string;
  just_now: string;
  showcase: string;
  showcase_file: string;
  showcase_description: string;
  showcase_add: string;
  showcase_details: string;
  asset_private_access: string;
  asset_private_access_hint: string;
  other_files: string;
  project_file: string;
  other_files_description: string;
  other_add: string;
  other_details: string;
  other_description: string;
  asset_replace: string;
  asset_upload_retry: string;
  drop_browse_paste: string;
  format: string;
  max_size: string;
  image: string;
  video: string;
  audio: string;
  any_file: string;
  file_wrong_type: (ext: string) => string;
  file_too_large: (size: string) => string;
  direct_link_to_asset: string;
  download_asset: string;
  file_preview_shown_part: (shown: string, total: string) => string;
  file_preview_rows_shown: (count: number) => string;
  file_preview_too_large: string;
  file_preview_failed: string;
  file_preview_no_pdf: string;
  file_preview_page: string;
  archive_summary: (files: number, size: string) => string;
  archive_packed: (size: string) => string;
  archive_more: (count: number) => string;
  archive_partial: string;
  archive_back: string;
  archive_root: string;
  archive_name: string;
  archive_size: string;
  archive_files: (count: number) => string;
  archive_levels: string;
  archive_entry_download: string;
  archive_entry_nested: string;
  asset_zoom: string;
  archive_entry_locked: string;
  archive_entry_unavailable: string;
  archive_entry_too_large: (size: string) => string;
  asset_previous: string;
  asset_next: string;
  asset_pager: (position: number, count: number) => string;
  asset: string;
  upload_how: string;
  upload_as_is: string;
  upload_saved_variant: string;
  upload_saved_count: (count: number) => string;
  upload_new_variant: string;
  upload_new_variant_hint: string;
  upload_new_audio_hint: string;
  upload_new_zip_hint: string;
  upload_other_file_hint: string;
  upload_next: string;
  upload_back: string;
  upload_skip_description: string;
  upload_replace_with_new_file: string;
  upload_section_family: string;
  upload_section_zip: string;
  upload_apply_settings: string;
  upload_processing: string;
  upload_queued: string;
  upload_finishing: string;
  upload_cancel: string;
  upload_dismiss: string;
  upload_pending_leave_confirm: string;
  upload_error_job_lost: string;
  upload_quality: string;
  upload_audio: string;
  upload_audio_none: string;
  upload_fast_conversion: string;
  upload_fast_conversion_hint: string;
  upload_compress_to_zip: string;
  upload_compress_to_zip_hint: string;
  upload_compare_divider: string;
  upload_compare_toggle_mode: string;
  upload_variant_unchanged: string;
  upload_source_no_audio: string;
  video_play: string;
  video_pause: string;
  video_seek: string;
  video_mute: string;
  video_unmute: string;
  video_volume: string;
  video_no_audio: string;
  audio_position: (current: string, total: string) => string;
  audio_speed: (rate: string) => string;
  audio_download: string;
  audio_unsupported: string;
  audio_channel_count: (count: number) => string;
  upload_audio_mono: string;
  upload_audio_mono_hint: string;
  upload_audio_source_mono: string;
  asset_variant_current: string;
  asset_variant_current_tag: string;
  asset_variant_usage_count: (count: number) => string;
  upload_error_load_variants: string;
  upload_error_apply: string;
  upload_error_invalid_response: string;
  upload_error_network: string;
  upload_error_cancelled: string;
  upload_error_request_failed: (status: number) => string;
  upload_crop: string;
  upload_crop_area: string;
  upload_crop_handle: string;
  upload_crop_free: string;
  upload_crop_source: string;
  upload_reset: string;
  upload_rotation: string;
  upload_rotate: string;
  upload_crop_hint: string;
  upload_resize: string;
  upload_resize_linked: string;
  upload_resize_width: string;
  upload_resize_height: string;
  upload_format: string;
  upload_format_auto: string;
  upload_format_lossless: string;
  upload_format_picked: (format: string, reason: string) => string;
  upload_format_reason_smallest: string;
  upload_format_avif_no_lossless: string;
  upload_result: string;
  upload_result_pending: string;
  upload_result_failed: string;
  upload_result_of_source: (percent: string) => string;
  upload_preview_compare: string;
  upload_processing_source: string;
  upload_processing_source_lossy: string;
  upload_staging: (percent: number) => string;
  file_info_extension: string;
  file_info_size: string;
  file_info_dimensions: string;
  file_info_duration: string;
  file_info_channels: string;
  file_info_bitrate: string;
  file_info_empty: string;
  file_info_archived_extension: string;
  file_info_archived_size: string;
  // Date certainty
  date_precision: string;
  date_precision_exact: string;
  date_precision_day: string;
  date_precision_month: string;
  date_precision_year: string;
  date_precision_exact_short: string;
  date_precision_day_short: string;
  date_precision_month_short: string;
  date_precision_year_short: string;
  date_precision_note: string;
  period_label: string;
  period_label_placeholder: string;
  period_dates_edit: string;
  // Private notes and reminders
  entity_notes_section: string;
  entity_notes_section_description: string;
  entity_reminder: string;
  entity_reminder_hint: string;
  entity_reminder_placeholder: string;
  entity_notes: string;
  entity_notes_hint: string;
  entity_notes_show_all: string;
  entity_reminder_badge: string;
  content_strikethrough: string;
  content_hint: string;
  content_hint_placeholder: string;
  content_hint_remove: string;
  content_spoiler: string;
  content_spoiler_reveal: string;
  content_link_note: string;
  content_link_note_placeholder: string;
  public_details_show_all: (count: number) => string;
  view_all_short: string;
  powered_by_thei: string;
  search_preset_all_title: string;
  search_preset_all_description: string;
  search_preset_projects_title: string;
  search_preset_projects_description: string;
  search_preset_events_title: string;
  search_preset_events_description: string;
  search_preset_showcase_title: string;
  search_preset_showcase_description: string;
  search_preset_cv_title: string;
  search_preset_cv_description: string;
  og_personal_archive: string;
  og_section_position: (index: number, total: number) => string;
  og_updated: (date: string) => string;
  og_life_headline: (years: number) => string;
  og_tags_headline: (count: number) => string;
  og_pages_headline: (count: number) => string;
  og_image_alt: (kind: string, title: string, site: string) => string;
  ai_tab_sessions: string;
  ai_tab_memory: string;
  ai_tab_templates: string;
  ai_templates_title: string;
  ai_templates_hint: string;
  ai_templates_column_template: string;
  ai_templates_column_last: string;
  ai_templates_builtin_section: string;
  ai_templates_own_section: string;
  ai_templates_own_empty: string;
  ai_templates_new: string;
  ai_templates_presets: string;
  ai_template_open: string;
  ai_open_full: string;
  select_filter: string;
  content_link: string;
  content_link_search_placeholder: string;
  content_link_mention_placeholder: string;
  content_link_search: string;
  content_link_path: string;
  content_link_place: string;
  content_link_whole: (
    kind: import('../content-link').ContentEntityType,
  ) => string;
  content_link_headings: string;
  content_link_description_headings: string;
  content_link_sections: string;
  content_link_anchor_gone: (anchor: string) => string;
  content_link_target_gone: string;
  content_link_becomes_video: string;
  content_link_apply: string;
  content_link_change: string;
  /** The hint of the editor's "+". */
  content_block_add: string;
  content_block_settings: string;
  /** The grid of blocks the "+" opens. */
  content_block_toolbox: string;
  ai_template_run: string;
  ai_template_nothing_new: (title: string) => string;
  ai_template_nothing_here: (title: string) => string;
  ai_template_edit: string;
  ai_template_running: string;
  ai_template_never_run: string;
  ai_template_started: (title: string) => string;
  ai_template_saved: string;
  ai_template_deleted: string;
  ai_template_copied: string;
  ai_template_modal_title: string;
  ai_template_modal_new: string;
  ai_template_name: string;
  ai_template_name_placeholder: string;
  ai_template_instruction: string;
  ai_template_instruction_placeholder: string;
  /** The connection's model, while its name is not known. */
  ai_template_sessions: string;
  ai_template_copy: string;
  ai_template_delete: string;
  ai_template_delete_confirm: (title: string) => string;
  ai_sessions_search: string;
  ai_sessions_filter: string;
  ai_sessions_filters: Record<
    'all' | 'waiting' | 'applied' | 'rejected' | 'app' | 'template',
    string
  >;
  ai_session_new: string;
  ai_session_groups: Record<
    'pinned' | 'waiting' | 'running' | 'week' | 'earlier' | 'archive',
    string
  >;
  ai_session_untitled: string;
  ai_session_you: string;
  ai_session_template: string;
  ai_session_running: string;
  /** The dashboard's group of sessions done within the week. */
  ai_session_recent: string;
  ai_session_waiting: (count: number) => string;
  ai_sessions_archive_note: string;
  ai_sessions_empty: string;
  ai_sessions_more: string;
  ai_sessions_back: string;
  ai_no_model_title: string;
  ai_no_model_text: string;
  ai_no_model_action: string;
  ai_session_menu: string;
  ai_session_pin: string;
  ai_session_unpin: string;
  ai_session_rename: string;
  ai_session_archive: string;
  ai_session_unarchive: string;
  ai_session_delete: string;
  ai_session_delete_confirm: (title: string) => string;
  ai_session_by_you: (when: string) => string;
  ai_session_via_app: (client: string) => string;
  /** An amount as `compactAmount` says it: «21», «1.2K». */
  ai_session_tokens: (amount: string) => string;
  ai_session_app_note: string;
  ai_session_archived_note: string;
  ai_session_model: string;
  ai_steps: {
    read: (count: number) => string;
    search: (queries: string) => string;
    list: string;
    graph: string;
    timeline: string;
    tags: string;
    digests: (count: number) => string;
    proposed: (count: number) => string;
    refused: (count: number) => string;
    refused_hint: string;
    files: string;
    failed: (count: number) => string;
  };
  ai_question: string;
  ai_question_own: string;
  ai_notices: Record<
    | 'stopped'
    | 'timeout'
    | 'interrupted'
    | 'limit'
    | 'no-model'
    | 'key'
    | 'busy'
    | 'address'
    | 'model'
    | 'refused'
    | 'length'
    | 'turns'
    | 'error',
    string
  >;
  ai_notice_connection: string;
  ai_comment_on: (what: string) => string;
  /** The hint of a proposed description's file, which opens its window. */
  ai_action_open_file: string;
  /** Correcting a proposal's words before applying it. */
  ai_action_edit: string;
  ai_action_edit_cancel: string;
  /** Kept and applied as corrected. */
  ai_action_edit_apply: string;
  /** Kept as corrected, for a bundle's foot to apply. */
  ai_action_edit_save: string;
  /** A proposal whose words the owner corrected. */
  ai_action_corrected: string;
  /** What the model had proposed, in a hint. */
  ai_action_model_words: (words: string) => string;
  /** What each of a proposal's texts is, when it carries several. */
  ai_action_text_roles: Record<
    | 'description'
    | 'text'
    | 'fact'
    | 'word'
    | 'meaning'
    | 'tag'
    | 'note'
    | 'note-this'
    | 'note-other',
    string
  >;
  /** The header of the owner's message begun from a template or a check. */
  ai_message_template: (title: string) => string;
  /** What the owner says, and the button says, to go on with a check's run. */
  ai_continue_text: string;
  /** The button to go on, when fewer than a whole batch remain. */
  ai_continue_more: (count: number) => string;
  /** Gone on with a check that had nothing left. */
  ai_continue_nothing: string;
  ai_answer_to: (question: string) => string;
  ai_composer_placeholder: string;
  ai_composer_running: string;
  ai_composer_attach: string;
  ai_composer_files: { title: string; hint: string };
  ai_composer_file_remove: string;
  ai_composer_file_failed: string;
  ai_composer_files_limit: (max: number) => string;
  ai_composer_file_unnamed: string;
  ai_composer_drop: string;
  ai_message_file_gone: string;
  ai_composer_mention: { title: string; hint: string };
  ai_send: string;
  ai_stop: string;
  /** What the month's answers spent, under the list of sessions. */
  ai_usage_title: (month: string) => string;
  ai_usage_amount: (spent: string, limit: string) => string;
  /** `average` as a number for its word, and as written short beside it. */
  ai_usage_average: (average: number, averageText: string) => string;
  ai_new_title: string;
  ai_new_text: string;
  /** The built-in checks' words: what each is called and asks. */
  ai_template_builtins: Record<
    import('../ai-template').AiBuiltinTemplateKey,
    { title: string; instruction: string }
  >;
  ai_template_copy_title: (title: string) => string;
  /** How a check's session opens: who started it, and how much it was given. */
  ai_template_note: (title: string, count: number | null) => string;
  ai_action_kinds: Record<AiActionKind, string>;
  /** What a memory record is about when it is not one entity. */
  ai_memory_owner: string;
  /** The screen a text edit or another version is gone through on. */
  ai_review_title: string;
  ai_review_compare_title: (when: string) => string;
  ai_review_compare_why: string;
  ai_review_view: string;
  ai_review_views: Record<import('../content-review').ReviewView, string>;
  ai_review_kinds: Record<import('../content-review').ReviewPartKind, string>;
  /** Where words outside the running text stand. */
  ai_review_where: Record<'caption' | 'file' | 'link', string>;
  ai_review_unsure: string;
  ai_review_private: string;
  ai_review_settled: Record<'applied' | 'stale', string>;
  /** The words of each way through: an AI's edit, or another version. */
  ai_review_modes: Record<
    'ai' | 'version',
    {
      accept: string;
      keep: string;
      sure: string;
      was: string;
      will: string;
      accepted: string;
      kept: string;
      apply: (count: number) => string;
      finish: (decided: number, total: number) => string;
      finish_hint: string;
    }
  >;
  ai_review_finish_editor: string;
  ai_review_close: string;
  ai_review_go_on: string;
  ai_review_undo: string;
  ai_review_prev: string;
  ai_review_next: string;
  ai_review_words: (count: number) => string;
  ai_review_blocks: (count: number) => string;
  ai_review_unsure_count: (count: number) => string;
  ai_review_all_decided: string;
  ai_review_filters: Record<'all' | 'unsure' | 'words' | 'blocks', string>;
  ai_review_gone: string;
  ai_review_gone_taken: string;
  /** A block's files in a line about it: how many, and their extensions. */
  ai_review_files: (count: number, extensions: string) => string;
  /** A block a part would bring, left out. */
  ai_review_not_added: string;
  ai_review_file_added: string;
  ai_review_file_removed: string;
  /** What changed in a block besides its words, in a few words each. */
  ai_review_changes: {
    type: (from: string, to: string) => string;
    level: (from: number, to: number) => string;
    style: (from: string, to: string) => string;
    spoiler: (on: boolean) => string;
    numbering: string;
    checks: string;
    markup: string;
    alignment: string;
    layout: string;
    title: string;
    caption: string;
    files: string;
    target: string;
    note: string;
    other: string;
  };
  /** Of a new order: how many blocks it moves. */
  ai_review_moved: (count: number) => string;
  /** Of a paragraph split: how many it becomes. */
  ai_review_split_into: (count: number) => string;
  ai_review_comment_placeholder: string;
  ai_review_comment_sent: string;
  ai_review_from_session: (title: string) => string;
  ai_review_applied: (count: number) => string;
  ai_review_taken: (count: number) => string;
  ai_memory_search: string;
  ai_memory_owner_hint: string;
  ai_memory_owner_never: string;
  ai_memory_chars: (count: number, max: number) => string;
  ai_memory_terms: string;
  ai_memory_terms_hint: string;
  ai_memory_term_new: string;
  ai_memory_term_exists: string;
  ai_memory_term_add: string;
  ai_memory_term_word: string;
  ai_memory_term_note: string;
  ai_memory_term_note_placeholder: string;
  ai_memory_term_forms: string;
  ai_memory_term_forms_placeholder: string;
  ai_memory_term_keep: string;
  ai_memory_term_keep_hint: string;
  /** How many texts of the archive use a word, any form of it. */
  ai_memory_term_uses: (count: number) => string;
  ai_memory_term_remove: string;
  ai_memory_kinds_title: string;
  ai_memory_kinds_hint: string;
  ai_memory_entities_title: string;
  ai_memory_entities_hint: string;
  /** What an entity is, after its name in the list. */
  ai_memory_entity_kinds: Record<
    Exclude<import('../ai').AiEntityType, 'profile'>,
    string
  >;
  ai_memory_nothing: string;
  ai_memory_by_you: string;
  ai_memory_edit: string;
  ai_memory_forget: string;
  ai_memory_allow: string;
  ai_memory_forgotten: string;
  ai_memory_restore: string;
  ai_offer_take: string;
  ai_offer_in_session: string;
  ai_offer_taken: string;
  ai_offer_take_back: string;
  ai_offer_chip: (label: string) => string;
  /** The ✦ at a field's label: what an AI proposes for the field. */
  ai_field_offers: (count: number) => string;
  ai_field_offer_prev: string;
  ai_field_offer_next: string;
  ai_remember_title: string;
  ai_remember_placeholder: string;
  ai_remember_hint: string;
  ai_remember_save: string;
  ai_remember_saved: string;
  ai_memory_block_title: string;
  ai_memory_block_hint: (withIt: string) => string;
  ai_memory_digest_fresh: (when: string) => string;
  ai_memory_digest_stale: (when: string) => string;
  ai_memory_parts: string;
  ai_entity_this: {
    profile: string;
    project: string;
    'project-section': string;
    event: string;
    'diary-entry': string;
    page: string;
    tag: string;
  };
  ai_entity_with: {
    project: string;
    'project-section': string;
    event: string;
    'diary-entry': string;
    page: string;
    tag: string;
  };
  ai_entity_menu: (it: string) => string;
  ai_entity_new_session: (title: string) => string;
  ai_entity_sessions: (count: number) => string;
  ai_entity_no_sessions: string;
  ai_entity_all_sessions: string;
  ai_session_applied_count: (count: number) => string;
  ai_form_outdated: string;
  ai_form_outdated_hint: string;
  ai_form_reload: string;
  ai_sessions_about: string;
  ai_sessions_about_clear: string;
  ai_new_about: string;
  ai_bar_new_plain: string;
  ai_bar_waiting_title: (count: number) => string;
  ai_bar_nothing_waits: string;
  ai_bar_all_sessions: string;
  ai_memory_open: string;
  ai_memory_more: (count: number) => string;
  ai_memory_cancel: string;
  ai_memory_kinds: Record<
    Exclude<import('../ai').AiEntityType, 'profile'>,
    string
  >;
  ai_action_and: string;
  ai_action_term_keep: string;
  ai_action_facts: (count: number) => string;
  ai_action_card_title: (count: number) => string;
  ai_action_apply: string;
  ai_action_apply_count: (count: number) => string;
  ai_action_apply_sure: string;
  ai_action_apply_final: string;
  ai_action_reject: string;
  ai_action_reject_all: string;
  ai_action_comment: string;
  ai_action_open: string;
  ai_action_undo: string;
  ai_action_restore: string;
  ai_action_never: string;
  ai_action_pick: string;
  ai_action_unsure: string;
  ai_action_applied: (by: string, when: string) => string;
  ai_action_by: Record<'owner' | 'app', string>;
  ai_action_states: Record<
    | 'rejected'
    | 'never'
    | 'undone'
    | 'stale'
    | 'failed'
    | 'superseded'
    | 'applying',
    string
  >;
  ai_action_undo_states: Record<
    'changed' | 'gone' | 'final' | 'undone',
    string
  >;
  ai_action_atomic_hint: string;
  ai_action_unticked_hint: string;
  ai_action_final_note: string;
  ai_action_by_ai: string;
  ai_action_corrections: (count: number) => string;
  /** Links that lead nowhere, mended: the action, and how many. */
  ai_action_relink: string;
  ai_action_relinks: (count: number) => string;
  /** A mended link in a review: what it led to is gone; no link after. */
  ai_review_link_gone: string;
  ai_review_link_off: string;
  /** Words that lead nowhere yet, before a link is made of them. */
  ai_review_link_none: string;
  /** A mended link whose link leads elsewhere since. */
  ai_review_link_changed: string;
  ai_action_unsure_count: (count: number) => string;
  ai_action_order: string;
  ai_action_order_parts: (count: number) => string;
  ai_action_relations: Record<'related' | 'depends-on' | 'affects', string>;
  ai_action_relation_removed: string;
  ai_action_write_modes: Record<'new' | 'append' | 'replace', string>;
  ai_action_texts: Record<'body' | 'notes' | 'description' | 'about', string>;
  /** Every field a form takes, as a change names it (`FORM_FIELDS`). */
  ai_action_fields: Record<
    | 'title'
    | 'summary'
    | 'reminder'
    | 'showcase'
    | 'cv'
    | 'description'
    | 'synonyms'
    | 'slogan'
    | 'statuses'
    | 'actionText'
    | 'access'
    | 'slug'
    | 'publicId'
    | 'icon'
    | 'banner'
    | 'showcaseFiles'
    | 'files'
    | 'links'
    | 'tags'
    | 'relations'
    | 'notes'
    | 'sections'
    | 'sectionOrder'
    | 'private'
    | 'periods'
    | 'body'
    | 'date'
    | 'displayName'
    | 'nickname'
    | 'about'
    | 'favicon',
    string
  >;
  ai_action_flag: Record<'on' | 'off', string>;
  ai_action_create: Record<
    'project' | 'project-section' | 'event' | 'diary-entry' | 'page' | 'tag',
    string
  >;
  ai_action_parts: Record<'sections' | 'tags' | 'relations', string>;
  ai_action_access: Record<'public' | 'link-only' | 'private', string>;
  ai_action_update_fields: (fields: string) => string;
  ai_toast_declined: (count: number) => string;
  ai_toast_never: string;
  ai_toast_comment_sent: string;
  ai_toast_answer_sent: string;
  ai_toast_pinned: string;
  ai_toast_unpinned: string;
  ai_toast_undone: string;
  ai_toast_restored: string;
  ai_comment_label: string;
  ai_comment_placeholder: string;
  ai_comment_quick: [string, string];
  ai_model_states: Record<
    'ready' | 'off' | 'none' | 'no-key' | 'no-address' | 'no-model' | 'budget',
    string
  >;
  ai_model_provider_label: string;
  ai_model_provider_cards: Record<
    'none' | 'api',
    { title: string; text: string }
  >;
  ai_model_service_label: string;
  /** Under a service that takes no sound: how its model meets recordings. */
  ai_model_no_sound: string;
  ai_model_service_choose: string;
  ai_model_service_custom: string;
  ai_model_service_local: (name: string) => string;
  ai_model_service_missing: string;
  ai_model_base_url: string;
  ai_model_label: string;
  ai_model_list_refresh: string;
  ai_model_unlisted: string;
  ai_model_choose: string;
  ai_model_other: string;
  ai_model_choice: string;
  ai_model_id_placeholder: string;
  ai_model_missing: string;
  ai_model_address_invalid: string;
  ai_model_key: string;
  ai_model_key_placeholder: string;
  ai_model_key_replace_placeholder: (hint: string) => string;
  ai_model_key_remove: string;
  ai_model_key_remove_confirm: string;
  ai_model_key_where: string;
  ai_model_key_optional: string;
  ai_model_limit_label: string;
  ai_model_limit_hint: string;
  ai_model_limit_unit: string;
  ai_model_limit_tokens: string;
  ai_model_limit_tokens_link: string;
  ai_model_limit_invalid: string;
  ai_model_usage_line: (month: string, spent: string, limit: string) => string;
  ai_model_average: (thousands: string) => string;
  ai_model_check: string;
  ai_model_check_outcomes: Record<
    'ok' | 'key' | 'model' | 'address' | 'busy' | 'error',
    string
  >;
  ai_bar_waiting: (count: number) => string;
  ai_error: string;
  ai_off_notice: string;
  x_sections: (count: number) => string;
};

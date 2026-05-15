export type LanguagePhraseValue = string | ((...args: any[]) => string);

export type ValidateLanguagePhrases<
  T extends Record<keyof T, LanguagePhraseValue>,
> = T;

export type LanguagePhraseId = Extract<keyof LanguagePhrases, string>;

export function defineLanguagePhrases(
  phrases: LanguagePhrases,
): LanguagePhrases {
  return new Proxy(
    {},
    {
      get(_, key) {
        if (key in phrases) {
          return phrases[key as keyof LanguagePhrases];
        }

        const missingPhrase = function () {
          return key;
        };

        Object.defineProperty(missingPhrase, 'toString', {
          value() {
            return key.toString();
          },
        });

        Object.defineProperty(missingPhrase, Symbol.toPrimitive, {
          value() {
            return key.toString();
          },
        });

        return missingPhrase;
      },
    },
  ) as any;
}

export type LanguagePhrases = ValidateLanguagePhrases<{
  language_code: string;
  language_name: string;

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
  global_settings_title: string;
  global_settings_description: string;
  ui_language: string;
  ui_language_hint: string;
  site_access: string;
  site_access_open: string;
  site_access_closed: string;
  site_access_open_description: string;
  site_access_closed_description: string;
  admin_data: string;
  admin_data_description: string;

  // #region Install
  install_title: string;
  install_subtitle: string;
  install_language_label: string;
  install_language_hint: string;
  install_display_name_label: string;
  install_display_name_variants: string;
  install_display_name_description: (name: string) => string;
  install_auth_path_label: string;
  install_auth_path_prefix: string;
  install_auth_path_placeholder: string;
  install_auth_path_description: string;
  install_password_label: string;
  install_password_placeholder: string;
  install_confirm_password_label: string;
  install_confirm_password_placeholder: string;
  install_theme_label: string;
  install_theme_hint: string;
  install_theme_system: string;
  install_theme_light: string;
  install_theme_dark: string;
  install_access_label: string;
  install_access_open: string;
  install_access_closed: string;
  install_access_open_description: string;
  install_access_closed_description: string;
  install_submit: string;
  install_installing: string;
  install_error_passwords_mismatch: string;
  install_error_fields_required: string;
  install_error_auth_path_spaces: string;
  // #endregion

  // #region Auth
  auth_tab_title: string;
  auth_subtitle: string;
  auth_password_placeholder: string;
  auth_submit: string;
  auth_submitting: string;
  auth_error_wrong_password: string;
  auth_error_rate_limited: string;
  // #endregion

  secret_admin: string;
  to_admin_panel: string;
  to_website: string;
  sign_out: string;
  project: string;
  x_projects: (count: number) => string;
  event: string;
  x_events: (count: number) => string;
  new_project: string;
  new_event: string;
  edit_project: string;
  edit_event: string;
}>;

export interface FileDimensions {
  width: number;
  height: number;
}

/** Long sides offered as quick output sizes in the editor. */
export const ASSET_SIZE_PRESETS = [360, 720, 1280, 1920, 2560] as const;

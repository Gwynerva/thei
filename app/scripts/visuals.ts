const storageKey = 'thei-visuals';

function ensureBrowserEnvironment() {
  if (typeof window === 'undefined') {
    throw new Error(
      '[thei] Visuals functions can only be called in a browser environment!',
    );
  }
}

//
// Theme
//

export const visualsThemes = ['system', 'light', 'dark'] as const;
export type VisualsTheme = (typeof visualsThemes)[number];

//
// Accent Hue
//

const hueStep = 20;
export const visualsAccentHues = (() => {
  const hues: number[] = [];
  for (let hue = 0; hue < 360; hue += hueStep) {
    hues.push(hue);
  }
  return hues;
})();

function isAccentHue(value: any): value is number {
  return visualsAccentHues.includes(value);
}

function getRandomAccentHue(): number {
  const hues = visualsAccentHues;
  return hues[Math.floor(Math.random() * hues.length)]!;
}

//
// Font Style
//

export const visualsFontStyles = ['sans', 'serif'] as const;
export type VisualsFontStyle = (typeof visualsFontStyles)[number];

export interface Visuals {
  theme: VisualsTheme;
  accentHue: number;
  fontStyle: VisualsFontStyle;
}

//
// Visuals Controls
//

export function getStorageVisuals(): Visuals {
  ensureBrowserEnvironment();

  const storedVisuals = localStorage.getItem(storageKey) || '{}';
  const visuals = JSON.parse(storedVisuals) as Partial<Visuals>;

  if (!visualsThemes.includes(visuals.theme as any)) {
    visuals.theme = 'system';
  }

  if (!isAccentHue(visuals.accentHue)) {
    const randomHue = getRandomAccentHue();
    visuals.accentHue = randomHue;
  }

  if (!visualsFontStyles.includes(visuals.fontStyle as any)) {
    visuals.fontStyle = 'sans';
  }

  return visuals as Visuals;
}

export function setStorageVisuals(visuals: Visuals) {
  ensureBrowserEnvironment();
  localStorage.setItem(storageKey, JSON.stringify(visuals));
}

export function applyVisuals(visuals: Visuals) {
  ensureBrowserEnvironment();

  document.documentElement.dataset.theme =
    visuals.theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : visuals.theme;

  document.documentElement.style.setProperty(
    '--hue-accent',
    visuals.accentHue + '',
  );

  document.documentElement.style.setProperty(
    '--font-default',
    visuals.fontStyle === 'sans' ? 'var(--font-sans)' : 'var(--font-serif)',
  );
}

if (window) {
  const visuals = getStorageVisuals();
  setStorageVisuals(visuals);
  applyVisuals(visuals);
}

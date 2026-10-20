// What reviewers judge, defined once: the brief lists these, the validator
// checks that each one is scored, the summary and the report read them.
import type {
  Persona,
  Severity,
  StudyBar,
  VariantCode,
  Viewport,
} from '../types';

export interface Criterion {
  id: string;
  /** How the brief and the report call it. */
  label: string;
  /** What a reviewer judges under it, in the persona's own terms. */
  meaning: string;
  lens: Persona['lens'];
  /** Who it is for; absent means everyone of the lens. */
  role?: NonNullable<Persona['role']>;
  experience?: NonNullable<Persona['experience']>;
  /** The screens it is judged on; absent means every screen. */
  device?: Viewport;
}

export const CRITERIA: readonly Criterion[] = [
  {
    id: 'findability',
    label: 'Findability',
    meaning:
      'What is needed is found without a hint: a button, a menu item, a place on the page. No guessing where it is.',
    lens: 'persona',
  },
  {
    id: 'proximity',
    label: 'Proximity',
    meaning:
      'An action sits next to what it acts on, where the eye already is: no extra pages, scrolling or long pointer travel.',
    lens: 'persona',
  },
  {
    id: 'feedback',
    label: 'Feedback',
    meaning:
      'Every action gets a visible answer at once: the press shows, waiting is shown, the result is clear.',
    lens: 'persona',
  },
  {
    id: 'control',
    label: 'Control',
    meaning:
      'Nothing happens without asking; one can change one’s mind, undo, go back and not lose what was written.',
    lens: 'persona',
  },
  {
    id: 'wording',
    label: 'Clear wording',
    meaning:
      'Labels, buttons and messages make sense to this person without explanation, in their words, not a developer’s.',
    lens: 'persona',
  },
  {
    id: 'trust',
    label: 'Trust',
    meaning:
      'It is clear that what was done is saved and that the site behaves reliably; nothing alarms or raises doubt.',
    lens: 'persona',
  },
  {
    id: 'consistency',
    label: 'Consistency',
    meaning:
      'The same thing looks and behaves the same on different screens; a habit learnt on one works on another.',
    lens: 'persona',
  },
  {
    id: 'errors',
    label: 'Errors and ways out',
    meaning:
      'Mistakes are hard to make; when one happens, it says what is wrong and how to get out. Any place can be left.',
    lens: 'persona',
  },
  {
    id: 'phone',
    label: 'Phone',
    meaning:
      'On a phone everything is within a finger’s reach and readable without zooming; nothing runs off the edge or hides under the keyboard.',
    lens: 'persona',
    device: 'phone',
  },
  {
    id: 'keyboard',
    label: 'Keyboard',
    meaning:
      'The task can be done from the keyboard: focus is visible, the order is logical, frequent things have shortcuts, Escape closes.',
    lens: 'persona',
    role: 'owner',
    experience: 'expert',
    device: 'desktop',
  },
  {
    id: 'routine-speed',
    label: 'Routine speed',
    meaning:
      'A frequent task takes few presses and movements, without needless confirmations or waits.',
    lens: 'persona',
    role: 'owner',
    experience: 'expert',
  },
  {
    id: 'tidiness',
    label: 'Tidiness',
    meaning:
      'Nothing overlaps, edges line up, gaps are even, text is not cut off; the screen looks put together.',
    lens: 'persona',
  },
  {
    id: 'composition',
    label: 'Composition',
    meaning:
      'What matters is seen first, the hierarchy is clear, and empty space serves the meaning instead of being left over.',
    lens: 'designer',
  },
  {
    id: 'alignment',
    label: 'Alignment',
    meaning:
      'Edges and centres sit on shared lines; repeated elements line up with each other; nothing is almost straight.',
    lens: 'designer',
  },
  {
    id: 'spacing-rhythm',
    label: 'Spacing rhythm',
    meaning:
      'Gaps come from one scale and repeat: the same things are the same distance apart, groups are set clearly further apart.',
    lens: 'designer',
  },
  {
    id: 'overlaps',
    label: 'Overlaps',
    meaning:
      'Nothing runs over text or a button, covers a control, or spills out of the screen or its own box.',
    lens: 'designer',
  },
  {
    id: 'typography',
    label: 'Typography',
    meaning:
      'Sizes and weights come from one scale, lines are a comfortable length, wrapping and truncation fit, headings read as headings.',
    lens: 'designer',
  },
  {
    id: 'component-consistency',
    label: 'Component consistency',
    meaning:
      'Buttons, fields, popups, icons and hints are as docs/design describes them: one shape, size and behaviour everywhere.',
    lens: 'designer',
  },
  {
    id: 'themes',
    label: 'Themes',
    meaning:
      'Light and dark are equally good: enough contrast, colours where they belong, nothing lost against the background.',
    lens: 'designer',
  },
  {
    id: 'layout-phone',
    label: 'Phone layout',
    meaning:
      'On a phone the layout is made for a narrow screen: nothing squeezed unreadable, no clutter in a row, large finger targets.',
    lens: 'designer',
    device: 'phone',
  },
];

const byId = new Map(CRITERIA.map((criterion) => [criterion.id, criterion]));

export function criterion(id: string): Criterion {
  const found = byId.get(id);
  if (!found) throw new Error(`Unknown criterion "${id}"`);
  return found;
}

export function isCriterion(id: string): boolean {
  return byId.has(id);
}

export const SEVERITIES: readonly {
  id: Severity;
  label: string;
  meaning: string;
}[] = [
  {
    id: 'blocker',
    label: 'blocker',
    meaning: 'The task cannot be finished, or what was done is lost.',
  },
  {
    id: 'serious',
    label: 'serious',
    meaning:
      'The task is done with difficulty or a mistake, or the screen has a gross defect: an overlap, cut-off text, something off the edge.',
  },
  {
    id: 'minor',
    label: 'minor',
    meaning:
      'It slows down, annoys or looks untidy, but does not stop the task.',
  },
  {
    id: 'taste',
    label: 'taste',
    meaning: 'A personal preference; it may stay as it is.',
  },
];

export const SEVERITY_ORDER: readonly Severity[] = SEVERITIES.map((s) => s.id);

export function severityLabel(severity: Severity): string {
  return SEVERITIES.find((s) => s.id === severity)!.label;
}

export const DEFAULT_BAR: StudyBar = {
  minScore: 8,
  minMean: 8.5,
  forbid: ['blocker', 'serious'],
};

export function resolveBar(bar?: Partial<StudyBar>): StudyBar {
  return {
    minScore: bar?.minScore ?? DEFAULT_BAR.minScore,
    minMean: bar?.minMean ?? DEFAULT_BAR.minMean,
    forbid: bar?.forbid ?? [...DEFAULT_BAR.forbid],
  };
}

export function variantViewport(code: VariantCode): Viewport {
  return code.startsWith('p') ? 'phone' : 'desktop';
}

export function variantCode(variant: {
  viewport: Viewport;
  theme: 'light' | 'dark';
}): VariantCode {
  return `${variant.viewport[0]}${variant.theme[0]}` as VariantCode;
}

export function variantLabel(code: VariantCode): string {
  const screen = variantViewport(code) === 'phone' ? 'phone' : 'desktop';
  const theme = code.endsWith('d') ? 'dark theme' : 'light theme';
  return `${screen}, ${theme}`;
}

/** The study's changes to the lens's own criteria. */
export interface CriteriaChanges {
  add?: string[];
  skip?: string[];
}

/**
 * The criteria a persona judges on these screens, each with the screens it
 * applies to, in the catalog's order. A criterion a study adds applies to
 * every persona of its lens, whatever the role or experience; its device
 * still decides the screens.
 */
export function criteriaFor(
  persona: Pick<Persona, 'lens' | 'role' | 'experience'>,
  variants: readonly VariantCode[],
  changes: CriteriaChanges = {},
): { criterion: Criterion; variants: VariantCode[] }[] {
  for (const id of [...(changes.add ?? []), ...(changes.skip ?? [])])
    criterion(id);
  const added = new Set(changes.add ?? []);
  const skipped = new Set(changes.skip ?? []);
  const result: { criterion: Criterion; variants: VariantCode[] }[] = [];
  for (const candidate of CRITERIA) {
    if (candidate.lens !== persona.lens || skipped.has(candidate.id)) continue;
    const own =
      (!candidate.role || candidate.role === persona.role) &&
      (!candidate.experience || candidate.experience === persona.experience);
    if (!own && !added.has(candidate.id)) continue;
    const on = variants.filter(
      (code) => !candidate.device || variantViewport(code) === candidate.device,
    );
    if (on.length) result.push({ criterion: candidate, variants: on });
  }
  return result;
}

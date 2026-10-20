import {
  computed,
  inject,
  nextTick,
  provide,
  ref,
  toValue,
  watch,
  type ComputedRef,
  type InjectionKey,
  type MaybeRefOrGetter,
  type Ref,
} from 'vue';
import type { LanguagePhrases } from '#layers/thei/shared/language/types';
import {
  projectActionIssueWords,
  projectActionIssues,
  projectActionValidationError,
  type ProjectActionEditData,
} from '#layers/thei/shared/project-action';

/**
 * What a form still needs before it can be saved: a required field left
 * empty, by the label the form shows for it, or a field filled in a way that
 * cannot be saved, with what is wrong with it.
 */
export interface FormNeed {
  /** The field's place: the `need` of its `Field`, or a `data-need`. */
  key: string;
  /** Its label, as the form shows it; both, when either field will do. */
  label: string;
  /** What is wrong with what it holds, shortly; none when it is empty. */
  problem?: string;
}

/** Missing fields the header's line names before it counts the rest. */
const NAMED_IN_LINE = 3;

/**
 * All of what a form needs, in words: the hint of its Save and what a
 * screen reader hears with it. Empty fields together, then each field to
 * correct with what is wrong with it.
 *
 * `short` is the line under the header, which must stay a line or two on a
 * phone: it names three empty fields at most — two when fields to correct
 * follow — and counts the others, and, when it says more than one thing,
 * names the fields to correct without what is wrong: their fields say that
 * themselves.
 */
export function formNeedsWords(
  phrase: LanguagePhrases,
  needs: readonly FormNeed[],
  short = false,
): string[] {
  const missing = needs.filter((need) => !need.problem).map((n) => n.label);
  const wrong = needs.filter((need) => need.problem);
  const words: string[] = [];
  if (missing.length) {
    // With fields to correct after them, one empty field fewer is named.
    const named = NAMED_IN_LINE - (wrong.length ? 1 : 0);
    const more = short ? Math.max(0, missing.length - named) : 0;
    words.push(
      more
        ? phrase.form_required_missing_more(missing.slice(0, named), more)
        : phrase.form_required_missing(missing),
    );
  }
  if (short && needs.length > 1) {
    if (wrong.length)
      words.push(phrase.form_fields_to_correct(wrong.map((n) => n.label)));
  } else for (const need of wrong) words.push(`${need.label}: ${need.problem}`);
  return words;
}

/**
 * The action button of a project or an event, when it cannot be saved as it
 * is set: called by its section's title, with what it still lacks — the
 * words its own box says them in. Its box is its place (`data-need`).
 */
export function actionNeed(
  action: ProjectActionEditData | undefined,
  label: string,
): FormNeed | undefined {
  if (!action) return undefined;
  const issues = projectActionIssues(action);
  if (issues.length)
    return {
      key: 'action',
      label,
      problem: phrase.value.project_action_needs(
        issues
          .map((issue) => projectActionIssueWords(phrase.value, issue))
          .join(', '),
      ),
    };
  const error = projectActionValidationError(action);
  return error ? { key: 'action', label, problem: error } : undefined;
}

interface FormNeedsContext {
  /** Whether a save was asked for and this field is why it was refused. */
  marked: (key: string) => boolean;
}

const FORM_NEEDS: InjectionKey<FormNeedsContext> = Symbol('thei-form-needs');

/** Whether the `Field` around a label is marked as one its form needs. */
export const FIELD_NEED_MARKED: InjectionKey<Readonly<Ref<boolean>>> = Symbol(
  'thei-field-need-marked',
);

/**
 * A form's needs, said where the owner looks. Its Save, pressable even
 * while it cannot save, carries them as its `reason`; a press of it, or
 * Ctrl+S, asks: the line under the header says them, the fields they are
 * about are marked at their labels (`Field`'s `need`), and the first of them
 * is brought into view when it is out of it. Filled, the line and the marks
 * go by themselves.
 */
export function useFormNeeds(
  needs: MaybeRefOrGetter<FormNeed[]>,
  options: {
    /** Where the fields are, for a form inside a modal; the page otherwise. */
    root?: () => HTMLElement | null | undefined;
  } = {},
) {
  const list = computed(() => toValue(needs));
  const blocked = computed(() => list.value.length > 0);
  const stickyHeader = useStickyHeaderContext();
  const asked = ref(false);
  const reason = computed(() =>
    blocked.value
      ? formNeedsWords(phrase.value, list.value).join('\n')
      : undefined,
  );
  const line: ComputedRef<string | undefined> = computed(() =>
    asked.value && blocked.value
      ? formNeedsWords(phrase.value, list.value, true).join('\n')
      : undefined,
  );
  watch(blocked, (now) => {
    if (!now) asked.value = false;
  });

  /**
   * Each save asked for that could not be made, counted: the line takes it
   * as `again`, so one closed by hand comes back for a new press, while one
   * on show stays as it is.
   */
  const asks = ref(0);

  /** A save asked for that cannot be made: said, and its fields shown. */
  function ask() {
    asked.value = true;
    asks.value++;
    void nextTick(showFirst);
  }

  function showFirst() {
    const first = list.value[0];
    const root = options.root?.() ?? document;
    const element =
      first &&
      root.querySelector<HTMLElement>(`[data-need="${CSS.escape(first.key)}"]`);
    if (!element || !element.getClientRects().length) return;
    const box = element.getBoundingClientRect();
    // Under the header, the line it now shows and a margin: in sight.
    const covered = (stickyHeader?.height.value ?? 0) + 96;
    if (box.top >= covered && box.bottom <= window.innerHeight) return;
    element.scrollIntoView({
      block: 'center',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
    });
  }

  provide(FORM_NEEDS, {
    marked: (key) => asked.value && list.value.some((need) => need.key === key),
  });

  return { needs: list, blocked, reason, line, asks, ask };
}

export function injectFormNeeds() {
  return inject(FORM_NEEDS, undefined);
}

import {
  computed,
  inject,
  nextTick,
  provide,
  ref,
  toValue,
  useId,
  watch,
  type ComputedRef,
  type InjectionKey,
  type MaybeRefOrGetter,
  type Ref,
} from 'vue';
import type { LanguagePhrases } from '#layers/thei/shared/language/types';
import { scrollIntoSight } from '#layers/thei/app/modals/layer-motion';
import {
  projectActionIssueWords,
  projectActionIssues,
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
 *
 * What it lacks is all the server would refuse in a button set in its box:
 * the box offers only the targets, icons and backgrounds there are.
 */
export function actionNeed(
  phrase: LanguagePhrases,
  action: ProjectActionEditData | undefined,
  label: string,
): FormNeed | undefined {
  const issues = action ? projectActionIssues(action) : [];
  if (!issues.length) return undefined;
  return {
    key: 'action',
    label,
    problem: phrase.project_action_needs(
      issues.map((issue) => projectActionIssueWords(phrase, issue)).join(', '),
    ),
  };
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

/** The line under a form's header: its words, and `again` for a new press. */
export interface FormNeedsLine {
  message?: string;
  /**
   * Each save asked for that could not be made, counted: a line closed by
   * hand comes back for a new press (`HeaderErrorLine`'s `again`).
   */
  again: number;
}

export interface FormNeedsOptions {
  /** Where the fields are, for a form inside a modal; the page otherwise. */
  root?: () => HTMLElement | null | undefined;
  /**
   * The header the fields go under, for a form inside a modal: a field
   * brought into view clears its foot. A page's is its sticky header, under
   * the admin bar.
   */
  header?: () => HTMLElement | null | undefined;
  /**
   * Whether a save is to be asked for at all: something to save, and no
   * save under way. A press or Ctrl+S does nothing otherwise.
   */
  ready?: () => boolean;
  /**
   * The save itself, made by a press or Ctrl+S once the form needs nothing
   * more. Given it, the form's Ctrl+S is registered here — inside `root`, a
   * modal's own.
   */
  save?: () => unknown;
  /**
   * Why the last save failed, as the server said: shown on the same line,
   * ahead of what the form needs, and cleared by a press that cannot save —
   * it was said of the form as it was then.
   */
  error?: Ref<string | undefined>;
}

/**
 * A form's needs, said where the owner looks. Its Save, pressable even
 * while it cannot save, carries them as its `reason`; a press of it, or
 * Ctrl+S, goes to `submit`, which saves or asks: the line under the header
 * says them, the fields they are about are marked at their labels
 * (`Field`'s `need`), and the first of them is brought into view when it is
 * out of it. Filled, the line and the marks go by themselves.
 */
export function useFormNeeds(
  needs: MaybeRefOrGetter<FormNeed[]>,
  options: FormNeedsOptions = {},
) {
  const list = computed(() => toValue(needs));
  const blocked = computed(() => list.value.length > 0);
  const stickyHeader = useStickyHeaderContext();
  const asked = ref(false);
  const asks = ref(0);
  const reason = computed(() =>
    blocked.value
      ? formNeedsWords(phrase.value, list.value).join('\n')
      : undefined,
  );
  const line: ComputedRef<FormNeedsLine> = computed(() => ({
    message:
      options.error?.value ??
      (asked.value && blocked.value
        ? formNeedsWords(phrase.value, list.value, true).join('\n')
        : undefined),
    again: asks.value,
  }));
  watch(blocked, (now) => {
    if (!now) asked.value = false;
  });

  /** A save asked for that cannot be made: said, and its fields shown. */
  function ask() {
    asked.value = true;
    asks.value++;
    void nextTick(showFirst);
  }

  /** A press of the Save, or Ctrl+S: the save, or what it still needs. */
  async function submit(): Promise<void> {
    if (options.ready && !options.ready()) return;
    if (!blocked.value) {
      await options.save?.();
      return;
    }
    if (options.error) options.error.value = undefined;
    ask();
  }

  if (options.save)
    useSaveShortcut(submit, {
      canSave: () => options.ready?.() ?? true,
      root: options.root,
      exclusive: Boolean(options.root),
    });

  function showFirst() {
    const first = list.value[0];
    const root = options.root?.() ?? document;
    const element =
      first &&
      root.querySelector<HTMLElement>(`[data-need="${CSS.escape(first.key)}"]`);
    if (!element || !element.getClientRects().length) return;
    // Under the header, the line it now shows and a margin: in sight. A
    // modal's header is where it is; a page's stands under the admin bar.
    scrollIntoSight(element, {
      covered: options.header
        ? (options.header()?.getBoundingClientRect().bottom ?? 0) + 48
        : (stickyHeader?.height.value ?? 0) + 96,
    });
  }

  provide(FORM_NEEDS, {
    marked: (key) => asked.value && list.value.some((need) => need.key === key),
  });

  return { needs: list, blocked, reason, line, submit };
}

/**
 * A button that cannot act yet but stays pressable, to say why: what its
 * form still needs (`reason`, a line per need). It looks disabled
 * (`aria-disabled`, `off:`), its hint is its label in bold over the reason
 * in italic, and a screen reader hears the reason with it, from a hidden
 * element of the button's own (`reasonId`). With nothing to do — `disabled`
 * — or no reason, it is not blocked.
 */
export function useBlockedReason(
  button: () => { label: string; reason?: string; disabled?: boolean },
) {
  const reasonId = useId();
  const blocked = computed(() => {
    const { reason, disabled } = button();
    return Boolean(!disabled && reason);
  });
  const attributes = computed(() => {
    if (!blocked.value) return {};
    const { label, reason } = button();
    return {
      'aria-disabled': 'true' as const,
      'aria-describedby': reasonId,
      ...titlePopup(
        { text: label, bold: true },
        ...reason!.split('\n').map((text) => ({ text, italic: true })),
      ),
    };
  });
  return { blocked, reasonId, attributes };
}

export function injectFormNeeds() {
  return inject(FORM_NEEDS, undefined);
}

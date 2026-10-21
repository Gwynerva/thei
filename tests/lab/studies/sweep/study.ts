// The sweep: every screen of `tests/lab/screens.ts`, opened — and the modal
// or popup reached by its steps — and scrolled through to its end, through
// the designer's eyes — no task, only how the screens look. Built in: it
// changes with the screen list, not by hand.
import { defineScenario, defineStudy } from '../../run/define';
import { SCREENS } from '../../screens';

/** How far a sweep scrolls a long screen, at most. */
const MAX_SCROLLS = 4;

export default defineStudy({
  id: 'sweep',
  title: 'Sweep: every screen',
  question:
    'Is every screen tidy — nothing overlapping, aligned, evenly spaced, nothing cut off — on a phone and a computer, light and dark?',
  personas: ['designer'],
  variants: ['dd', 'pl'],
  scenarios: SCREENS.map((screen) =>
    defineScenario({
      id: screen.id,
      title: screen.title,
      roles: [screen.role],
      task: `Look at the screen "${screen.title}" from top to bottom.`,
      pick: () => ({}),
      ...(screen.searchHistory
        ? { searchHistory: (_picked, index) => screen.searchHistory!(index) }
        : {}),
      async run(j) {
        await j.step(`Open ${screen.title.toLowerCase()}`, {
          open: screen.path(j.index),
        });
        for (const step of screen.steps?.(j.index) ?? [])
          await j.step(step.label, step.action, step.options);
        for (let index = 0; index < MAX_SCROLLS; index++) {
          // What scrolls: the top modal's own scrolling part while one is
          // open — the page under it does not move — else the page.
          const scroll = await j.page.evaluate(
            (): { more: boolean; by: number; at?: [number, number] } => {
              const dialog = [...document.querySelectorAll('dialog[open]')].at(
                -1,
              );
              if (!dialog)
                return {
                  more:
                    window.scrollY + window.innerHeight <
                    document.documentElement.scrollHeight - 4,
                  by: Math.round(window.innerHeight * 0.85),
                };
              const scroller = [dialog, ...dialog.querySelectorAll('*')].find(
                (element) =>
                  element.scrollHeight > element.clientHeight + 4 &&
                  /auto|scroll/.test(getComputedStyle(element).overflowY),
              );
              if (!scroller) return { more: false, by: 0 };
              const box = scroller.getBoundingClientRect();
              return {
                more:
                  scroller.scrollTop + scroller.clientHeight <
                  scroller.scrollHeight - 4,
                by: Math.round(scroller.clientHeight * 0.85),
                at: [box.left + box.width / 2, box.top + box.height / 2],
              };
            },
          );
          if (!scroll.more) break;
          if (scroll.at) await j.page.mouse.move(...scroll.at);
          await j.step(`Scroll down (${index + 1})`, { scroll: scroll.by });
        }
      },
    }),
  ),
});

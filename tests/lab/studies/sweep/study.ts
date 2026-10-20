// The sweep: every screen of `tests/lab/screens.ts`, opened and scrolled
// through to its end, through the designer's eyes — no task, only how the
// screens look. Built in: it changes with the screen list, not by hand.
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
      async run(j) {
        await j.step(`Open ${screen.title.toLowerCase()}`, {
          open: screen.path(j.index),
        });
        for (let index = 0; index < MAX_SCROLLS; index++) {
          const more = await j.page.evaluate(
            () =>
              window.scrollY + window.innerHeight <
              document.documentElement.scrollHeight - 4,
          );
          if (!more) break;
          const step = await j.page.evaluate(() =>
            Math.round(window.innerHeight * 0.85),
          );
          await j.step(`Scroll down (${index + 1})`, { scroll: step });
        }
      },
    }),
  ),
});

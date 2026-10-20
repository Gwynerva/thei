// The demo study, kept in git by the owner's agreement: one thing an owner
// does every day, and one thing a visitor does on a first visit — each by
// two personas of different experience, and the visitor's also through the
// designer's eyes. It shows how a study is written; it is not a release gate.
import { choose, defineScenario, defineStudy, pickOne } from '../../run/define';
import type { ScenarioContext, SiteIndex } from '../../types';

/** A public event that is over, to mention in today's entry. */
function eventToMention(index: SiteIndex, salt: string) {
  return pickOne(
    index,
    'event',
    salt,
    (entity) => entity.access === 'public' && !entity.facts.running,
    'a public event that is over',
  );
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A word planted in one public text only. */
function uniqueWord(index: SiteIndex, salt: string) {
  const plants = Object.values(index.plants).filter((plant) => {
    const entity = plant.ref ? index.entities[plant.ref] : undefined;
    return (
      plant.word &&
      plant.traits.includes('unique-word') &&
      entity &&
      entity.access === 'public'
    );
  });
  const plant = choose(plants, salt);
  if (!plant)
    throw new Error('The archive plants no unique word in a public text.');
  return plant;
}

async function writeToday(j: ScenarioContext) {
  const event = j.entity('event');
  // The expert's keyboard way needs a keyboard: on a phone they tap too.
  const expert = j.persona.experience === 'expert' && !j.phone;
  await j.step('Open the admin', { open: '/admin/' });
  if (expert) {
    await j.step(
      'Go to the diary by its counter',
      { click: { role: 'link', name: /\bentr(y|ies)\b/i } },
      { answer: { text: 'New Entry' } },
    );
  } else {
    await j.step(
      'Find the diary on the dashboard',
      { click: { text: 'Diary', exact: true } },
      { answer: { text: 'New Entry' } },
    );
  }
  await j.step(
    'Start a new entry',
    { click: { text: 'New Entry' } },
    { answer: { role: 'button', name: /What was written/ }, timeoutMs: 15_000 },
  );
  await j.step(
    'Open the text of the entry',
    { click: { role: 'button', name: /What was written/ } },
    { answer: { shown: 'Start writing' }, timeoutMs: 20_000 },
  );
  await j.step('Put the caret into the text', {
    click: { shown: 'Start writing' },
  });
  await j.step('Write about the day', {
    type: `Today I kept thinking about ${event.title}. A good day.`,
  });
  if (expert) {
    await j.step(
      'Save from the keyboard',
      { press: 'Control+s' },
      { answer: { text: 'Saved', exact: true }, optional: true },
    );
    await j.step(
      'Close the window with Esc',
      { press: 'Escape' },
      { answer: { role: 'button', name: 'Add a relation' } },
    );
  } else {
    await j.step(
      'Save the text',
      { click: { role: 'button', name: 'Save' } },
      { answer: { text: 'Saved', exact: true }, optional: true },
    );
    await j.step(
      'Close the text window',
      { click: { role: 'button', name: 'Close dialog' } },
      { answer: { role: 'button', name: 'Add a relation' } },
    );
  }
  await j.step(
    'Add a relation to the event',
    { click: { role: 'button', name: 'Add a relation' } },
    { answer: { role: 'combobox' }, timeoutMs: 15_000 },
  );
  await j.step(
    'Find the event by its title',
    { fill: { role: 'combobox' }, text: event.title! },
    { answer: { text: event.title! }, timeoutMs: 10_000 },
  );
  await j.step('Choose the event', { click: { text: event.title! } });
  await j.step(
    'Confirm the relation',
    { click: { role: 'button', name: 'Done' } },
    { answerGone: { role: 'button', name: 'Done' } },
  );
  await j.step(
    'Create the entry',
    expert
      ? { press: 'Control+s' }
      : { click: { role: 'button', name: 'Create' } },
    {
      answer: { role: 'button', name: /^(Saved|Save)$/ },
      timeoutMs: 15_000,
      optional: true,
    },
  );
  await j.step(
    'Look at the result',
    { look: { text: event.title! } },
    { optional: true },
  );
}

async function findWord(j: ScenarioContext, word: string, title: string) {
  const expert = j.persona.experience === 'expert';
  await j.step('Open the site', { open: '/' });
  if (expert && !j.phone) {
    await j.step(
      'Open search from the keyboard',
      { press: 'Control+k' },
      { answer: { role: 'combobox' } },
    );
  } else {
    await j.step(
      'Open search',
      { click: { role: 'link', name: 'Search' } },
      { answer: { role: 'combobox' } },
    );
  }
  // What was found is an option of the search's list: the same title stands
  // elsewhere on the home page, and only the list answers the search.
  const found = { role: 'option', name: new RegExp(escapeRegExp(title)) };
  await j.step(
    'Type the word',
    { fill: { role: 'combobox' }, text: word },
    { answer: found, timeoutMs: 15_000 },
  );
  await j.step(
    'Open what was found',
    { click: found },
    { answer: { text: word }, timeoutMs: 15_000 },
  );
  await j.step(
    'Find the word on the page',
    { look: { text: word } },
    { optional: true },
  );
}

export default defineStudy({
  id: 'demo',
  title: 'Demo: writing the day, and a first visit',
  question:
    'Can an owner write today down and relate it to an event easily, and can a visitor find something they remember?',
  personas: ['novice', 'expert', 'guest', 'reader', 'designer'],
  variants: ['dd', 'pl'],
  scenarios: [
    defineScenario({
      id: 'diary-today',
      title: 'Write today down',
      roles: ['owner'],
      task: 'Write a few words about today in the diary, mention the event {event} in them, and relate the entry to that event.',
      pick: (index, salt) => ({ event: eventToMention(index, salt) }),
      run: writeToday,
    }),
    defineScenario({
      id: 'find-and-read',
      title: 'Find a word you remember',
      roles: ['visitor'],
      task: (picked, index) => {
        const plant = Object.values(index.plants).find(
          (item) =>
            item.ref === picked.text && item.traits.includes('unique-word'),
        );
        return `You remember the word "${plant?.word ?? '…'}" somewhere on this site. Find where it is, and open that place.`;
      },
      pick: (index, salt) => ({ text: uniqueWord(index, salt).ref! }),
      async run(j) {
        const plant = Object.values(j.index.plants).find(
          (item) =>
            item.ref === j.picked.text && item.traits.includes('unique-word'),
        )!;
        await findWord(j, plant.word!, j.entity('text').title ?? '');
      },
    }),
  ],
});

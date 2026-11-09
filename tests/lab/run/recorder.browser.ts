// The recorder in a browser, on fixtures opened from disk: a step that opens
// a new tab — an eye of the admin — goes on in it, as the person does.
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import { record } from './recorder';

const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));

test('a step that opens a new tab goes on in it', async ({
  page,
}, testInfo) => {
  await page.goto(pathToFileURL(`${fixtures}opener.html`).href);
  const recording = record({
    page,
    origin: pathToFileURL(fixtures).href,
    dir: testInfo.outputPath('play'),
    dpr: 1,
    theme: 'light',
    phone: testInfo.project.name === 'phone',
    // What a scenario picks plays no part in the steps themselves.
    context: {} as Parameters<typeof record>[0]['context'],
  });
  const { context, steps, findings } = recording;

  await context.step(
    'Open the page',
    { click: { role: 'link', name: 'Open the page' } },
    { answer: { role: 'heading', name: 'The page' } },
  );
  expect(findings).toEqual([]);
  expect(steps[0]!.newTab).toBe(true);
  expect(steps[0]!.url).toBe('opened.html');
  expect(context.page).not.toBe(page);

  // The next step looks at the new tab.
  await context.step('Read it', { look: 'What a visitor reads.' });
  expect(findings).toEqual([]);
  expect(steps[1]!.newTab).toBeUndefined();

  // Closed, the play is back in the tab it came from.
  await context.page.close();
  expect(context.page).toBe(page);
  await context.step('Back at the form', { look: 'The form' });
  expect(findings).toEqual([]);
  expect(steps[2]!.url).toBe('opener.html');
});

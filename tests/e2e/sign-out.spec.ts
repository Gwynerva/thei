import { expect, test, type Page } from '@playwright/test';

/**
 * Signing out from a form with unsaved changes asks first, and «Cancel» leaves
 * everything as it was: the session, the page and what was typed in it.
 * Agreed, the owner is signed out without the browser asking a second time.
 *
 * The spec signs in on its own: signing out ends the session it uses, and the
 * other specs share theirs.
 */

let errors: string[] = [];

test.beforeEach(({ page }) => {
  errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

/**
 * Signs in from inside the page, so the browser keeps the cookie. Sign-ins are
 * limited to one every 3 seconds per address, and the setup has just made one.
 */
async function signIn(page: Page) {
  await page.goto('/sign-in/');
  for (const until = Date.now() + 15_000; ;) {
    const type = await page.evaluate(async () => {
      const response = await fetch('/api/admin/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          secretPhrase: 'regression',
          password: 'fixture-only-password',
        }),
      });
      return ((await response.json()) as { type: string }).type;
    });
    if (type === 'success') return;
    expect(Date.now()).toBeLessThan(until);
    await page.waitForTimeout(1_000);
  }
}

const signedIn = (page: Page) =>
  page.evaluate(async () => (await fetch('/api/admin/diary/dates')).ok);

const title = (page: Page) =>
  page.locator('[data-need="title"]').getByRole('textbox');
const signOut = (page: Page) =>
  page.getByRole('button', { name: 'Sign Out', exact: true });

/** Presses Sign Out, answers its question «Cancel», and says what was asked. */
async function signOutRefused(page: Page) {
  const asked: string[] = [];
  const dismissed = new Promise<void>((resolve) =>
    page.once('dialog', async (dialog) => {
      asked.push(dialog.type());
      await dialog.dismiss();
      resolve();
    }),
  );
  await signOut(page).click();
  await dismissed;
  // The page goes on from the answer at once: a task later, its press has
  // run to its end.
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve)));
  return asked;
}

test('signing out from an unsaved form asks first and «Cancel» stays', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/admin/events/new/');
  await expect(page.locator('html')).toHaveAttribute(
    'data-nuxt-hydrated',
    'true',
  );
  await title(page).fill('Not saved yet');
  // Every sign-out the page begins ends its session, asked or not.
  const endings: string[] = [];
  page.on('request', (request) => {
    if (
      request.method() === 'DELETE' &&
      new URL(request.url()).pathname.endsWith('/api/admin/session')
    )
      endings.push(request.url());
  });

  const asked = await signOutRefused(page);
  expect(asked).toEqual(['confirm']);
  expect(endings).toEqual([]);
  expect(new URL(page.url()).pathname).toBe('/admin/events/new/');
  await expect(title(page)).toHaveValue('Not saved yet');
  expect(await signedIn(page)).toBe(true);

  // Agreed once, the way out asks nothing more.
  page.on('dialog', (dialog) => {
    asked.push(dialog.type());
    void dialog.accept();
  });
  await signOut(page).click();
  await page.waitForURL('**/sign-in/');
  expect(asked).toEqual(['confirm', 'confirm']);
  expect(endings).toHaveLength(1);
  expect(await signedIn(page)).toBe(false);
});

test('signing out from a tag being written asks too', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/tags/new/');
  await expect(page.locator('html')).toHaveAttribute(
    'data-nuxt-hydrated',
    'true',
  );
  await title(page).fill('Not saved either');
  expect(await signOutRefused(page)).toEqual(['confirm']);
  expect(new URL(page.url()).pathname).toBe('/admin/tags/new/');
  expect(await signedIn(page)).toBe(true);
});

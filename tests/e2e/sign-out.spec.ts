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

  const asked: string[] = [];
  page.once('dialog', (dialog) => {
    asked.push(dialog.type());
    void dialog.dismiss();
  });
  await signOut(page).click();
  await expect.poll(() => asked).toEqual(['confirm']);
  await page.waitForTimeout(500);
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
  expect(await signedIn(page)).toBe(false);
});

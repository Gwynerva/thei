import {
  expect,
  request as playwright,
  test,
  type Page,
} from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { E2E_ORIGIN } from './fixture-url';

/**
 * The relations block of a public page, as a stranger reads it: one tab per
 * kind that has anything, underlined along its top, and on a phone only the
 * chosen one keeps its words; each relation a card that says what it is to
 * the page's entity and why, the directed kinds first; and what the stranger
 * may not see, a codename that leads nowhere.
 */

const adminState = fileURLToPath(
  new URL('./.artifacts/admin.json', import.meta.url),
);

const stamp = Date.now();
const NOTE = 'Gave this project its maps';
let projectPath = '';

const content = (text: string) => ({
  data: { blocks: [{ type: 'paragraph', data: { text } }] },
});

/** Opens a page once it answers clicks and hovers. */
async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('html')).toHaveAttribute(
    'data-nuxt-hydrated',
    'true',
  );
}

test.beforeAll(async () => {
  const owner = await playwright.newContext({
    baseURL: E2E_ORIGIN,
    storageState: adminState,
  });
  async function post(path: string, data: Record<string, unknown>) {
    const body = await (await owner.post(path, { data })).json();
    expect(body.type, JSON.stringify(body)).toBe('success');
    return body;
  }
  const event = async (index: number, access: string) =>
    (
      await post('/api/admin/events', {
        title: `Harbour meeting ${index} ${stamp}`,
        summary: 'A meeting at the harbour.',
        access,
        humanReadableSlug: `harbour-meeting-${index}`,
        publicId: `hm${index}${stamp}`,
        content: content('Met.'),
        periods: [{ startDate: '2024-03-14', endDate: '2024-03-14' }],
      })
    ).eventUuid as string;
  const influencing = await event(1, 'public');
  const hidden = await event(2, 'private');
  const sibling = (
    await post('/api/admin/projects', {
      title: `Sibling project ${stamp}`,
      summary: 'Grew out of the same idea.',
      access: 'public',
      humanReadableSlug: 'sibling-project',
      publicId: `sp${stamp}`,
      showcase: false,
      cv: false,
      descriptionContent: content('Sibling.'),
    })
  ).projectUuid as string;
  await post('/api/admin/projects', {
    title: `Related in public ${stamp}`,
    summary: 'A project with relations a stranger reads.',
    access: 'public',
    humanReadableSlug: 'related-in-public',
    publicId: `rp${stamp}`,
    showcase: false,
    cv: false,
    descriptionContent: content('Related.'),
    relations: [
      { entityType: 'event', entityId: hidden, type: 'related' },
      {
        entityType: 'event',
        entityId: influencing,
        type: 'influencing',
        note: { type: 'shared', text: NOTE },
      },
      { entityType: 'project', entityId: sibling, type: 'related' },
    ],
  });
  projectPath = `/projects/related-in-public-rp${stamp}/`;
  await owner.dispose();
});

for (const width of [375, 1280]) {
  test(`relations read as cards under underlined tabs at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page, projectPath);
    const block = page.locator('#related-entities');
    await block.scrollIntoViewIfNeeded();

    const tabs = block.getByRole('tab');
    await expect(tabs).toHaveCount(2);
    await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
    await expect(tabs.nth(0).locator('[data-tab-label]')).toBeVisible();
    if (width < 640)
      await expect(tabs.nth(1).locator('[data-tab-label]')).toBeHidden();
    else await expect(tabs.nth(1).locator('[data-tab-label]')).toBeVisible();
    await expect(tabs.nth(1).locator('svg').first()).toBeVisible();

    const cards = block.locator('[data-relation-card]');
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText(`Sibling project ${stamp}`);
    // A plain relation says no word of its own: the block already does.
    await expect(cards.first().locator('[data-relation-label]')).toHaveCount(0);
    await expect(cards.first().locator('[data-relation-line]')).toContainText(
      'Grew out of the same idea.',
    );

    await tabs.nth(1).click();
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(tabs.nth(1).locator('[data-tab-label]')).toBeVisible();
    await expect(cards).toHaveCount(2);
    // The directed kinds first, its note said on the card itself.
    const first = cards.nth(0);
    await expect(first.locator('[data-relation-title]')).toHaveText(
      `Harbour meeting 1 ${stamp}`,
    );
    await expect(first.locator('[data-relation-label]')).toHaveText(
      'Influences',
    );
    await expect(first.locator('[data-relation-note]')).toHaveText(NOTE);
    // The word and the reason are one line under the name.
    await expect(first.locator('[data-relation-line]')).toContainText(
      `Influences · ${NOTE}`,
    );
    await expect(first).toHaveAttribute('href', /\/events\/harbour-meeting-1-/);
    // What a stranger may not see is a codename, never a link.
    const secret = cards.nth(1);
    await expect(secret).toHaveAttribute('data-public-secret', 'true');
    await expect(secret).not.toHaveAttribute('href');
    await expect(secret).not.toContainText(`Harbour meeting 2 ${stamp}`);
    await expect(secret.locator('[data-relation-label]')).toHaveCount(0);

    // The picture fills the card from its right edge; the words keep to
    // the left of it.
    const box = (await block.boundingBox())!;
    for (const card of await cards.all()) {
      const rect = (await card.boundingBox())!;
      expect(rect.x + rect.width).toBeLessThanOrEqual(box.x + box.width + 0.5);
      const media = (await card.locator('[data-card-media]').boundingBox())!;
      expect(
        Math.abs(media.x + media.width - (rect.x + rect.width)),
      ).toBeLessThan(2);
      const words = (await card.locator('[data-relation-text]').boundingBox())!;
      expect(words.x - rect.x).toBeLessThan(2);
      expect(words.width).toBeLessThanOrEqual(rect.width * 0.8 + 1);
    }
  });
}

test('the Markdown copy lists the relations as the page does: by kind, with the word and the reason', async ({
  request,
}) => {
  const response = await request.get(`${projectPath}index.md`);
  expect(response.ok()).toBe(true);
  const markdown = (await response.text()).replaceAll('\u00a0', ' ');
  const related = markdown.slice(markdown.indexOf('## Related entities'));
  // One list per kind, in the order of the tabs.
  expect(related.indexOf('### Projects')).toBeGreaterThan(-1);
  expect(related.indexOf('### Events')).toBeGreaterThan(
    related.indexOf('### Projects'),
  );
  expect(related).not.toMatch(/^### (Related|Depends on|Affects)$/m);
  const line = (title: string) =>
    related.split('\n').find((text) => text.startsWith(`- [${title}](`));
  // A directed relation says its word, run into the reason.
  expect(line(`Harbour meeting 1 ${stamp}`)).toMatch(
    new RegExp(`\\) — Influences · ${NOTE}$`),
  );
  // A plain one says no word: only what the entity says of itself.
  expect(line(`Sibling project ${stamp}`)).toMatch(
    /\) — Grew out of the same idea\.$/,
  );
  // What a stranger may not open is not in a copy for machines.
  expect(related).not.toContain(`Harbour meeting 2 ${stamp}`);
});

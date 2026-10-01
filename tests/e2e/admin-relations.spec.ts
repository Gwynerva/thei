import { expect, test, type Locator, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * The relations block of an edit form: a row reads as this entity, the
 * relation and the other one on a line of its own at any width, with the
 * whole width under it for the note; and the picker of a new relation
 * offers first what the entity's own text links to.
 */

test.use({
  storageState: fileURLToPath(
    new URL('./.artifacts/admin.json', import.meta.url),
  ),
});

let errors: string[] = [];

test.beforeEach(({ page }) => {
  errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

const content = (text: string) => ({
  data: { blocks: [{ type: 'paragraph', data: { text } }] },
});

const LONG_NOTE =
  'The harbour project gave this one its maps, its routes and most of the people who later carried it on';

async function createEvent(page: Page, stamp: number, index: number) {
  const response = await page.request.post('/api/admin/events', {
    data: {
      title: `Linked meeting ${index} ${stamp}`,
      summary: 'Named in a text.',
      access: 'public',
      humanReadableSlug: `linked-meeting-${index}`,
      publicId: `lm${index}${stamp}`,
      content: content('Met.'),
      periods: [{ startDate: '2024-03-14', endDate: '2024-03-14' }],
    },
  });
  const body = await response.json();
  expect(body.type, JSON.stringify(body)).toBe('success');
  return body.eventUuid as string;
}

async function createProject(page: Page) {
  const stamp = Date.now();
  const mentioned = await createEvent(page, stamp, 1);
  const related = await createEvent(page, stamp, 2);
  const shared = await createEvent(page, stamp, 3);
  const response = await page.request.post('/api/admin/projects', {
    data: {
      title: `Related things ${stamp}`,
      summary: 'A project with relations.',
      access: 'public',
      humanReadableSlug: 'related-things',
      publicId: `rel${stamp}`,
      showcase: false,
      cv: false,
      descriptionContent: content(
        `Started at <a data-content-link="entity" data-entity-type="event" data-entity-id="${mentioned}">the meeting</a>, after <a data-content-link="entity" data-entity-type="event" data-entity-id="${related}">another</a>.`,
      ),
      relations: [
        {
          entityType: 'event',
          entityId: related,
          type: 'influencing',
          note: { type: 'shared', text: LONG_NOTE },
        },
        {
          entityType: 'event',
          entityId: shared,
          type: 'related',
          note: {
            type: 'split',
            currentText: 'Why it matters here',
            relatedText: 'Why it matters there',
          },
        },
      ],
    },
  });
  const body = await response.json();
  expect(body.type, JSON.stringify(body)).toBe('success');
  return {
    projectUuid: body.projectUuid as string,
    mentioned,
    stamp,
  };
}

function overlaps(a: DOMRect, b: DOMRect) {
  return (
    a.left < b.right - 0.5 &&
    b.left < a.right - 0.5 &&
    a.top < b.bottom - 0.5 &&
    b.top < a.bottom - 0.5
  );
}

/** The boxes of a row: its first line's parts, its notes and its toggle. */
async function rowBoxes(row: Locator) {
  return row.evaluate((element) => {
    const rect = (node: Element | null) =>
      node ? node.getBoundingClientRect().toJSON() : null;
    const line = element.firstElementChild!;
    return {
      row: rect(element),
      line: [...line.children].map((child) => rect(child)),
      lineFits: line.scrollWidth <= line.clientWidth,
      notes: [...element.querySelectorAll('[data-relation-note]')].map((note) =>
        rect(note),
      ),
      split: rect(element.querySelector('[data-relation-split]')),
      label: (() => {
        const label = element.querySelector<HTMLElement>(
          '[data-relation-direction-label]',
        );
        return label
          ? {
              text: label.textContent,
              cut: label.scrollWidth > label.clientWidth,
              short: label.scrollWidth - label.clientWidth,
            }
          : null;
      })(),
    };
  });
}

for (const width of [320, 375, 1280]) {
  test(`a relation reads on one line and leaves its note the width at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const { projectUuid } = await createProject(page);
    await page.goto(`/admin/projects/${projectUuid}/edit/`);
    const rows = page.locator('[data-relation-row]');
    await expect(rows).toHaveCount(2);

    for (let index = 0; index < 2; index++) {
      const row = rows.nth(index);
      await row.scrollIntoViewIfNeeded();
      const boxes = await rowBoxes(row);
      expect(boxes.lineFits).toBe(true);
      const parts = boxes.line.filter(Boolean) as DOMRect[];
      // One line: every part sits at the same height, none on another.
      const middle = (box: DOMRect) => box.top + box.height / 2;
      for (const part of parts)
        expect(Math.abs(middle(part) - middle(parts[0]!))).toBeLessThan(3);
      for (let a = 0; a < parts.length; a++)
        for (let b = a + 1; b < parts.length; b++)
          expect(overlaps(parts[a]!, parts[b]!)).toBe(false);
      expect(boxes.label?.cut, JSON.stringify(boxes)).toBe(false);

      const split = boxes.split as DOMRect;
      for (const note of boxes.notes as DOMRect[]) {
        expect(overlaps(note, split)).toBe(false);
        // Below a split pair side by side, each note still has room.
        expect(note.width).toBeGreaterThan(
          width >= 640 ? 200 : (boxes.row as DOMRect).width * 0.7,
        );
      }
    }

    // On a phone the long note wraps, whole, rather than scrolls.
    const shared = rows.nth(0).locator('[data-relation-note="shared"]');
    await expect(shared).toHaveValue(LONG_NOTE);
    if (width < 640) {
      const single = await rows
        .nth(1)
        .locator('[data-relation-note="current"]')
        .boundingBox();
      const long = await shared.boundingBox();
      expect(long!.height).toBeGreaterThan(single!.height * 1.4);
      expect(
        await shared.evaluate(
          (element) => element.scrollHeight <= element.clientHeight + 1,
        ),
      ).toBe(true);
    }
  });
}

test('the kind of a relation is said between its two pictures', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 900 });
  const { projectUuid } = await createProject(page);
  await page.goto(`/admin/projects/${projectUuid}/edit/`);
  const row = page.locator('[data-relation-row]').first();
  const label = row.locator('[data-relation-direction-label]');
  await expect(label).toHaveCount(1);
  const before = await label.textContent();
  await row.getByRole('radio').first().click();
  await expect(row.getByRole('radio').first()).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(label).toHaveCount(1);
  await expect(label).not.toHaveText(before!);
  // The names are the pictures' to tell.
  await expect(row.locator('[data-relation-other]')).toHaveAttribute(
    'data-title-popup',
    /Linked meeting 2/,
  );
  await expect(row.locator('[data-relation-owner]')).toHaveAttribute(
    'data-title-popup',
    /Related things/,
  );
});

test('the picker offers first what the text links to, without growing', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const { projectUuid, stamp } = await createProject(page);
  await page.goto(`/admin/projects/${projectUuid}/edit/`);
  await expect(page.locator('[data-relation-row]')).toHaveCount(2);
  await page
    .getByRole('button', { name: /Add a relation|Добавить связь/ })
    .click();
  const options = page.getByRole('option');
  await expect(options.first()).toContainText(`Linked meeting 1 ${stamp}`);
  // Linked and already related is not offered again.
  await expect(
    page.getByRole('option', { name: new RegExp(`Linked meeting 2 ${stamp}`) }),
  ).toHaveCount(0);
  await expect(
    options.first().locator('[data-entity-search-mentioned]'),
  ).toHaveCount(1);
  await expect(
    options.nth(1).locator('[data-entity-search-mentioned]'),
  ).toHaveCount(0);
  await expect(options).toHaveCount(5);

  // Typing searches as before, and the mark goes.
  const search = page.getByRole('dialog').getByRole('combobox');
  await search.fill(`Linked meeting 3 ${stamp}`);
  await expect(options).toHaveCount(0);
  await search.fill('');
  await expect(options.first()).toContainText(`Linked meeting 1 ${stamp}`);

  await options.first().click();
  await expect(page.locator('[data-relation-row]')).toHaveCount(3);
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AiMessagePart } from '../../shared/ai';
import { askablePlace } from '../../shared/ai-field-ask';
import { askAtField, asksRunning } from '../../server/thei/ai/field-ask';
import { entityPanel } from '../../server/thei/ai/entity-panel';
import { turnsSettled } from '../../server/thei/ai/runner/queue';
import {
  findSession,
  sessionMessages,
} from '../../server/thei/ai/sessions/store';
import { startFakeModel, type FakeModel } from '../helpers/fake-model';
import {
  aiOnConfig,
  fakeModelSettings,
  freshAiTestDb,
} from '../helpers/fresh-ai-db';

/**
 * A field's ✦ asked about its field: a session of its own answers in the
 * background, told which field and with what to propose; what it proposes
 * waits at that field's label, and while it answers the form can tell.
 */
let context: Awaited<ReturnType<typeof freshAiTestDb>>;
let model: FakeModel | undefined;

const PROJECT = 'p-11111111-1111-4111-8111-111111111111';
const project = { kind: 'project', id: PROJECT } as const;

beforeEach(async () => {
  context = await freshAiTestDb();
  context.insert('profiles', { profileId: 'profile', displayName: 'Owner' });
  context.insert('projects', {
    projectUuid: PROJECT,
    title: 'Parapet',
    summary: 'A browser remake',
    access: 'public',
    humanReadableSlug: 'parapet',
    publicId: 'Parapet',
    createdAt: 1,
    updatedAt: 2,
  });
});

afterEach(async () => {
  await turnsSettled();
  await model?.close();
  model = undefined;
  await context.close();
});

async function useModel(script: Parameters<typeof startFakeModel>[0]) {
  model = await startFakeModel(script);
  Object.assign(context.server, {
    config: aiOnConfig({ model: fakeModelSettings(model) }),
  });
}

describe('an ask at a field’s ✦', () => {
  it('is answered about that field alone, and its proposal waits there', async () => {
    await useModel((request, index) =>
      index === 0
        ? {
            toolCalls: [
              {
                name: 'propose',
                input: {
                  actions: [
                    {
                      kind: 'field',
                      target: `project:${PROJECT}`,
                      field: 'summary',
                      value: 'A remake of a browser game',
                      reason: 'Shorter',
                    },
                  ],
                },
              },
            ],
          }
        : { text: 'Proposed a shorter summary.' },
    );
    const { sessionUuid } = askAtField({
      ref: `project:${PROJECT}`,
      place: 'field:summary',
      text: 'Make it shorter',
      current: 'A browser remake, typed again',
    });
    const session = findSession(sessionUuid)!;
    expect(session.origin).toBe('owner');
    expect(session.title).toContain('Parapet');
    const [message] = sessionMessages(sessionUuid);
    expect(message).toMatchObject({ role: 'owner', text: 'Make it shorter' });
    expect(message!.parts as AiMessagePart[]).toContainEqual({
      type: 'field',
      ref: `project:${PROJECT}`,
      place: 'field:summary',
    });
    const brief = JSON.stringify(message!.transcript);
    expect(brief).toContain('Make it shorter');
    expect(brief).toContain('propose it with field (field summary)');
    expect(brief).toContain('A browser remake, typed again');

    await turnsSettled();
    const panel = await entityPanel(project);
    expect(panel.offers.map((offer) => offer.place)).toEqual(['field:summary']);
    expect(panel.asking).toEqual([]);
  });

  it('is told while it runs, by place', async () => {
    let answer: (() => void) | undefined;
    await useModel(
      () =>
        new Promise((resolve) => {
          answer = () => resolve({ text: 'Nothing to change.' });
        }),
    );
    const { sessionUuid } = askAtField({
      ref: `project:${PROJECT}`,
      place: 'field:title',
      text: 'Propose a title',
    });
    for (let tries = 0; tries < 50 && !answer; tries++)
      await new Promise((resolve) => setTimeout(resolve, 20));
    expect(asksRunning(`project:${PROJECT}`)).toEqual([
      { place: 'field:title', sessionUuid },
    ]);
    answer!();
    await turnsSettled();
    expect(asksRunning(`project:${PROJECT}`)).toEqual([]);
  });

  it('asks nothing of a switch, of empty words, or of a file but its description', async () => {
    await useModel([{ text: 'Done.' }]);
    expect(askablePlace('field:cv')).toBe(false);
    expect(askablePlace('access')).toBe(false);
    expect(() =>
      askAtField({ ref: `project:${PROJECT}`, place: 'field:cv', text: 'Hm' }),
    ).toThrow();
    expect(() =>
      askAtField({
        ref: `project:${PROJECT}`,
        place: 'field:title',
        text: ' ',
      }),
    ).toThrow();
    expect(() =>
      askAtField({ ref: 'project:nope', place: 'field:title', text: 'Hm' }),
    ).toThrow();
  });
});

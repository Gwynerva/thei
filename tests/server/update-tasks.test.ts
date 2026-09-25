import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { createLedger, readLedger } from '../../update/migrations/ledger';
import {
  runUpdateTasks,
  TaskError,
  type UpdateTaskReporter,
} from '../../update/tasks/run';
import { updateTaskRegistry } from '../../update/tasks';
import {
  defineUpdateTask,
  type TheiUpdateTask,
} from '../../update/tasks/types';

let rawDb: Database.Database;
let events: string[];

const report: UpdateTaskReporter = {
  start: async (id) => void events.push(`start:${id}`),
  progress: async (id, text) => void events.push(`progress:${id}:${text}`),
  done: async (id) => void events.push(`done:${id}`),
  fail: async (id, message) => void events.push(`fail:${id}:${message}`),
};

const options = { languageCode: 'ru', log: () => {}, report };

function task(
  id: string,
  run: TheiUpdateTask['run'] = async () => {},
): TheiUpdateTask {
  return defineUpdateTask({
    id,
    version: '0.2.0',
    title: `Task ${id}`,
    progress: (done, total) => ({
      en: `${done} of ${total}`,
      ru: `${done} из ${total}`,
    }),
    run,
  });
}

beforeEach(() => {
  rawDb = new Database(':memory:');
  createLedger(rawDb);
  events = [];
});

afterEach(() => {
  rawDb.close();
});

describe('update tasks', () => {
  it('runs tasks in order and records each once it resolves', async () => {
    await runUpdateTasks(
      rawDb,
      [
        task('0.2.0/001-first', async ({ progress }) => {
          await progress(0, 2);
          await progress(2, 2);
        }),
        task('0.2.0/002-second'),
      ],
      options,
    );

    expect(events).toEqual([
      'start:task:0.2.0/001-first',
      'progress:task:0.2.0/001-first:0 из 2',
      'progress:task:0.2.0/001-first:2 из 2',
      'done:task:0.2.0/001-first',
      'start:task:0.2.0/002-second',
      'done:task:0.2.0/002-second',
    ]);
    expect(readLedger(rawDb).map((entry) => entry.id)).toEqual([
      'task:0.2.0/001-first',
      'task:0.2.0/002-second',
    ]);
  });

  it('stops at a task that throws and records nothing for it', async () => {
    let reached = false;
    const error = await runUpdateTasks(
      rawDb,
      [
        task('0.2.0/001-broken', async () => {
          throw new Error('ffmpeg is missing');
        }),
        task('0.2.0/002-after', async () => {
          reached = true;
        }),
      ],
      options,
    ).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(TaskError);
    expect((error as TaskError).taskId).toBe('0.2.0/001-broken');
    expect(events).toEqual([
      'start:task:0.2.0/001-broken',
      'fail:task:0.2.0/001-broken:ffmpeg is missing',
    ]);
    expect(reached).toBe(false);
    expect(readLedger(rawDb)).toEqual([]);
  });

  it('keeps the registry identified by release', () => {
    const ids = updateTaskRegistry.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of updateTaskRegistry) {
      expect(entry.id.startsWith(`${entry.version}/`)).toBe(true);
    }
  });
});

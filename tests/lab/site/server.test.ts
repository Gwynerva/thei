// The lab's own server, as the lab recognises it: a recorded process is
// stopped only while it is still the one recorded — the same PID with the
// same start — and a record whose numbers went to other processes after a
// restart is dropped without stopping anything.
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ownServer,
  stopOwnServer,
  type Processes,
  type ServerFiles,
  type ServerRecord,
} from './server';

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function files(port = 3003): ServerFiles {
  const dir = mkdtempSync(join(tmpdir(), 'thei-lab-server-'));
  made.push(dir);
  return {
    record: join(dir, 'site-server.json'),
    lock: join(dir, 'nuxt.lock'),
    port,
  };
}

/** A machine of made-up processes: PID → when it started. */
function machine(processes: Record<number, number>, answers = false) {
  const killed: number[] = [];
  const fake: Processes = {
    alive: (pid) => pid in processes,
    startedAt: (pid) => processes[pid],
    portAnswers: async () => answers && !killed.length,
    killTree: (pid) => killed.push(pid),
  };
  return { fake, killed };
}

function record(at: ServerFiles, value: Partial<ServerRecord>) {
  writeFileSync(
    at.record,
    JSON.stringify({
      pid: 100,
      port: at.port,
      startedAt: '2026-10-20T10:00:00.000Z',
      mode: 'dev',
      ...value,
    }),
  );
}

describe('the lab’s own server', () => {
  it('is its recorded processes while they started when they did', async () => {
    const at = files();
    record(at, {
      pid: 100,
      pidStartedAt: 1_000,
      serverPid: 200,
      serverStartedAt: 5_000,
    });
    const { fake, killed } = machine({ 100: 1_500, 200: 5_000 }, true);
    expect((await ownServer({ files: at, processes: fake }))?.pids).toEqual([
      100, 200,
    ]);
    expect(
      await stopOwnServer({ files: at, processes: fake, timeoutMs: 1000 }),
    ).toBe(true);
    expect(killed).toEqual([100, 200]);
    expect(existsSync(at.record)).toBe(false);
  });

  it('is not a process that took a recorded number after a restart', async () => {
    const at = files();
    record(at, {
      pid: 100,
      pidStartedAt: 1_000,
      serverPid: 200,
      serverStartedAt: 5_000,
    });
    // Both numbers are alive, given to processes that started a day later.
    const day = 24 * 60 * 60 * 1000;
    const { fake, killed } = machine({ 100: 1_000 + day, 200: 5_000 + day });
    expect(await ownServer({ files: at, processes: fake })).toBeUndefined();
    expect(await stopOwnServer({ files: at, processes: fake })).toBe(false);
    expect(killed).toEqual([]);
    expect(existsSync(at.record)).toBe(false);
  });

  it('stops only the recorded process that is still itself', async () => {
    const at = files();
    record(at, {
      pid: 100,
      pidStartedAt: 1_000,
      serverPid: 200,
      serverStartedAt: 5_000,
    });
    const { fake, killed } = machine({ 100: 1_000, 200: 99_000 });
    await stopOwnServer({ files: at, processes: fake, timeoutMs: 1000 });
    expect(killed).toEqual([100]);
  });

  it('is not a process whose start the system will not tell', async () => {
    const at = files();
    record(at, { pid: 100, pidStartedAt: 1_000, mode: 'build' });
    const { fake, killed } = machine({});
    fake.alive = () => true;
    expect(await stopOwnServer({ files: at, processes: fake })).toBe(false);
    expect(killed).toEqual([]);
  });

  it('knows a server recorded without starts by its lock, while the port answers', async () => {
    const at = files();
    record(at, { pid: 100, serverPid: 200 });
    const lock = (pid: number, port = at.port) =>
      writeFileSync(at.lock, JSON.stringify({ pid, port, startedAt: 0 }));

    lock(200);
    const answering = machine({ 100: 1, 200: 2 }, true);
    expect(
      (await ownServer({ files: at, processes: answering.fake }))?.pids,
    ).toEqual([200]);

    // The lock names another process: the record is stale.
    lock(300);
    const other = machine({ 100: 1, 200: 2, 300: 3 }, true);
    expect(
      await ownServer({ files: at, processes: other.fake }),
    ).toBeUndefined();
    expect(existsSync(at.record)).toBe(false);

    // The lock agrees, but nothing answers on the port.
    record(at, { pid: 100, serverPid: 200 });
    lock(200);
    const silent = machine({ 100: 1, 200: 2 }, false);
    expect(
      await ownServer({ files: at, processes: silent.fake }),
    ).toBeUndefined();
  });

  it('is not a server recorded on another port', async () => {
    const at = files(3203);
    record(at, { port: 3204, pid: 100, pidStartedAt: 1_000 });
    const { fake } = machine({ 100: 1_000 }, true);
    expect(await ownServer({ files: at, processes: fake })).toBeUndefined();
  });

  it('drops a record it cannot read', async () => {
    const at = files();
    writeFileSync(at.record, '{ half a reco');
    const { fake, killed } = machine({ 100: 1_000 }, true);
    expect(await stopOwnServer({ files: at, processes: fake })).toBe(false);
    expect(killed).toEqual([]);
    expect(existsSync(at.record)).toBe(false);
  });
});

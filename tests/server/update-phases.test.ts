import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  formatUpdatePhaseEvent,
  parseUpdatePhaseEvent,
  runUpdatePhases,
  selectUpdatePhases,
  type UpdatePhaseEvent,
} from '../../update/phases/run';
import {
  defineUpdatePhase,
  type UpdatePhaseContext,
} from '../../update/phases/types';
import { applyPhaseRunnerLine, createBuiltinSteps } from '../../update/process';
import { exec } from '../../update/exec';
import { updatePhaseRegistry } from '../../update/phases/index';
import sqliteDriver from '../../update/phases/0.0.3-sqlite-driver';
import nodeVersion, {
  satisfiesNodeRange,
  supportedNode,
} from '../../update/phases/0.0.6-node-version';
import { siteNode } from '../../update/phases/site-node';
import { createUpdateState } from '../../update/state';

let projectPath: string;

beforeEach(async () => {
  projectPath = await mkdtemp(join(tmpdir(), 'thei-update-phases-'));
  await mkdir(join(projectPath, 'content'));
  await writeFile(
    join(projectPath, 'content', 'thei.config.json'),
    JSON.stringify({ version: '0.1.0' }),
  );
});

afterEach(async () => {
  await rm(projectPath, { recursive: true, force: true });
});

const phase = (
  version: string,
  slug: string,
  run: (context: UpdatePhaseContext) => Promise<void> = async () => {},
) =>
  defineUpdatePhase({
    id: `${version}/001-${slug}`,
    version,
    title: { en: `Phase ${slug}`, ru: `Фаза ${slug}` },
    description: 'Plain English description',
    run,
  });

describe('update phases', () => {
  it('selects the phases between the installed and the target version', () => {
    const registry = [
      phase('0.1.0', 'old'),
      phase('0.2.0', 'middle'),
      phase('0.3.0', 'target'),
      phase('0.4.0', 'future'),
    ];
    expect(
      selectUpdatePhases(registry, '0.1.0', '0.3.0').map((item) => item.id),
    ).toEqual(['0.2.0/001-middle', '0.3.0/001-target']);
  });

  it('runs arbitrary work and reports it in order', async () => {
    const events: UpdatePhaseEvent[] = [];
    const succeeded = await runUpdatePhases({
      registry: [
        phase('0.2.0', 'files', async (context) => {
          await writeFile(context.contentPath('made-by-phase.txt'), 'yes');
          await context.writeConfig({
            ...(await context.readConfig()),
            migratedBy: 'phase',
          });
          context.log('wrote files');
        }),
      ],
      projectPath,
      theiPath: projectPath,
      fromVersion: '0.1.0',
      toVersion: '0.2.0',
      languageCode: 'ru',
      emit: (event) => events.push(event),
    });

    expect(succeeded).toBe(true);
    expect(events).toEqual([
      {
        type: 'plan',
        steps: [
          {
            id: '0.2.0/001-files',
            title: 'Фаза files',
            description: 'Plain English description',
          },
        ],
      },
      { type: 'start', id: '0.2.0/001-files' },
      { type: 'log', id: '0.2.0/001-files', message: 'wrote files' },
      { type: 'done', id: '0.2.0/001-files' },
    ]);
    expect(
      await readFile(join(projectPath, 'content', 'made-by-phase.txt'), 'utf8'),
    ).toBe('yes');
    expect(
      JSON.parse(
        await readFile(
          join(projectPath, 'content', 'thei.config.json'),
          'utf8',
        ),
      ),
    ).toEqual({ version: '0.1.0', migratedBy: 'phase' });
  });

  it('stops at the first failure', async () => {
    const events: UpdatePhaseEvent[] = [];
    const succeeded = await runUpdatePhases({
      registry: [
        phase('0.2.0', 'broken', async () => {
          throw new Error('disk full');
        }),
        phase('0.2.1', 'never', async () => {
          await writeFile(join(projectPath, 'never.txt'), '');
        }),
      ],
      projectPath,
      theiPath: projectPath,
      fromVersion: '0.1.0',
      toVersion: '0.3.0',
      emit: (event) => events.push(event),
    });

    expect(succeeded).toBe(false);
    expect(events.at(-1)).toEqual({
      type: 'fail',
      id: '0.2.0/001-broken',
      error: 'disk full',
    });
    expect(existsSync(join(projectPath, 'never.txt'))).toBe(false);
  });

  it('turns runner output into steps of the update', () => {
    const state = createUpdateState('0.1.0', '0.2.0', createBuiltinSteps('en'));
    const lines = [
      formatUpdatePhaseEvent({
        type: 'plan',
        steps: [{ id: 'x', title: 'Move uploads', description: 'Why' }],
      }),
      'bun: some unrelated output',
      formatUpdatePhaseEvent({ type: 'start', id: 'x' }),
      formatUpdatePhaseEvent({ type: 'log', id: 'x', message: 'moved 3' }),
      formatUpdatePhaseEvent({ type: 'fail', id: 'x', error: 'oops' }),
    ];
    for (const line of lines) applyPhaseRunnerLine(state, line);

    expect(state.steps.map((step) => step.id)).toEqual([
      'prepare',
      'dependencies',
      'phase:x',
      'build',
      'swap',
      'restart',
    ]);
    expect(state.steps[2]).toMatchObject({
      kind: 'phase',
      title: 'Move uploads',
      description: 'Why',
      status: 'failed',
      error: 'oops',
    });
    expect(state.log).toEqual([
      'bun: some unrelated output',
      'moved 3',
      'oops',
    ]);
  });

  it('ignores lines that only look like protocol', () => {
    expect(
      parseUpdatePhaseEvent('@@thei-update-phase {broken'),
    ).toBeUndefined();
    expect(parseUpdatePhaseEvent('plain')).toBeUndefined();
  });
});

const context = (
  exec: UpdatePhaseContext['exec'],
  languageCode?: string,
): UpdatePhaseContext => ({
  projectPath,
  theiPath: join(import.meta.dirname, '..', '..'),
  contentPath: (...parts) => join(projectPath, 'content', ...parts),
  fromVersion: '0.0.2',
  toVersion: '0.0.3',
  languageCode,
  readConfig: async () => ({}),
  writeConfig: async () => {},
  exec,
  log: () => {},
});

describe('the 0.0.3 check of the SQLite driver', () => {
  it('runs on the update from 0.0.2', () => {
    expect(
      selectUpdatePhases(updatePhaseRegistry, '0.0.2', '0.0.3').map(
        (item) => item.id,
      ),
    ).toEqual([sqliteDriver.id]);
    expect(selectUpdatePhases(updatePhaseRegistry, '0.0.3', '0.0.4')).toEqual(
      [],
    );
  });

  it('loads the driver with the script it ships', async () => {
    const calls: string[][] = [];
    await sqliteDriver.run(
      context(async (command, args) => {
        calls.push([command, ...args]);
        return exec(process.execPath, args, { cwd: projectPath });
      }),
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]![1]).toBe(
      join(import.meta.dirname, '..', '..', 'update', 'sqlite-driver.mjs'),
    );
  });

  it('stops the update, in the site language, when the driver does not run', async () => {
    const failing = async (): Promise<never> => {
      throw new Error('node exited with 1');
    };
    await expect(sqliteDriver.run(context(failing, 'ru'))).rejects.toThrow(
      /остаётся на текущей версии.*glibc 2\.34/,
    );
    await expect(sqliteDriver.run(context(failing))).rejects.toThrow(
      /keeps its current version.*glibc 2\.34/,
    );
  });
});

describe('the 0.0.6 check of the Node version', () => {
  const versions = {
    'v20.19.0': false,
    'v22.22.2': false,
    'v22.22.3': true,
    'v22.23.0': true,
    'v23.11.0': false,
    'v24.14.9': false,
    'v24.15.0': true,
    'v24.19.1': true,
    'v25.9.0': false,
    'v26.0.0': true,
    'v27.1.0': true,
  };
  const answering =
    (version: string): UpdatePhaseContext['exec'] =>
    async () => ({ code: 0, output: `${version}\n` });

  it('runs on every update that reaches 0.0.6', () => {
    expect(
      selectUpdatePhases(updatePhaseRegistry, '0.0.5', '0.0.6').map(
        (item) => item.id,
      ),
    ).toEqual([nodeVersion.id]);
    expect(
      selectUpdatePhases(updatePhaseRegistry, '0.0.2', '0.0.6').map(
        (item) => item.id,
      ),
    ).toEqual([sqliteDriver.id, nodeVersion.id]);
  });

  it('asks for what the installed Nuxt asks for', () => {
    const nuxt = createRequire(import.meta.url)('nuxt/package.json');
    expect(supportedNode).toBe(nuxt.engines.node);
  });

  it('reads the range the way Nuxt means it', () => {
    for (const [version, supported] of Object.entries(versions)) {
      expect([version, satisfiesNodeRange(version, supportedNode)]).toEqual([
        version,
        supported,
      ]);
    }
    expect(satisfiesNodeRange('24.15.0', supportedNode)).toBe(true);
    expect(satisfiesNodeRange('not a version', supportedNode)).toBe(false);
  });

  it('agrees with the installer', async () => {
    const installer = await readFile(
      join(import.meta.dirname, '..', '..', 'update', 'install.sh'),
      'utf8',
    );
    expect(/^NODE_RANGE='(.+)'$/m.exec(installer)?.[1]).toBe(supportedNode);
    const program = /node -e '([^']+)'/.exec(installer)![1]!;
    for (const [version, supported] of Object.entries(versions)) {
      let code: number | undefined;
      new Function('process', program)({
        versions: { node: version.slice(1) },
        exit: (value: number) => (code = value),
      });
      expect([version, code]).toEqual([version, supported ? 0 : 1]);
    }
  });

  it('asks the Node that runs the site', async () => {
    const calls: string[][] = [];
    await nodeVersion.run(
      context(async (command, args) => {
        calls.push([command, ...args]);
        return { code: 0, output: 'v24.15.0\n' };
      }),
    );
    expect(calls).toEqual([[siteNode(), '--version']]);
  });

  it('stops the update, in the site language, on an older Node', async () => {
    await expect(
      nodeVersion.run(context(answering('v24.11.0'), 'ru')),
    ).rejects.toThrow(/v24\.11\.0.*\^24\.15\.0.*остаётся на текущей версии/);
    await expect(
      nodeVersion.run(context(answering('v22.12.0'))),
    ).rejects.toThrow(/v22\.12\.0.*\^22\.22\.3.*keeps its current version/);
    await expect(
      nodeVersion.run(context(answering('v26.1.0'))),
    ).resolves.toBeUndefined();
  });
});

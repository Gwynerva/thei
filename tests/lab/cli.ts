// `bun run lab <command>`: the one door into the lab. Each part registers its
// commands in its own `commands.ts`; this file only routes, and adds the few
// commands that span every part.
import { existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  cacheDir,
  labHost,
  labOrigin,
  labPort,
  mainCheckout,
  paths,
  repoRoot,
  worktreeName,
} from './config';
import type { Commands, SiteIndex, StatusLine } from './types';
import { staleSeed } from './archive/dates';
import { playgroundIndex } from './site/playground';
import {
  claimPort,
  ownServer,
  siteIsOurs,
  startServer,
  stopOwnServer,
} from './site/server';
import { output, parse, portAnswers, readJson, readJsonIf } from './util';

interface Part {
  commands: Commands;
  status(): Promise<StatusLine[]>;
}

/**
 * Each part is loaded on its own: one that does not load (being edited, say)
 * loses its commands and says so, and the rest work.
 */
const broken: string[] = [];
async function loadPart(name: string): Promise<Part> {
  try {
    return (await import(`./${name}/commands.ts`)) as Part;
  } catch (error) {
    broken.push(`${name}: ${(error as Error).message.split('\n')[0]}`);
    return { commands: {}, status: async () => [] };
  }
}
const [archive, site, run, review, probe] = (await Promise.all(
  ['archive', 'site', 'run', 'review', 'probe'].map(loadPart),
)) as [Part, Part, Part, Part, Part];
const parts = { archive, site, run, review, probe };

const own: Commands = {
  status: {
    summary: 'Where everything is and what state it is in',
    usage: 'status [--stale-ok] [--json]',
    async run(args) {
      const { values } = parse(args, {
        json: { type: 'boolean' },
        'stale-ok': { type: 'boolean' },
      });
      const running = await portAnswers(labPort());
      const ours = running && (await siteIsOurs());
      const lines: StatusLine[] = [
        {
          part: 'lab',
          ok: true,
          text: worktreeName()
            ? `worktree ${worktreeName()} of ${mainCheckout()}`
            : `main checkout ${repoRoot}`,
        },
        { part: 'lab', ok: true, text: `cache ${cacheDir()}` },
        {
          part: 'site',
          ok: ours ? true : running ? false : 'warn',
          text: `${labOrigin()} ${
            ours
              ? 'answers'
              : running
                ? "answers, but not with this checkout's lab site"
                : 'is not running'
          }; content ${existsSync(paths.content) ? 'present' : 'absent'}`,
        },
        {
          part: 'archive',
          ok: existsSync(paths.lock) ? true : 'warn',
          text: existsSync(paths.lock)
            ? `pinned to ${readJson<{ version: string }>(paths.lock).version}`
            : 'no release pinned yet (tests/lab/archive.lock.json)',
        },
      ];
      // A site seeded on another day says "today" of that day.
      for (const [name, index] of [
        [
          'the lab site',
          readJsonIf<SiteIndex | undefined>(paths.siteIndex, undefined),
        ],
        ['the playground', playgroundIndex()],
      ] as const) {
        const stale = index && staleSeed(index.seedDay);
        if (stale)
          lines.push({
            part: 'site',
            ok: values['stale-ok'] ? 'warn' : false,
            text: `${name}: ${stale}`,
          });
      }
      for (const part of Object.values(parts))
        lines.push(...(await part.status()));
      output(values.json ?? false, lines, () =>
        lines.map(
          (line) =>
            `${line.ok === true ? '✓' : line.ok === 'warn' ? '!' : '✗'} ${line.part.padEnd(8)} ${line.text}`,
        ),
      );
      return lines.some((line) => line.ok === false) ? 1 : 0;
    },
  },
  build: {
    summary:
      'Seed the lab site and save it as a snapshot (starting and stopping its own server)',
    usage: 'build [--archive <dir>|conformance] [--fresh] [--today YYYY-MM-DD]',
    async run(args) {
      const { values } = parse(args, {
        archive: { type: 'string' },
        fresh: { type: 'boolean' },
        today: { type: 'string' },
      });
      const log = (message: string) => console.log(message);
      let own = await ownServer();
      if ((await claimPort(log)) === 'ours' && !own)
        throw new Error(
          `The lab site runs at ${labOrigin()}, and the lab did not start it: stop it, or run seed and snapshot save yourself.`,
        );
      if (values.fresh) {
        if (own) await stopOwnServer();
        own = undefined;
        rmSync(paths.content, {
          recursive: true,
          force: true,
          maxRetries: 20,
          retryDelay: 250,
        });
        rmSync(paths.siteIndex, { force: true });
      }
      // Started inside the try: whatever stops the build stops the server
      // it started too, and a start that fails stops what it started.
      let started = false;
      try {
        if (!own) {
          console.log('Starting the lab site');
          await startServer('dev', undefined, log);
          started = true;
        }
        const seedArgs = [
          ...(values.archive ? ['--archive', values.archive] : []),
          ...(values.today ? ['--today', values.today] : []),
        ];
        const seeded = await archive.commands.seed!.run(seedArgs);
        if (seeded) return seeded;
        return (await site.commands.snapshot!.run(['save'])) ?? 0;
      } finally {
        if (started) await stopOwnServer();
      }
    },
  },
  test: {
    summary: "Run the lab's own tests",
    usage: 'test',
    async run() {
      const steps: [string, string[]][] = [
        ['bun', ['x', 'vitest', 'run', 'tests/lab']],
        // The type tests (`*.test-d.ts`), and the lab's own code with them,
        // against the lab's tsconfig: the root one names no files.
        [
          'bun',
          [
            'x',
            'vitest',
            'run',
            'tests/lab',
            '--typecheck.enabled',
            '--typecheck.only',
            '--typecheck.tsconfig',
            'tests/lab/tsconfig.json',
          ],
        ],
      ];
      if (existsSync(`${repoRoot}/tests/lab/probe/playwright.config.ts`))
        steps.push([
          'bun',
          [
            'x',
            'playwright',
            'test',
            '-c',
            'tests/lab/probe/playwright.config.ts',
          ],
        ]);
      for (const [command, args] of steps) {
        const result = spawnSync(command, args, {
          cwd: repoRoot,
          stdio: 'inherit',
        });
        if (result.status !== 0) return result.status ?? 1;
      }
    },
  },
  clean: {
    summary: 'Remove plays and reviews (--runs)',
    usage: 'clean --runs',
    async run(args) {
      const { values } = parse(args, { runs: { type: 'boolean' } });
      if (!values.runs) {
        console.error(
          'Name what to remove: --runs. The shared cache is removed by hand.',
        );
        return 2;
      }
      rmSync(paths.runs, { recursive: true, force: true });
    },
  },
  help: {
    summary: 'This list',
    async run() {
      printHelp();
    },
  },
};

const commands: Commands = { ...own };
for (const [part, module] of Object.entries(parts))
  for (const [name, command] of Object.entries(module.commands)) {
    if (commands[name])
      throw new Error(`Command "${name}" of ${part} is taken`);
    commands[name] = command;
  }

function printHelp() {
  console.log(
    `bun run lab <command> — the lab site is ${labHost()}:${labPort()}\n`,
  );
  for (const [name, command] of Object.entries(commands))
    console.log(`  ${command.usage ?? name}\n      ${command.summary}`);
}

const [name, ...args] = process.argv.slice(2);
for (const reason of broken)
  console.error(`! A part of the lab did not load, ${reason}`);
const command = name ? commands[name] : undefined;
if (!command) {
  if (name) console.error(`Unknown command "${name}".\n`);
  printHelp();
  process.exit(name ? 2 : 0);
}
try {
  process.exit((await command.run(args)) ?? 0);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

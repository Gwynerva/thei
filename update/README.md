# Installing and updating Thei

Everything that installs, updates, migrates and restarts a Thei instance lives
in this folder.

## How a Thei instance is put together

Thei is a Nuxt layer — an engine. What you run on a server is a small host app
that extends it:

```
/opt/thei/
  nuxt.config.ts        extends the engine, nothing else
  package.json          pins the engine to a version tag
  content/              ALL of your data: database, uploads, settings
  node_modules/thei/    the engine itself, installed from a git tag
  .output/              the build that is currently serving
```

Only `content/` is yours. Everything else is rebuilt from the tag in
`package.json`, so `content/` is the only directory worth backing up.

## Install

On a fresh Debian or Ubuntu server, as root:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Gwynerva/thei/main/update/install.sh)
```

This installs Bun and Node.js, creates a `thei` system user, sets up `/opt/thei`
at the newest release, builds it, and starts it as a systemd service listening
on `127.0.0.1:3000`. When it finishes it prints the address to open — the setup
wizard runs in the browser.

Requirements: systemd, at least **2 GB of RAM** (a build runs alongside the
live site; add swap if you are short), and a few GB of disk.

Two runtimes are installed on purpose. **Bun** installs dependencies and builds
— it is much faster at both. **Node** runs the site, because `better-sqlite3` is
a native Node addon that does not load under Bun. The unit file records where
each one lives (`ExecStart` and `THEI_BUN`), so an update can find Bun even
though systemd's `PATH` does not include it.

You can override the defaults:

```bash
THEI_DIR=/srv/thei THEI_PORT=8080 bash <(curl -fsSL .../install.sh)
```

`THEI_DIR`, `THEI_USER`, `THEI_SERVICE`, `THEI_PORT`, `THEI_HOST`,
`THEI_REPOSITORY`, `THEI_VERSION`, `NODE_MAJOR`.

### Putting it on a domain

Thei binds to localhost, so put nginx in front of it. Copy
`instance/nginx.conf.example`, replace the domain, then run `certbot --nginx`
for TLS. The example file has the exact commands.

## Update

Open **Updates** in the admin panel. It shows the installed version, checks for
a newer release tag, and updates on one click.

Set up backups before you start — see below. The update itself never touches
`content/`, but a restore point costs nothing to have.

What happens when you press the button:

1. The instance manifest is repointed at the new tag, and the new engine is
   installed.
2. The new engine supplies its own instance manifest, which is applied and
   installed again — so a release can change its own requirements.
3. The new version's update phases run — scripted actions a release needs
   before it can start (see below).
4. The site is rebuilt into `.output.next`. **The old build keeps serving the
   whole time**, so visitors see nothing unusual.
5. The new build is swapped in — the old one is kept as `.output.prev` — and the
   process exits. systemd starts it again within seconds.
6. On the way up, the new engine applies any pending migrations.

The panel lists every step as it runs, including each phase and migration the
release brings.

The panel polls through the restart and reloads itself when the new version is
up. Losing connection for a few seconds is expected.

Updating and restarting are only offered when Thei is running as a managed
service — the panel detects this from `THEI_MANAGED` in the unit file. In a
development checkout both are disabled.

## When something goes wrong

**The build failed.** The site is still running the old version and nothing was
swapped in. Read the log on the update page and try again.

**The site will not start after an update.**

```bash
journalctl -u thei -n 50 --no-pager
```

Then either rebuild in place:

```bash
cd /opt/thei && sudo -u thei bun install && sudo -u thei bun run build
systemctl restart thei
```

or roll back to the previous build:

```bash
bash /opt/thei/node_modules/thei/update/rollback.sh
```

**"Thei needs attention" instead of the site.** A migration failed or the
content belongs to a newer version than the engine. The page names the
migration and the error. Nothing was changed — the database is still on the
last migration that succeeded. Fix the cause and restart the service; the
migration runs again from where it stopped.

Rollback does **not** undo migrations. If an update applied one, the older
engine will refuse to open the content and say so. Reinstall the newer version
instead.

## Backups

`content/` is the only directory that is yours, and it lives on one machine.
The engine does not push copies anywhere; instead it hands them out, and a
machine you control pulls them.

### Setting it up

1. Open **Settings → Backups** in the admin panel and generate a token. It is
   shown once.
2. Right away, download the client for the machine that will keep the copies:
   `thei-backup.cmd` for Windows, `thei-backup.sh` for Linux and macOS. Neither
   needs anything installed — PowerShell, `bash` and `curl` come with the
   system — and both arrive with the site address and the token filled in.
3. Run it, pick a destination folder, and install the weekly schedule.

The schedule fires daily and backs up only when a week has passed. That is what
lets a machine that was switched off at the appointed hour catch up on its own,
and what lets a manual backup restart the week without touching the scheduler.
It survives reboots: Task Scheduler starts a missed run when the machine is
back, systemd timers are persistent (and lingering is enabled for a user
timer), cron gets an `@reboot` entry, and launchd runs at login.

Before it downloads anything, a run compares the site with the last backup. If
it lost more than 30% of its files or size, the run stops without copying or
rotating anything and raises an alarm — the kind of drop an intrusion or a
broken update leaves behind. `backup/README.md` has the details.

Copies are named by when they finished:

```
auto-20260915T030000Z/     the three newest scheduled copies
manual-20260910T142233Z/   manual copies, kept until you delete them
```

Scheduled copies rotate three deep; a new one is renamed into place before the
oldest is removed, so the destination is never without a complete copy. Manual
copies do not take a slot and are never rotated out.

### What is in a copy, and what is not

|                                               |                                                              |
| --------------------------------------------- | ------------------------------------------------------------ |
| `thei.db`                                     | a consistent snapshot, taken through SQLite's own backup API |
| `thei.config.json`                            | version, language, access level, password hash               |
| `assets/`                                     | uploaded originals and every derived variant                 |
| `generated-media/`, `external-link-favicons/` | **not copied** — caches the site rebuilds on demand          |

A copy therefore contains your site's credentials. Keep the destination folder
somewhere you would be willing to keep a password file.

Anything else found in `content/` is listed as skipped and left alone. Nothing
the engine creates falls into that category, so if you see a name there, it is
worth knowing why it exists.

### Restoring

Stop the service, swap the directory, start it again:

```bash
systemctl stop thei
mv /opt/thei/content /opt/thei/content.broken
cp -a /path/to/backup/auto-20260915T030000Z /opt/thei/content
chown -R thei:thei /opt/thei/content
systemctl start thei
```

Three things that are easy to get wrong:

1. **Ownership.** The service runs as the `thei` user. A copy unpacked as root
   is not writable by it.
2. **Version.** Restore onto the same engine version or a newer one. A newer
   engine migrates the content on boot; an older one refuses to open it and
   says so.
3. **No journal files.** The snapshot is one whole database file. This is also
   why a copy made with a plain `cp` of a running instance is not safe to
   restore: it can capture the database mid-write.

A minute after startup the engine reconciles the database against the files on
disk, and the caches refill as pages are visited. Both are part of a restore,
not a fault.

### While a backup is running

Nothing needs to be stopped. The database snapshot is taken first and the file
list is walked after it, so the two halves agree: a file that appears later is
absent from the snapshot too, and a file reclaimed during the transfer is
garbage the snapshot either does not reference or references through a row the
restored instance clears itself. Files that were live when the snapshot was
taken are protected by cleanup's own 24 hour grace period, which is far longer
than a transfer. The weekly file sweep steps aside while a session is open so
the two are not walking the same tree at once.

Only one backup may run at a time. A session left open by a client that died,
or by a server restart, is reclaimed automatically.

## Phases and migrations

A release changes existing installations in two places, and each has its own
folder:

|                    | `phases/`                                 | `migrations/`                        |
| ------------------ | ----------------------------------------- | ------------------------------------ |
| Runs               | during the update, before the rebuild     | on boot of the new version           |
| Code comes from    | the version being installed               | the version being installed          |
| The site meanwhile | still served by the previous build        | down until migrations finish         |
| Recorded           | nowhere; runs on every update crossing it | in the `_thei_migrations` ledger     |
| Typical use        | files, config, tools, anything outside DB | schema and data changes that need it |

Both show up in **Updates** as steps with their own title and description,
between the pipeline's own steps (install, build, switch, restart).

### Texts

`title` and `description` are an `UpdateText`: a plain string — English is
fine — or translations keyed by language code:

```ts
title: 'Move covers into assets/',
title: { en: 'Move covers into assets/', ru: 'Перенос обложек в assets/' },
```

The panel shows the site's language, then English, then whatever translation
exists. Texts are resolved when a step is recorded, because the panel reading
the record belongs to the version being replaced.

### Update phases

Create `phases/<version>-<slug>.ts` and append it to `updatePhaseRegistry` in
`phases/index.ts`:

```ts
import { defineUpdatePhase } from './types';

export default defineUpdatePhase({
  id: '0.2.0/001-move-covers',
  version: '0.2.0',
  title: 'Move covers into assets/',
  description: 'Covers used to live in their own folder.',
  async run({ contentPath, readConfig, writeConfig, exec, log }) {
    // Anything: node:fs, the config, child processes, the network.
  },
});
```

An update from `A` to `B` runs, in registry order, every phase whose version
is newer than `A` and not newer than `B`. The pipeline starts them with
`bun node_modules/thei/update/phases/cli.ts`, that is with the code of the
version being installed, so a release can bring actions the previous version
has never heard of. The runner reports on stdout through a small line protocol
(`phases/run.ts`); the pipeline that reads it belongs to the older release, so
the protocol only ever gains optional fields.

Rules that matter:

- **The previous build is still serving.** Do not remove or rewrite anything it
  reads. Work that needs the new schema belongs in a migration.
- **A phase must be safe to repeat.** Nothing records that it ran: a failed or
  retried update runs it again over whatever the last attempt left behind.
- A failing phase stops the update before the build. Nothing is swapped in.

### Migrations

`migrations/` holds every database and content change Thei has ever shipped, in
order. `migrations/index.ts` is the registry — the upgrade path. An instance
records what it has applied in a `_thei_migrations` table, and on every boot the
engine applies whatever is missing.

A database created before any of this existed is adopted on first boot: the
version in `content/thei.config.json` decides which migrations it already
contains.

Create `migrations/<version>-<slug>.ts` and append it to `migrationRegistry` in
`migrations/index.ts`. A migration is one of two kinds.

**Transactional** — `up` is synchronous and runs inside a transaction together
with its ledger row:

```ts
import { defineMigration } from './types';

export default defineMigration({
  id: '0.2.0/001-add-project-color',
  version: '0.2.0',
  title: 'Add a color to projects',
  up({ rawDb }) {
    rawDb.prepare('ALTER TABLE `projects` ADD COLUMN `color` text').run();
  },
});
```

**Scripted** — `run` is asynchronous, has no transaction around it, and is
recorded only once it resolves:

```ts
export default defineMigration({
  id: '0.2.0/002-split-avatars',
  version: '0.2.0',
  title: { en: 'Split avatars', ru: 'Разделение аватаров' },
  async run({ rawDb, contentPath, readConfig, writeConfig, log }) {
    // Files, the config, child processes — then SQL through rawDb.
  },
});
```

Rules that matter:

- **Raw SQL only.** Never import the Drizzle schema. That schema describes the
  current release; a migration has to keep describing the database as it was
  when the migration was written, forever.
- **A migration is immutable once released.** Its `id` is recorded in every
  instance's ledger. To change something, add a new migration.
- **File operations must be repeatable.** A transactional migration rolls its
  SQL back on failure, but a write to `content/` is not rolled back with it:
  keep `up` synchronous and use the synchronous `node:fs` calls, because
  anything deferred to a promise escapes the transaction. A scripted migration
  is retried from the start on the next boot after a failure. Either way, write
  the file half so that running it over a half-finished state is a no-op.
- **Update the baseline too.** `0.0.1-baseline.ts` is what a brand-new install
  starts from, and it must end up identical to an upgraded database. Run
  `bun run db:baseline` after changing the Drizzle schema.
  `tests/server/migrations-baseline.test.ts` fails if the two drift apart.
- **Never re-encode media in a migration.** A migration runs inside boot, with
  the site down and a supervisor that restarts the process if it fails.
  Reprocessing thousands of files there turns an update into an outage of
  unknown length. Stored files describe themselves through their own
  `extension`, `size`, and `meta`, so a library holding output from several
  releases is a normal library, not one that needs repairing. Moving or renaming
  files is fine; decoding and re-encoding them is not. If bulk re-encoding is
  ever genuinely wanted, build it as an opt-in, resumable background job in the
  admin panel.

## Cutting a release

1. Update the Drizzle schema, then `bun run db:baseline`.
2. Add a migration for the change, and an update phase for anything that has
   to happen outside boot. Register both.
3. `bun vitest run` — the baseline drift test must pass.
4. Bump `version` in the engine's `package.json`. It must match the tag.
5. `git tag v0.2.0 && git push --tags`.

Instances see the new tag within five minutes of their next check, or
immediately when someone presses **Check for updates**.

Only `major.minor.patch` tags are offered as updates; prerelease tags such as
`v0.3.0-rc.1` are ignored.

## Files here

| Path          | What it is                                                     |
| ------------- | -------------------------------------------------------------- |
| `install.sh`  | The one-line installer.                                        |
| `rollback.sh` | Restores the previous build and manifest.                      |
| `instance/`   | Templates for the files the installer writes into an instance. |
| `migrations/` | Every schema and data change, plus the runner and the ledger.  |
| `phases/`     | Scripted update phases, their runner and its line protocol.    |
| `process.ts`  | The update procedure: install, phases, build, swap, restart.   |
| `remote.ts`   | Finds the newest release tag.                                  |
| `state.ts`    | The progress file the panel polls, which survives the restart. |
| `text.ts`     | Step titles: a plain string or translations by language.       |
| `output.ts`   | Swaps a staged build into place and repoints Nitro's links.    |
| `semver.ts`   | Version comparison.                                            |
| `scripts/`    | `generate-baseline.mts`, run by `bun run db:baseline`.         |

The backup client itself lives outside this folder, in `backup/`.

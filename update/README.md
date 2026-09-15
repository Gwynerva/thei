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

There is no backup step. If you want one, copy `content/` before you start:

```bash
systemctl stop thei
cp -a /opt/thei/content /opt/thei/content.backup
systemctl start thei
```

What happens when you press the button:

1. The instance manifest is repointed at the new tag, and the new engine is
   installed.
2. The new engine supplies its own instance manifest, which is applied and
   installed again — so a release can change its own requirements.
3. The site is rebuilt into `.output.next`. **The old build keeps serving the
   whole time**, so visitors see nothing unusual.
4. The new build is swapped in — the old one is kept as `.output.prev` — and the
   process exits. systemd starts it again within seconds.
5. On the way up, the new engine applies any pending database migrations.

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

## Migrations

`migrations/` holds every schema change Thei has ever shipped, in order.
`migrations/index.ts` is the registry — the upgrade path. An instance records
what it has applied in a `_thei_migrations` table, and on every boot the engine
applies whatever is missing.

A database created before any of this existed is adopted on first boot: the
version in `content/thei.config.json` decides which migrations it already
contains.

### Writing one

Create `migrations/<version>-<slug>.ts`:

```ts
import { defineMigration } from './types';

export default defineMigration({
  id: '0.2.0/001-add-project-color',
  version: '0.2.0',
  description: 'Add a color column to projects.',
  up({ rawDb }) {
    rawDb.prepare('ALTER TABLE `projects` ADD COLUMN `color` text').run();
  },
});
```

Then append it to `migrationRegistry` in `migrations/index.ts`.

Rules that matter:

- **Raw SQL only.** Never import the Drizzle schema. That schema describes the
  current release; a migration has to keep describing the database as it was
  when the migration was written, forever.
- **A migration is immutable once released.** Its `id` is recorded in every
  instance's ledger. To change something, add a new migration.
- **File operations should be repeatable.** Each migration's SQL and its ledger
  row commit in one transaction, so SQL either fully applies or does not — but
  a write to `content/` cannot be rolled back with it. Keep `up` synchronous
  and use the synchronous `node:fs` calls: the transaction commits when `up`
  returns, so file work done inside it is covered by the same rollback, while
  anything deferred to a promise escapes the transaction and can leave the
  database and the disk disagreeing. Write the file half so that re-running it
  over a half-finished state is a no-op.
- **Update the baseline too.** `0.0.1-baseline.ts` is what a brand-new install
  starts from, and it must end up identical to an upgraded database. Run
  `bun run db:baseline` after changing the Drizzle schema.
  `tests/server/migrations-baseline.test.ts` fails if the two drift apart.
- **Never re-encode media in a migration.** A migration runs inside boot, in one
  transaction, with the site down and a supervisor that restarts the process if
  it fails. Reprocessing thousands of files there turns an update into an
  outage of unknown length. Stored files describe themselves through their own
  `extension`, `size`, and `meta`, so a library holding output from several
  releases is a normal library, not one that needs repairing. Moving or renaming
  files is fine; decoding and re-encoding them is not. If bulk re-encoding is
  ever genuinely wanted, build it as an opt-in, resumable background job in the
  admin panel.

## Cutting a release

1. Update the Drizzle schema, then `bun run db:baseline`.
2. Add a migration for the change and register it.
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
| `migrations/` | Every schema change, plus the runner and the ledger.           |
| `process.ts`  | The update procedure: install, build, swap, restart.           |
| `remote.ts`   | Finds the newest release tag.                                  |
| `state.ts`    | The progress file the panel polls, which survives the restart. |
| `output.ts`   | Swaps a staged build into place and repoints Nitro's links.    |
| `semver.ts`   | Version comparison.                                            |
| `scripts/`    | `generate-baseline.mts`, run by `bun run db:baseline`.         |

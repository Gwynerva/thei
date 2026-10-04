# Release bench

Installs, updates, backs up and restores Thei the way a real server does, in
Docker containers that stand in for a fresh Debian VPS with systemd. Run it
before tagging a release (`update/README.md`, "Cutting a release").

```sh
bun run test:release                     # every scenario, side by side
bun run test:release backup --keep       # one scenario, containers left running
bun run test:release --full              # as a fresh VPS: before tagging a release
```

Needs Docker, and network access from the containers to bun.sh, NodeSource and
the npm registry. Everything else comes from this repository: the bench needs
no data from outside it.

Two modes:

- **Quick** (default). Servers start from an image with Bun and Node already
  installed, keep a package cache per scenario between runs (Docker volumes
  `thei-bench-bun-*`), have no memory limit, and scenarios run side by side.
  The first run downloads the packages; later ones take a few minutes, most of
  it the builds.
- **`--full`**. Every server is a bare Debian: the installer fetches Bun, Node
  and every package itself, the server has 2 GB of memory and 2 GB of swap,
  and scenarios run one at a time. This is what a release has to pass; it
  takes about half an hour, mostly downloads.

## What it installs from

A bare clone of this repository, copied into every container as
`/srv/thei.git` and installed from with `THEI_REPOSITORY=file:///srv/thei.git`.
Nothing is pushed anywhere and no tag is created in this repository:

- released tags come along with the clone; the newest of them is the **last
  release**, which every update starts from;
- the **version under test** is the working tree as it is, uncommitted and
  untracked files included. It is tagged with the version in `package.json`
  when that is above the last release, and as the patch after it otherwise:
  the version is bumped only when a release is cut. No existing tag is moved;
- `next-release` adds a synthetic release after it, with one phase, one
  migration, one task and a changed instance template. Each step fails while
  a marker file sits in `content/`.

## The seed site

`upgrade`, `backup` and `recovery` work on a site the bench makes itself, in
`seed.ts`: the last release is installed and filled through its own admin API
with one of everything a site holds — each kind of entity at each access
level, sections with several periods, every content block, tags, relations,
statuses and files of each type in each place a file can go. Its `content/`
is then copied out once and restored wherever a scenario needs it. Links in
it point at an address the server refuses to fetch, so it never reaches the
network.

The same check runs on it wherever it lands: every entity opens with its name
and parts, every file serves the bytes it was stored with, every address it
had still answers, and nothing private is listed.

The seed speaks the last release's API. When a release changes one of the
requests it makes, `seed.ts` follows once that release is out.

## Scenarios

| Scenario       | What it proves                                                                                                                                                                                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `seed`         | The last release makes the seed site through its own API. Runs by itself whenever a scenario below needs it; the others install meanwhile.                                                                                                                            |
| `fresh`        | The installer sets up a working site even without better-sqlite3's download, which it compiles from local headers; media processing works; a restart before the setup wizard does no harm; a second installation is refused; every page and its Markdown twin answer. |
| `upgrade`      | The seed site on the last release, updated through that release's own panel: every step done, nothing lost, settings open, every page answers.                                                                                                                        |
| `backup`       | The backup client end to end: copies, hashes, shared files, the schedule, rotation, alarms, interruption, both schedulers, the last release's client, restores.                                                                                                       |
| `next-release` | The update the version under test will drive: a failing phase leaves the site as it was, a failing migration closes it on its step, and trying again finishes.                                                                                                        |
| `recovery`     | The way back: this installer installs the last release, and the site as it was on that release restores onto it.                                                                                                                                                      |

## Ports and cleanup

Containers publish the site on `127.0.0.1:3100`–`3105` for a person looking
at a kept one; the bench itself talks to them from inside, and the seed
server publishes nothing. They are removed after each scenario unless
`--keep` is given; remove kept ones with
`docker rm -f $(docker ps -aq --filter name=thei-bench-)`.

Logs, timelines and results go to `tests/release/.artifacts/`, which every run
starts afresh. The working copies of the repository and the seed site are
removed after a run, unless `--keep` is given.

The Windows backup client, `backup/thei-backup.cmd`, has no automated test:
it is checked by hand on a Windows machine.

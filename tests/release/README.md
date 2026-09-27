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
the npm registry.

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

- released tags come along with the clone;
- the version under test is the working tree as it is, uncommitted and
  untracked files included, tagged with the version in `package.json`;
- `next-release` adds a synthetic release after it, with one phase, one
  migration, one task and a changed instance template. Each step fails while
  a marker file sits in `content/`.

## Scenarios

| Scenario       | What it proves                                                                                                                                                       |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fresh`        | The installer sets up a working site; a restart before the setup wizard does no harm; a second installation is refused; every page and its Markdown twin answer.     |
| `upgrade-real` | A copy of a real site on the last release, updated through that release's own panel: every step done, nothing lost, settings open, every page answers.             |
| `backup`       | The backup client end to end: copies, hashes, shared files, the schedule, rotation, alarms, interruption, both schedulers, the last release's client, restores.      |
| `next-release` | The update the version under test will drive: a failing phase leaves the site as it was, a failing migration closes it on its step, and trying again finishes.       |
| `recovery`     | The way back: this installer installs the last release, and the backup made before an update restores onto it.                                                       |

`upgrade-real`, `backup` and `recovery` need a copy of a real site made by the
backup client on the last release:

```sh
THEI_BENCH_REAL_COPY=/path/to/manual-20260926T180636Z bun run test:release
```

The copy is only read. In the container its secret phrase is replaced, a
bench password is added as `password.fallback` beside the real password hash,
and its site address is cleared, so nothing in the bench ever talks to the
real site.

## Ports and cleanup

Containers publish the site on `127.0.0.1:3100`–`3105`. They are removed after
each scenario unless `--keep` is given; remove kept ones with
`docker rm -f $(docker ps -aq --filter name=thei-bench-)`.

Logs, timelines and counts go to `tests/release/.artifacts/`. The working
copies of the repository the bench builds its releases from are removed after
a run, unless `--keep` is given.

The Windows backup client is exercised on a Windows machine instead: see
`backup/README.md`.

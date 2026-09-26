<div align="center">

<img src=".github/logo.svg" alt="Thei" width="88">

# Thei

**🗃️ Digital archive of your life — a résumé and a diary in one place.**

</div>

You bring the data of your life. Thei keeps it, puts it in order and shows it in
the best light it can.

**Thei** is a self-hosted site for one person. It holds the big things you have
built and lived through, and the small moments you would hate to forget — side
by side, on one timeline, on a machine you control. Show a potential employer
the projects that matter, and keep the evening that mattered only to you.

## Three kinds of memories

Simplest first. Each one asks more of you than the last, and gives more back.

- **Diary entries** are single thoughts with a date on them. No title, no
  summary, no tags — one entry a day, addressed by the day itself
  (`/diary/2026-04-28/`). Written in passing, in under a minute, and kept
  public or private as you like. An entry can say what it is about by
  relating itself to a project or an event.
- **Events** are the small moments worth writing up: a meetup, a trip, a first
  release, a strange day. Too small or too loose to be a project, too good to
  lose. An event has dates, media and tags, relates to projects, other
  events and diary entries, but it stands on its own.
- **Projects** are the big episodes: self-contained, structured and substantial.
  A project is told through its own **stages** — dated periods of work — and
  **sections** — topical write-ups — with media, a showcase, files, links and
  relations to other projects, events and diary entries. Mark the ones that
  belong in your CV or in the showcase on the home page.
- **Relations** run between any two of these: "related", "depends on" or
  "affects", with a note on why, drawn from either side and seen from both.

Around them:

- **Life** — one timeline of everything dated: events, diary entries, project
  stages, pages, avatar and status changes. **Rewind** shows this same day in
  previous years.
- **Pages** — standalone writing that belongs to no timeline.
- **Tags** — the threads running through projects and events.

## What is inside

- **Block editor** — Editor.js with content snapshots, so nothing is lost;
  private sections inside public text; pasted YouTube links become players.
- **Media library** — content-addressed storage with deduplication and reuse
  tracking, image and video derivatives via sharp and ffmpeg, uploads streamed
  to disk up to 500 MB.
- **Access levels** — the whole site open or closed, and every project, event,
  diary entry, page and file public, link-only or private on its own.
- **Admin panel** — settings, visuals (theme, accent colour, font), multilanguage
  interface, one-click updates, backups.

## Install

On a fresh Debian or Ubuntu server, as root:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Gwynerva/thei/main/update/install.sh)
```

It installs the runtimes, sets up `/opt/thei` at the newest release, builds it
and starts it as a systemd service on `127.0.0.1:3000`. Then open the address it
prints — the setup wizard runs in the browser. Put nginx in front of it for a
domain and TLS.

Requirements: systemd, 2 GB of RAM, a few GB of disk.

→ [Installing, updating, backups and migrations](update/README.md)

## Updating

**Updates** in the admin panel checks for a newer release and installs it on one
click. The old build keeps serving while the new one compiles, a release's own
update phases and migrations run as listed steps, and the previous build is kept
for rollback.

## Backups

`content/` is the only directory that is yours. The engine hands copies out and
a machine you control pulls them: generate a token in **Settings → Backups**,
download the [backup client](backup/README.md) for Windows or Linux/macOS —
nothing to install — and let it run weekly. It stops and raises the alarm
instead of rotating out a good copy when the site suddenly shrinks.

## Development

```bash
bun install
bun run dev
```

The dev server runs the `.playground` app on port 3000, with the same setup
wizard as a real instance.

```bash
bun run test        # unit tests
bun run test:e2e    # browser regressions on port 3001, see tests/e2e/README.md
bun run typecheck
bun run format
```

The engine is consumed as a Nuxt layer from `node_modules/thei`, installed in
place over sites that already hold real content. [AGENTS.md](AGENTS.md) collects
the rules that follow from that — migrations, file storage, boot, styling — and
is worth reading before a first change.

## License

[MIT](LICENSE) © Gwynerva

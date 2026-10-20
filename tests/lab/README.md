# The lab

One large fictional archive, a site seeded from it, and a way to try any
change of Thei on it: scenarios played in a real browser by personas, a
probe that measures every screen for overlaps, cut-off text, almost-aligned
edges and uneven gaps, and reviewers — one per job — who judge what the
person saw. The same seeded site is also the playground's everyday content.

Everything here is in English — the archive, the personas, the tasks, the
briefs, the reviews and the reports — so that anyone can use it. The lab
site therefore runs Thei's English interface.

```sh
bun run lab help
bun run lab status
```

## The archive

The data lives in its own repository,
[`Gwynerva/thei-lab-archive`](https://github.com/Gwynerva/thei-lab-archive),
in a format of its own (its `FORMAT.md`): Markdown and YAML, one file per
entity, ten years of one life, about a thousand files. It never names a
uuid or a table, so Thei can change under it.

- `archive.lock.json` pins the release this checkout reads.
- `archive/` is the adapter: it reads the format, turns Lab Markdown into
  Thei's blocks, and seeds a site through the admin's own routes, finding
  what exists and saving only what changed. It changes with the admin API.
- `archive/conformance/` is a tiny archive in the same format with every
  construct, for offline tests and for a quick site
  (`bun run lab build --archive conformance`).
- `THEI_LAB_ARCHIVE=<checkout>` reads a local checkout of the archive
  instead of the pinned release.

## The site and its snapshots

The lab site is `.lab/site/` (like `.playground/`), at
`http://lab.localhost:3003`; a worktree gets a host name and a port of its
own (`bun run lab status` says which). Its content is restored from a
snapshot in seconds: the database is copied, the files are hard links into
the shared cache `<main checkout>/.lab/cache/` (`THEI_LAB_CACHE`), which
every worktree of the checkout uses.

- `bun run lab build` seeds the lab site and saves a snapshot, starting and
  stopping a server of its own.
- `bun run lab up lab [--start]` puts a snapshot in place for the lab site;
  `bun run lab stop` stops a server the lab started.
- `bun run lab up playground` makes the archive the playground's content —
  its everyday data, not only for studies. The playground's own content goes
  to `.lab/stash/` once; its secrets, AI settings and sign-ins stay.
  `bun run lab down playground` brings its own content back.

The lab never stops a server it did not start: stop it first.

## Studies

A **study** asks one question — "can a newcomer write today's entry?" — and
answers it with **scenarios**, each played by **personas** on a phone and a
computer, in light and dark.

- `personas/*.md` — presets: the **Novice** and the **Expert** owner, the
  **Guest** and the **Regular reader** visitor, and the **Designer**, a lens
  that judges only how the screens look against `docs/design/`. A new preset
  is a new file.
- `studies/<id>/` — studies kept in git, **only with the owner's agreement**.
  Studies of the moment live in `.lab/studies/<id>/`, never committed
  (`bun run lab new-study <id>`).
- A scenario finds things the way a person does: by role and name, by
  visible words — CSS-drawn ones too — or by label; never by `data-*` or a
  class. It chooses what to work on by facts and planted traits of the site
  index, never by an id it knows.
- A **job** is one scenario for one persona; it is reviewed as a whole, both
  screens at once. A job waits for a review when its latest plays are not
  the ones its review saw, so replaying one scenario for one persona on one
  screen makes only that job wait.

## The loop

```sh
bun run lab up lab --start                           # a clean site
bun run lab play demo                                # every job
bun run lab jobs demo --pending --json               # briefs for the reviewers
#   → the `lab-review` workflow: one `lab-reviewer` agent per job (/lab)
bun run lab validate demo
bun run lab report demo                              # .lab/runs/demo/report/index.html
# fix, then replay only what the fix touches:
bun run lab play demo --scenario diary-today --persona novice --variant pl
```

A play records every step: the screenshot with the pointer's way drawn on
it, what was clicked and how far the pointer travelled, scrolling, waits,
and the probe's findings with close-ups. A reviewer reads only that — never
the code — and answers in `review.json`: scores per criterion and screen,
findings by severity, and a verdict on each of the probe's suspicions.

## Folders

| Path                       | What                                           | In git |
| -------------------------- | ---------------------------------------------- | ------ |
| `tests/lab/`               | the lab                                        | yes    |
| `.lab/site/nuxt.config.ts` | the lab site                                   | yes    |
| `.lab/site/content/`       | what the site holds                            | no     |
| `.lab/site-index.json`     | what the site was seeded with, by archive refs | no     |
| `.lab/runs/<study>/`       | plays, reviews, reports                        | no     |
| `.lab/studies/<id>/`       | studies of the moment                          | no     |
| `.lab/stash/playground/`   | the playground's own content, while swapped    | no     |
| `<main>/.lab/cache/`       | releases, files by hash, snapshots             | no     |

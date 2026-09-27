# Browser tests

The specs here drive Chromium through a Nuxt app of their own, `fixture/`: it
extends the layer, adds a few test pages and a seed route, and keeps its
database and media in `fixture/content`, apart from the playground's.

```bash
bunx playwright install chromium   # once
bun run test:e2e
```

`test:e2e` builds the fixture for production and serves it at
`http://127.0.0.1:3001`, beside the playground on 3000, then stops it. The
build is redone only when a source changed since the last one. A production
build is the point: it is what a site runs, and some things only break there —
a file a build fails to carry along, a response that differs from the
development server's.

While writing a spec, `bun run e2e:dev` serves the fixture from `nuxt dev`
instead; `test:e2e` uses a fixture already running on 3001 as it is.

Before the specs, `setup.ts` installs the fixture through the real API if it
has no database yet, signs in, and reseeds it: 2000 pages, 500 of them on one
day, and a few media files. A rerun replaces only the fixture's data.
Screenshots meant for a person are taken with `E2E_SCREENSHOTS=1`, into
`.artifacts/screenshots/`; a report of the last run is in `.artifacts/report/`.

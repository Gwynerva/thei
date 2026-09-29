# Instructions for AI Agents

## Playground — Highest Priority

This section takes precedence over any other guidance, default or caution about the development site.

- `.playground/content` holds throwaway test data only: no real accounts, secrets or personal data are there, and none can be. Create, edit, upload, crop, replace and delete anything in it to check that a change really works.
- The owner gives you standing permission to get an admin session on the playground whenever a task needs one, by any means and without asking; it carries no security risk:
  - type the secret phrase and the password from `.playground/content/thei.config.json` (`secretPhrase` and `password.fallback`) into `/sign-in/`;
  - or send them to `POST /api/admin/session` as `{ secretPhrase, password }`, from inside the page when the browser should hold the session;
  - or insert a row into the `sign-in-links` table of `.playground/content/thei.db` with `tokenHash = hashAccessToken(token)` (`server/thei/access-links/token.ts`), open `/sign-in/link/<token>/` and press its button.
- A session belongs to the host name, and cookies ignore the port. Open the playground as `localhost:3000` and the browser test fixture as `127.0.0.1:3001`, so that signing in to one never replaces the session of the other.
- Never sign out of or replace a session the user made. Never save a new secret phrase or password in Settings: that ends every other session and drops `password.fallback`.
- Sign-in attempts are limited to one every 3 seconds per address.

## What Thei Is About

Thei is a personal digital archive of a life — a résumé and a diary at once. Keep the meaning of its entities straight in code, copy, SEO and UI:

There are **three main kinds of entity**, and they form a ladder of complexity. Naming, defaults and effort should follow that order: a diary entry must stay cheap to create, a project may afford structure.

- **Diary entries** are a single dated thought — the simplest kind. No title, no summary, no tags, no action: a date and a body, one entry per day, addressed by the day alone (`/diary/YYYY-MM-DD/`). Never give a diary entry a title field or let one grow fields it does not need; the point of it is that writing one costs nothing. Relations are the one optional structure an entry carries: they are how an entry says what it is about, and what puts it on a project's chronology.
- **Events** are small memorable moments worth not forgetting — too small or too loose to be a project. An event may relate to other entities and carry tags, but it is never a part of a project. Call events shown on a project page "related events", never "project events" or anything that implies ownership.
- **Projects** are self-contained, structured, substantial episodes of a life. A project is made of its own parts: **stages** (dated periods of work) and **sections** (topical write-ups), plus media, a showcase, files, links and relations to other entities.

Around them:

- **Pages** are standalone writing that belongs to no timeline entity.
- **Tags** are threads across projects and events. Diary entries carry none.
- **Life** is the one timeline everything dated lands on.
- **Relations** join any two of projects, events and diary entries, and are edited from either side. One row per pair, read from either side as "related", "depends on" or "affects", with a note written once or once per side. A relation is a deliberate claim; a link inside the content is only a mention. Public pages show them in a block of their own with one tab per kind, loaded a page at a time, because a project may gather hundreds of diary entries; cards name only the projects an event belongs to.

## Package Manager

- This project uses Bun. Use `bun install`, `bun run`, and `bunx` for dependencies, scripts, and package executables; do not use npm, pnpm, or Yarn.
- Runtime `dependencies` and the `nuxt` version in `update/instance/package.tmpl.json` are pinned to exact versions: an instance installs them from the tag without a lockfile, so a range would install versions nobody tested. Upgrade them deliberately, and run the release bench (`tests/release/`) afterwards.

## Commits

- Keep a commit title whole on its first line, even past the recommended length; never carry part of it into the description. Aim for about 50 characters, 72 at most: generalize when a change touches several things, leave details to the description, and do not start a title with a version.

## Development Servers

| Server                                    | Open at                 | Start                                                           |
| ----------------------------------------- | ----------------------- | --------------------------------------------------------------- |
| Playground, `.playground/`                | `http://localhost:3000` | `bun run dev`                                                   |
| Browser test fixture, `tests/e2e/fixture` | `http://127.0.0.1:3001` | `bun run e2e:dev`; `bun run test:e2e` builds and starts its own |
| Release bench, `tests/release/`           | `127.0.0.1:3100`–`3105` | `bun run test:release`, in Docker                               |

- Start servers only through these scripts (`scripts/dev-server.ts`). Each keeps to its own port: when the port is taken it says so and stops, rather than let Nuxt move elsewhere. When it says the server already runs, use that one.
- A server that was running before you began is the user's: use it, and never restart or stop it. Stop only a server you started for the task, after checking that its PID is still yours (a dev server records it in `.nuxt/nuxt.lock`). Remove bench containers left by `--keep` once done.

## Updates and Migrations

- Thei is updated in place over sites that already hold real content made by older versions. Check every change against that, and read `update/README.md` before touching `update/`, the boot sequence, the database schema, the shape of `content/` or `thei.config.json`, or what an instance is installed with. It says which step a change needs — a migration, an update phase or an update task — and the rules each keeps: raw SQL in migrations, a released migration never edited, file operations safe to repeat, no media processed in a migration, heavy work over content in a task, a clear `title` for the update screen.
- A change to the Drizzle schema in `server/thei/db/schema/` needs a migration: add `update/migrations/<version>-<slug>.ts`, register it in `update/migrations/index.ts` and run `bun run db:baseline`. `tests/server/migrations-baseline.test.ts` fails when a fresh installation and an upgraded one would differ.
- Prefer an update step over teaching the engine or the UI about an older shape. When a change leaves existing content, config or files in an older shape, convert them once with a migration, phase or task, and let the rest of the code assume only the current shape: no fallbacks for fields a migration guarantees, no `legacy*` branches, no optional types kept for old rows. Only a conversion that would be exceptionally heavy or slow is weighed separately, and the decision is written down where the compatibility code lives.
- What an update step cannot reach is not legacy data: published URLs, backup clients installed on other machines, a panel of the previous release still open in a browser. Keep compatibility with those deliberately, and say so where it lives.
- Keep the layer consumable from `node_modules`. Do not assume this repository is the project root, do not import a `devDependency` from runtime code, and declare every runtime import in `dependencies`. The published instance runs the layer from `node_modules/thei`, where an undeclared or dev-only dependency is simply absent.
- Development reads everything from `node_modules`; a build carries only what it traces, and writes its own directory afresh. Check anything read from disk at runtime — fonts, wasm, templates, server assets — in a production build: `bun run test:e2e` runs one, and the release bench builds a real instance.
- Declare new requirements of an installed instance in `update/instance/package.tmpl.json` rather than in installation steps. The engine owns the instance manifest, and an update re-renders it from the newly installed version.
- Keep the boot sequence non-fatal. Report a failure through `setBootError` or `setBootUpdate` in `server/thei/boot/result.ts`. An exception escaping boot kills a process that a service supervisor will restart forever, which takes the site down permanently.
- Verify that a change does not break the in-place update itself when it touches the build output, the server entry point, or anything read from disk at runtime. An update installs dependencies and builds while the previous version is still serving from `.output`.

## Editor.js

- Check every change related to Editor.js for compatibility with content snapshots history system, including tools, block mutations, rendering, normalization, asynchronous hydration, assets, and editor event handling.
- Verify that Editor.js changes do not emit transient or no-op content mutations that briefly change the dirty state. The save control must never flash from “Saved” to “Save” and immediately back to “Saved” without a real persistent content change.
- `docs/content-blocks.md` is the written contract for stored content. Update it in the same commit as any change to a block type, its data, the inline markup or the Markdown output, and keep it to what is actually stored.

## Addresses

- A site may be served from a subfolder, which becomes the build's `app.baseURL`. One rule keeps that manageable: a path stored or passed around in data — API responses, `shared/*-url.ts`, `MediaDescriptor.src`, canonical paths — never includes the base path.
- The base is added only on the way out: by the router for `TheiLink` and `navigateTo`, by `sitePath()` for DOM attributes the router does not own (`src`, a plain `href`, `fetch`/XHR, `location`, a cookie path, a redirect), and by `siteUrl()` / `useSiteUrl().resolve()` for absolute URLs.
- `$fetch` and `useFetch` already carry the base on both the client and the server, so an API call written as `/api/…` is correct as it stands.
- h3 strips the base before middleware and routes, so `getRequestPath(event)` is already base-relative and path comparisons need no prefix.

## Public Text and Machine Readers

- Every public project, event, stage, section and page is also served as Markdown at `<url>index.md`, built from the same `buildPublic*` functions with the visibility of a stranger. A representation must never be more permissive than the page it mirrors: build it for `STRANGER` (`server/thei/access-links/viewer.ts`), never for the request's own viewer.
- `/llms.txt` describes the site and what its entities mean. Keep it short and factual; it is a map, not a marketing page.
- Open Graph cards are rendered on the server from the same public data. Only publicly openable entities get one, so a preview never shows what a visitor is about to be refused.
- Structured data (JSON-LD) says what a page is, not what Thei calls its entity; `usePublicSeo` (`app/composables/public-seo.ts`) lists the type of each page. An event is never a schema.org `Event`: search engines read that as a public gathering and reject one without a venue.
- Everything the owner typed is stored exactly as typed and passes through the formatter on the way out: `publicText()` / `publicRichText()` (`app/composables/public-text.ts`) in the app, `ownerText()` / `ownerRichText()` (`server/thei/owner-text.ts`) on the server. That covers every place such text is shown or read: public pages and admin lists, cards, tooltips, `aria-label`s, `<title>`, meta tags and structured data, Open Graph cards, Markdown copies and `/llms.txt`. A new place that shows the owner's words formats them in the same change.
- The exceptions are few and deliberate: a value inside a field being edited, anything used as an identifier or compared (slug, URL, hostname, file name, search key), and text fetched from other sites, such as a linked page's own title and description (`titleFromSite`). Never write formatted text back to storage.

## File Storage

- Check every change or addition to the file storage system for consistency with reuse counting and reuse presentation, including repeated placements of one file and independently stored file variants.
- No constant describing the engine's own generation — a settings schema version, an encoder version, a preview template version — may appear in `assets.settingsKey`, `assets.familyUuid`, or a path on disk. A derivation change is expressed through `contentHash`, which already changes whenever the output bytes do. A generation counter in the identity splits byte-identical outputs into duplicate rows and duplicate files that nothing ever reconciles.
- A settings key describes only the parameters the caller asked for. An output format is such a parameter and belongs there; the build that produced the file does not.
- Files are addressed by content: `content/assets/<contentHash[0:2]>/<contentHash>.<extension>`. An `assets` row is a logical handle, and several rows legitimately share one file, so a file may only be deleted once no other row references those bytes. Never derive a storage path from `assetUuid`.
- "Part of the library is old and part is new" is not a broken state. Every row describes itself through `extension`, `size`, and `meta`, and nothing expects uniformity. Never re-encode existing media in a migration; reprocessing a release genuinely needs is an update task (`update/README.md`).
- Uploads are streamed to `.thei/tmp/` and handed to sharp and ffmpeg as a path. Never read an uploaded file, a stored asset, or an ffmpeg output into a `Buffer` as a whole: the file limit is 500 MB and the installer asks for 2 GB of RAM. Media processing runs through the concurrency limiter in `server/thei/assets/queue.ts`.
- Every directory the engine owns inside `content/` is declared in `server/thei/content-layout.ts`. Cleanup only sweeps directories it knows about, so a layout that moves without updating that list leaves files behind that nothing will ever reclaim.

## Styling

- Use Tailwind CSS 4 utilities as the default styling approach in Vue templates.
- Use custom classes only when existing Tailwind utilities cannot reasonably express the required behavior, such as complex masks or animations, native pseudo-elements, computed geometry, or third-party DOM integration.
- Use `<style scoped>` for component-local custom CSS. Do not use CSS Modules, unscoped component style blocks, `useCssModule`, or `$style`.
- Keep third-party library overrides locally constrained with `:deep()` whenever the DOM remains inside the component. Put unavoidable global overrides for teleported or body-level library UI in a dedicated integration stylesheet, scoped beneath a library-specific root or body state.
- Use the colors, shadows, spacing, radii, and other design tokens already exposed by `app/styles/main.css`. Do not invent hardcoded design values when an existing token or Tailwind utility is suitable.
- Do not add or change design tokens, colors, shadows, spacing constants, radii, or breakpoints without explicitly asking the user for permission first.
- Use the existing `sm` responsive convention. Ask the user before using another responsive breakpoint, adding a breakpoint, or writing an inline media/container breakpoint.
- Numeric Tailwind utilities such as `w-16`, `max-w-75`, and `size-6` are appropriate for specific one-off geometry. Prefer their `rem`-based scale over fixed pixel values so the existing mobile root font size can proportionally tighten dimensions and spacing.
- Do not create a named token for every one-off size. When the same numeric value is repeated for the same semantic purpose, reuse an existing project token or ask the user before introducing a new one.
- Project spacing tokens named `xs`, `sm`, `md`, `lg`, and `xl` also affect similarly named Tailwind dimension utilities. Verify the generated value before using utilities such as `max-w-sm`, `max-w-md`, or `max-w-lg`; use an appropriate numeric utility when a standard container width is intended. The responsive `sm:` prefix is unrelated to this collision and remains the project's allowed breakpoint convention.
- Keep arbitrary Tailwind values to the minimum. Use them only when no semantically correct project token or standard utility exists, including CSS-variable calculations and intrinsic or container-relative geometry.
- Preserve accessibility media queries such as pointer capability and reduced-motion queries when they describe user or device capabilities rather than layout breakpoints.

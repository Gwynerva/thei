# Instructions for AI Agents

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

## Commits

- Keep a commit title on its first line whole. Never carry part of it over into the description, even when it runs past the usual recommended length.
- Aim to fit a commit title within the recommended length (about 50 characters, 72 at most). Generalize when a change touches several things, and leave details to the description.

## Playground Data

- `.playground/content` holds throwaway development data. Agents may freely create, edit, crop, upload, replace and delete anything in it — projects, pages, files, settings — to check that a change really works. Nothing there needs preserving.

## Development Server Management

- Before starting work, open or probe `http://localhost:3000` and identify the process listening on port `3000`, including IPv4 and IPv6 listeners.
- If port `3000` is occupied, first assume it may already be this project's development server. Verify the response from `http://localhost:3000` and, when it serves Thei, use that existing server even if process command-line or working-directory inspection is unavailable.
- Treat any Thei server that was already running on port `3000` as externally managed: do not restart it or stop it after completing the work.
- If port `3000` is available, start this project's development server strictly on port `3000`. Record the PID of the process and mark it as having been started by the current agent.
- Do not allow Nuxt to automatically switch to port `3001` or any other port. If startup reports that port `3000` is occupied, stop the startup attempt, inspect the port owner again, and either use the existing project server or report the conflict.
- Before starting the server, stop development servers belonging to this repository only if they are listening on ports other than `3000`. Before stopping a process, verify its command line and working directory. Do not stop processes belonging to other projects, databases, or system services.
- After completing the work, stop the server on port `3000` only when all of the following conditions are met:
  - the current agent started the server as part of the current task;
  - the PID matches the recorded PID;
  - a final check confirms that the process still belongs to this repository.
- If the server on port `3000` existed before the work began, do not stop it.
- If the process ownership or whether it was started by the current agent cannot be verified, do not stop the process.

## Updates and Migrations

- Check every change for compatibility with the update system in `update/`. Thei is installed as a versioned engine and updated in place over existing installations, so assume every change will land on a site that already holds real content created by an older version.
- Read `update/README.md` before changing anything in `update/`, the boot sequence, the database schema, the shape of `content/`, or the requirements an instance is installed with.
- Any change to the Drizzle schema in `server/thei/db/schema/` requires a migration. Add `update/migrations/<version>-<slug>.ts` with `defineMigration`, register it in `update/migrations/index.ts`, and regenerate the baseline with `bun run db:baseline`. A schema change without a migration upgrades new installations only and breaks every existing one.
- Write migrations with raw SQL through `rawDb`. Never import the Drizzle schema into a migration: that schema always describes the current release, while a migration must keep describing the database as it was when the migration was written.
- Changes that are not about the database schema — moving files, rewriting `thei.config.json`, calling a tool — are a scripted migration (`run` instead of `up`, runs on boot with the site closed), an update phase in `update/phases/` (runs during the update, before the rebuild, while the previous build still serves, without the database), or an update task in `update/tasks/` (runs on boot after every migration, with the site still closed, using the engine's own code, once). Give each a clear `title`, and a `description` where the step is not self-explanatory: both are shown to the site owner on the update screen. Phases must be safe to repeat.
- Heavy work over existing content — reprocessing media, rebuilding derived data, converting old records — is allowed when a release needs it, and belongs in an update task: it may take minutes, reports its progress on the update screen, and the site stays closed until it has finished, so later code may count on its result. Prefer converting old content once this way over carrying compatibility code for it in every later release. A task runs after all migrations with the newest schema, so a migration never depends on a task; skip items that cannot be converted and throw only when the task as a whole cannot go on. Migrations still must not process media.
- Treat a released migration as immutable. Its `id` is recorded in every instance's ledger. Never edit, reorder, or remove one that has shipped; correct it with a new migration instead.
- Migrations must also cover changes outside the database when they affect existing installations, including the layout of `content/`, file naming on disk, and the shape of `thei.config.json`. File operations in a migration must be safe to repeat, because only the SQL and the ledger row share a transaction.
- Run `bun vitest run tests/server/migrations-baseline.test.ts` after any schema change. It fails when a fresh installation and an upgraded one would not end up with the same schema.
- Keep the layer consumable from `node_modules`. Do not assume this repository is the project root, do not import a `devDependency` from runtime code, and declare every runtime import in `dependencies`. The published instance runs the layer from `node_modules/thei`, where an undeclared or dev-only dependency is simply absent.
- Declare new requirements of an installed instance in `update/instance/package.tmpl.json` rather than in installation steps. The engine owns the instance manifest, and an update re-renders it from the newly installed version.
- Keep the boot sequence non-fatal. Report a failure through `setBootError` or `setBootUpdate` in `server/thei/boot/result.ts`. An exception escaping boot kills a process that a service supervisor will restart forever, which takes the site down permanently.
- Verify that a change does not break the in-place update itself when it touches the build output, the server entry point, or anything read from disk at runtime. An update installs dependencies and builds while the previous version is still serving from `.output`.

## Editor.js

- Check every change related to Editor.js for compatibility with content snapshots history system, including tools, block mutations, rendering, normalization, asynchronous hydration, assets, and editor event handling.
- Verify that Editor.js changes do not emit transient or no-op content mutations that briefly change the dirty state. The save control must never flash from “Saved” to “Save” and immediately back to “Saved” without a real persistent content change.
- `docs/content-blocks.md` is the written contract for stored content: the block types, their `data`, the inline markup subset, and how private sections travel. Update it in the same commit as any change to a block type, its data, the inline markup, or the Markdown output. Keep it to what is actually stored — it is read by people and models that never see the editor, and padding it with UI description makes it wrong sooner.

## Addresses

- A site may be served from a subfolder, which becomes the build's `app.baseURL`. One rule keeps that manageable: a path stored or passed around in data — API responses, `shared/*-url.ts`, `MediaDescriptor.src`, canonical paths — never includes the base path.
- The base is added only on the way out: by the router for `TheiLink` and `navigateTo`, by `sitePath()` for DOM attributes the router does not own (`src`, a plain `href`, `fetch`/XHR, `location`, a cookie path, a redirect), and by `siteUrl()` / `useSiteUrl().resolve()` for absolute URLs.
- `$fetch` and `useFetch` already carry the base on both the client and the server, so an API call written as `/api/…` is correct as it stands.
- h3 strips the base before middleware and routes, so `getRequestPath(event)` is already base-relative and path comparisons need no prefix.

## Public Text and Machine Readers

- Every public project, event, stage, section and page is also served as Markdown at `<url>index.md`, built from the same `buildPublic*` functions with the visibility of a stranger. A representation must never be more permissive than the page it mirrors: pass `false` for `isAdmin`, never the request's own role.
- `/llms.txt` describes the site and what its entities mean. Keep it short and factual; it is a map, not a marketing page.
- Open Graph cards are rendered on the server from the same public data. Only publicly openable entities get one, so a preview never shows what a visitor is about to be refused.

## File Storage

- Check every change or addition to the file storage system for consistency with reuse counting and reuse presentation, including repeated placements of one file and independently stored file variants.
- No constant describing the engine's own generation — a settings schema version, an encoder version, a preview template version — may appear in `assets.settingsKey`, `assets.familyUuid`, or a path on disk. A derivation change is expressed through `contentHash`, which already changes whenever the output bytes do. A generation counter in the identity splits byte-identical outputs into duplicate rows and duplicate files that nothing ever reconciles.
- A settings key describes only the parameters the caller asked for. An output format is such a parameter and belongs there; the build that produced the file does not.
- Files are addressed by content: `content/assets/<contentHash[0:2]>/<contentHash>.<extension>`. An `assets` row is a logical handle, and several rows legitimately share one file, so a file may only be deleted once no other row references those bytes. Never derive a storage path from `assetUuid`.
- "Part of the library is old and part is new" is not a broken state. Every row describes itself through `extension`, `size`, and `meta`, and nothing expects uniformity. Never re-encode existing media in a migration: migrations run inside boot, in one transaction, with the site down and a supervisor restarting the process on failure. Bulk reprocessing that a release genuinely needs belongs in an update task (`update/tasks/`): it runs once, on boot after the migrations with the site closed, one file at a time in the processing lanes, and shows its progress on the update screen.
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

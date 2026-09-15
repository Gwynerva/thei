# Instructions for AI Agents

## Package Manager

- This project uses Bun. Use `bun install`, `bun run`, and `bunx` for dependencies, scripts, and package executables; do not use npm, pnpm, or Yarn.

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

## File Storage

- Check every change or addition to the file storage system for consistency with reuse counting and reuse presentation, including repeated placements of one file and independently stored file variants.
- No constant describing the engine's own generation — a settings schema version, an encoder version, a preview template version — may appear in `assets.settingsKey`, `assets.familyUuid`, or a path on disk. A derivation change is expressed through `contentHash`, which already changes whenever the output bytes do. A generation counter in the identity splits byte-identical outputs into duplicate rows and duplicate files that nothing ever reconciles.
- A settings key describes only the parameters the caller asked for. An output format is such a parameter and belongs there; the build that produced the file does not.
- Files are addressed by content: `content/assets/<contentHash[0:2]>/<contentHash>.<extension>`. An `assets` row is a logical handle, and several rows legitimately share one file, so a file may only be deleted once no other row references those bytes. Never derive a storage path from `assetUuid`.
- "Part of the library is old and part is new" is not a broken state. Every row describes itself through `extension`, `size`, and `meta`, and nothing expects uniformity. Never re-encode existing media in a migration: migrations run inside boot, in one transaction, with the site down and a supervisor restarting the process on failure. If bulk re-encoding is ever wanted, it belongs in an opt-in, resumable background job in the admin panel.
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

# Instructions for AI Agents

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

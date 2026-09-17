/**
 * Entry point the update pipeline runs with Bun from the engine being
 * installed:
 *
 *   bun node_modules/thei/update/phases/cli.ts \
 *     --project <dir> --from <version> --to <version> [--lang <code>]
 *
 * Running the new engine's own file is what lets a release bring phases the
 * version being replaced has never heard of.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { updatePhaseRegistry } from './index';
import { formatUpdatePhaseEvent, runUpdatePhases } from './run';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const projectPath = argument('project');
const fromVersion = argument('from');
const toVersion = argument('to');

if (!projectPath || !fromVersion || !toVersion) {
  console.error(
    'Usage: cli.ts --project <dir> --from <v> --to <v> [--lang <code>]',
  );
  process.exit(2);
}

runUpdatePhases({
  registry: updatePhaseRegistry,
  projectPath: resolve(projectPath),
  theiPath: resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'),
  fromVersion,
  toVersion,
  languageCode: argument('lang'),
  emit: (event) => console.log(formatUpdatePhaseEvent(event)),
}).then(
  (succeeded) => process.exit(succeeded ? 0 : 1),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);

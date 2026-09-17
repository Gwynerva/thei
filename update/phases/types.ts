import type { ExecOptions, ExecResult } from '../exec';
import type { UpdateText } from '../text';

export interface UpdatePhaseContext {
  /** The instance directory: `package.json`, `content/`, `.output/`. */
  projectPath: string;
  /** The engine being installed, inside `node_modules`. */
  theiPath: string;
  /** Absolute path inside the instance's `content/`. */
  contentPath: (...parts: string[]) => string;
  /** The version being updated from, as recorded before this update. */
  fromVersion: string;
  /** The version being installed. */
  toVersion: string;
  /** Site language, for anything the phase writes for people to read. */
  languageCode?: string;
  readConfig: () => Promise<Record<string, unknown>>;
  /** Atomically replaces `content/thei.config.json`. */
  writeConfig: (config: Record<string, unknown>) => Promise<void>;
  /** Runs a command in the instance directory, its output going to the log. */
  exec: (
    command: string,
    args: string[],
    options?: Partial<ExecOptions>,
  ) => Promise<ExecResult>;
  log: (message: string) => void;
}

/**
 * A scripted action a release performs while it is being installed: creating,
 * moving or deleting files, rewriting the config, calling a tool — anything.
 *
 * Runs after the new engine's dependencies are installed and before the site
 * is rebuilt, **while the previous build is still serving**. A phase must not
 * pull the ground from under that build; work that needs the new database
 * schema belongs in a migration, which runs on the new engine's boot.
 *
 * A phase runs once per update that crosses its version, and again if that
 * update is retried after a failure. Write it so a second run over a finished
 * or half-finished state does no harm.
 */
export interface TheiUpdatePhase {
  /** Unique, by convention `<version>/<order>-<slug>`. */
  id: string;
  /** The release this phase belongs to. */
  version: string;
  title: UpdateText;
  description?: UpdateText;
  run: (context: UpdatePhaseContext) => Promise<void> | void;
}

export function defineUpdatePhase(phase: TheiUpdatePhase): TheiUpdatePhase {
  return phase;
}

import { join } from 'node:path';
import { readConfigFile, writeConfigFile } from '../config-file';
import { exec } from '../exec';
import { compareVersions } from '../semver';
import { resolveUpdateText } from '../text';
import type { TheiUpdatePhase } from './types';

/**
 * What the phase runner reports, one JSON object per line on stdout.
 *
 * This is a protocol between two releases: the update pipeline that reads it
 * belongs to the version being replaced, the runner that writes it to the
 * version being installed. Only ever add optional fields.
 */
export type UpdatePhaseEvent =
  | {
      type: 'plan';
      steps: { id: string; title: string; description?: string }[];
    }
  | { type: 'start'; id: string }
  | { type: 'log'; id: string; message: string }
  | { type: 'done'; id: string }
  | { type: 'fail'; id: string; error: string };

/** Prefix that tells protocol lines apart from anything a phase prints. */
export const UPDATE_PHASE_EVENT_PREFIX = '@@thei-update-phase ';

export function formatUpdatePhaseEvent(event: UpdatePhaseEvent): string {
  return `${UPDATE_PHASE_EVENT_PREFIX}${JSON.stringify(event)}`;
}

export function parseUpdatePhaseEvent(
  line: string,
): UpdatePhaseEvent | undefined {
  const start = line.indexOf(UPDATE_PHASE_EVENT_PREFIX);
  if (start === -1) return undefined;
  try {
    const event = JSON.parse(
      line.slice(start + UPDATE_PHASE_EVENT_PREFIX.length),
    ) as UpdatePhaseEvent;
    return typeof event?.type === 'string' ? event : undefined;
  } catch {
    return undefined;
  }
}

/** Phases an update from `fromVersion` to `toVersion` has to run, in order. */
export function selectUpdatePhases(
  registry: TheiUpdatePhase[],
  fromVersion: string,
  toVersion: string,
): TheiUpdatePhase[] {
  return registry.filter(
    (phase) =>
      compareVersions(phase.version, fromVersion) > 0 &&
      compareVersions(phase.version, toVersion) <= 0,
  );
}

export interface RunUpdatePhasesOptions {
  registry: TheiUpdatePhase[];
  projectPath: string;
  theiPath: string;
  fromVersion: string;
  toVersion: string;
  languageCode?: string;
  emit: (event: UpdatePhaseEvent) => void;
}

/** Runs the selected phases one by one; stops at, and reports, the first failure. */
export async function runUpdatePhases(
  options: RunUpdatePhasesOptions,
): Promise<boolean> {
  const phases = selectUpdatePhases(
    options.registry,
    options.fromVersion,
    options.toVersion,
  );
  const contentPath = (...parts: string[]) =>
    join(options.projectPath, 'content', ...parts);
  const configPath = contentPath('thei.config.json');

  options.emit({
    type: 'plan',
    steps: phases.map((phase) => ({
      id: phase.id,
      title: resolveUpdateText(phase.title, options.languageCode),
      description: resolveUpdateText(phase.description, options.languageCode),
    })),
  });

  for (const phase of phases) {
    const log = (message: string) =>
      options.emit({ type: 'log', id: phase.id, message });
    options.emit({ type: 'start', id: phase.id });
    try {
      await phase.run({
        projectPath: options.projectPath,
        theiPath: options.theiPath,
        contentPath,
        fromVersion: options.fromVersion,
        toVersion: options.toVersion,
        languageCode: options.languageCode,
        readConfig: () => readConfigFile(configPath),
        writeConfig: (config) => writeConfigFile(configPath, config),
        exec: (command, args, execOptions) =>
          exec(command, args, {
            cwd: options.projectPath,
            onLine: log,
            ...execOptions,
          }),
        log,
      });
    } catch (error) {
      options.emit({
        type: 'fail',
        id: phase.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
    options.emit({ type: 'done', id: phase.id });
  }
  return true;
}

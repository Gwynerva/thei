import type { MigrationProgressEvent } from './migrations/run';
import {
  appendLog,
  finishStep,
  pendingStep,
  planSteps,
  readUpdateState,
  setStatus,
  settleSteps,
  startStep,
  writeUpdateState,
} from './state';
import { resolveUpdateText } from './text';

/**
 * Records boot-time migrations as steps of the update that caused the boot.
 *
 * Only when an update is actually waiting for this restart: a plain restart or
 * a first boot has no run to report into. Returns `undefined` then, and the
 * migrations run without being recorded.
 */
export async function migrationProgressRecorder(
  projectPath: string,
  languageCode?: string,
): Promise<((event: MigrationProgressEvent) => Promise<void>) | undefined> {
  const state = await readUpdateState(projectPath);
  if (state?.status !== 'restarting') return undefined;

  return async (event) => {
    const id = `migration:${event.type === 'plan' ? '' : event.migration.id}`;
    switch (event.type) {
      case 'plan':
        // Migrations only run once the new process is up.
        finishStep(state, 'restart', 'done');
        planSteps(
          state,
          event.migrations.map((migration) =>
            pendingStep(
              `migration:${migration.id}`,
              'migration',
              resolveUpdateText(migration.title, languageCode),
              resolveUpdateText(migration.description, languageCode),
            ),
          ),
        );
        break;
      case 'start':
        startStep(state, id);
        break;
      case 'done':
        finishStep(state, id, 'done');
        break;
      case 'fail':
        finishStep(state, id, 'failed', event.error);
        state.error = event.error;
        appendLog(
          state,
          `Migration ${event.migration.id} failed: ${event.error}`,
        );
        setStatus(state, 'failed');
        settleSteps(state);
        break;
    }
    await writeUpdateState(projectPath, state);
  };
}

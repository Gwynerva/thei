import type {
  UpdateFailure,
  UpdateProgress,
  UpdateRunView,
  UpdateSite,
} from '#layers/thei/shared/api/update-progress';
import { isManaged } from '#layers/thei/update/environment';
import { resolveState } from '#layers/thei/update/process';
import { bootResult } from '../../thei/boot/result';

/**
 * What the update screen polls, before the restart, through it, and while the
 * site is closed. Served in every state the boot can end in, without the
 * database: the run is read from the state file.
 */
export default defineEventHandler(async (event): Promise<UpdateProgress> => {
  setHeader(event, 'Cache-Control', 'no-store');

  const admin = await THEI_SERVER.isAdmin(event);
  const { site, failure } = describeSite();
  const state = await resolveState({ projectPath: THEI_SERVER.projectPath() });

  // A closed site has nothing to say for itself but its update, so the steps
  // are shown to anyone then; the build log never is. Content refused as a
  // downgrade belongs to no run of this version.
  const showRun = site === 'open' ? admin : failure?.reason !== 'downgrade';
  let run: UpdateRunView | undefined;
  if (state && showRun) {
    const { log: _log, pid: _pid, ...view } = state;
    run = view;
  }

  return {
    site,
    version: THEI_SERVER.version,
    admin,
    ...(run ? { run } : {}),
    ...(failure ? { failure } : {}),
    ...(site === 'failed'
      ? {
          canRetry: admin && isManaged() && failure?.reason !== 'downgrade',
        }
      : {}),
  };
});

function describeSite(): { site: UpdateSite; failure?: UpdateFailure } {
  switch (bootResult.type) {
    case 'update':
      return bootResult.failure
        ? { site: 'failed', failure: bootResult.failure }
        : { site: 'updating' };
    case 'error':
      return {
        site: 'failed',
        failure: { reason: 'error', message: bootResult.message },
      };
    default:
      return { site: 'open' };
  }
}

import {
  getUpdateStatus,
  startUpdate,
  UpdateRefused,
} from '#layers/thei/update/process';
import { updateRuntime } from '#layers/thei/update/runtime';
import type { UpdateState } from '#layers/thei/update/types';

export type UpdateStartResponse =
  | { type: 'success'; state: UpdateState }
  | { type: 'error'; code?: string; message: string };

export default defineEventHandler(async (): Promise<UpdateStartResponse> => {
  const runtime = updateRuntime();
  const status = await getUpdateStatus(runtime, { check: true });

  if (!status.latestVersion) {
    return {
      type: 'error',
      code: 'not-available',
      message: status.checkError ?? THEI_SERVER.phrase.update_check_failed,
    };
  }

  if (!status.updateAvailable) {
    return {
      type: 'error',
      code: 'not-available',
      message: THEI_SERVER.phrase.update_up_to_date,
    };
  }

  try {
    const state = await startUpdate(runtime, status.latestVersion);
    return { type: 'success', state };
  } catch (error) {
    if (error instanceof UpdateRefused) {
      return { type: 'error', code: error.code, message: error.message };
    }

    return {
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    };
  }
});

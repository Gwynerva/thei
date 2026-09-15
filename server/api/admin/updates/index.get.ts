import { getUpdateStatus } from '#layers/thei/update/process';
import { updateRuntime } from '#layers/thei/update/runtime';
import type { UpdateStatus } from '#layers/thei/update/types';

export default defineEventHandler(async (): Promise<UpdateStatus> => {
  return await getUpdateStatus(updateRuntime());
});

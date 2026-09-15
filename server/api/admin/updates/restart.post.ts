import { restartServer, UpdateRefused } from '#layers/thei/update/process';

export type RestartResponse =
  { type: 'success' } | { type: 'error'; code?: string; message: string };

export default defineEventHandler((): RestartResponse => {
  try {
    restartServer();
    THEI_SERVER.console.tag('Update').log('Restart requested from the panel.');
    return { type: 'success' };
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

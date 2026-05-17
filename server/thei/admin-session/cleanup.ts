import { destroyAdminSession, enforceDbLimit, memorySessions } from '.';
import { sessionCleanupInterval } from './const';

let cleanupIntervalStarted = false;
let sessionsIntervalRunning = false;

export function startSessionCleanupInterval() {
  if (cleanupIntervalStarted) {
    return;
  }

  cleanupIntervalStarted = true;

  setInterval(async () => {
    if (sessionsIntervalRunning) return;
    sessionsIntervalRunning = true;

    try {
      const now = Date.now();
      const expired: string[] = [];

      for (const [token, session] of memorySessions) {
        if (now >= session.expiresAt) {
          expired.push(token);
        }
      }

      for (const token of expired) {
        await destroyAdminSession(token);
      }

      await enforceDbLimit();
    } finally {
      sessionsIntervalRunning = false;
    }
  }, sessionCleanupInterval);
}

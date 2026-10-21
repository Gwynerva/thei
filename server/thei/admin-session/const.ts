export const tokenName = 'thei-admin-session-token';
export const tokenRotationInterval = 24 * 60 * 60 * 1000;
/**
 * How long a rotated token is still accepted once the browser has shown the
 * new one: for requests it sent before the new cookie arrived.
 */
export const previousTokenGrace = 15 * 1000;
export const sessionDuration = 7 * 24 * 60 * 60 * 1000;
export const maxDbSessions = 100;
export const dbSnapshotInterval = 30 * 1000;

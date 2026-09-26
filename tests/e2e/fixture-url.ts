/**
 * Where the regression fixture listens: port 3001, beside the playground on
 * 3000, so both can run at once. Every test and the fixture's own config read
 * it from here; see tests/e2e/README.md.
 */
export const E2E_PORT = 3001;
export const E2E_ORIGIN = `http://127.0.0.1:${E2E_PORT}`;

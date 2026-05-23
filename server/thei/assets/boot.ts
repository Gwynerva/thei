import { runAssetCleanup } from './cleanup';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function bootTheiAssets() {
  // Run once at boot to handle orphans accumulated while the server was down
  runAssetCleanup();
  setInterval(() => runAssetCleanup(), ONE_DAY_MS);
}

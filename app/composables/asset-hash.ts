export function hashLocalAsset(
  file: File,
  signal: AbortSignal,
  onProgress: (progress: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Cancelled', 'AbortError'));
      return;
    }
    const worker = new Worker(
      new URL('../workers/asset-hash.worker.ts', import.meta.url),
      { type: 'module' },
    );
    const cleanup = () => {
      worker.terminate();
      signal.removeEventListener('abort', cancel);
    };
    const cancel = () => {
      cleanup();
      reject(new DOMException('Cancelled', 'AbortError'));
    };
    signal.addEventListener('abort', cancel, { once: true });
    worker.onmessage = ({ data }) => {
      if (data.error) {
        cleanup();
        reject(new Error(data.error));
      } else if (data.hash) {
        cleanup();
        resolve(data.hash);
      } else onProgress(data.progress);
    };
    worker.onerror = async (event) => {
      // Firefox can reject module workers when a strict CSP blocks the wasm
      // bootstrap. Keep the worker as the normal path, but preserve the same
      // cancelable UX with a WebCrypto fallback instead of sending file bytes.
      cleanup();
      try {
        const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
        if (signal.aborted) return;
        onProgress(1);
        resolve(Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join(''));
      } catch {
        reject(new Error(event.message || 'Hash failed'));
      }
    };
    worker.postMessage(file);
  });
}

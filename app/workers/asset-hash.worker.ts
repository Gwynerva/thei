import { createSHA256 } from 'hash-wasm';

self.onmessage = async (event: MessageEvent<File>) => {
  try {
    const file = event.data;
    const hash = await createSHA256();
    hash.init();
    const chunkSize = 2 * 1024 * 1024;
    for (let offset = 0; offset < file.size; offset += chunkSize) {
      hash.update(
        new Uint8Array(
          await file.slice(offset, offset + chunkSize).arrayBuffer(),
        ),
      );
      self.postMessage({
        progress: Math.min(1, (offset + chunkSize) / file.size),
      });
    }
    self.postMessage({ hash: hash.digest('hex') });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : 'Hash failed',
    });
  }
};

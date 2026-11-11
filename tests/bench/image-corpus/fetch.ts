import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * Brings the image corpus of `bun run bench:image-content` to
 * `tests/.artifacts/image-corpus/`: every file of `manifest.json`, from the
 * address the manifest names — NASA's image library, and repositories on
 * GitHub at a pinned commit — checked against the hash the manifest keeps. A
 * file already there and whole is left alone, so a run interrupted is
 * resumed.
 *
 * The files are free ones — their authors and licences are in the manifest —
 * and only data: nothing of them is run.
 */
export interface CorpusFile {
  /** Path inside the corpus: `<kind>/<name>`. */
  file: string;
  /** What the picture is, as a person would call it. */
  kind: 'photo' | 'game3d' | 'game2d' | 'logo' | 'flat' | 'mixed';
  title: string;
  url: string;
  page: string;
  author: string;
  license: string;
  licenseUrl: string;
  bytes: number;
  sha256: string;
}

export const corpusDirectory = join(
  import.meta.dirname,
  '..',
  '..',
  '.artifacts',
  'image-corpus',
);

export async function readCorpusManifest(): Promise<CorpusFile[]> {
  const manifest = JSON.parse(
    await readFile(join(import.meta.dirname, 'manifest.json'), 'utf8'),
  ) as { files: CorpusFile[] };
  return manifest.files;
}

const USER_AGENT = 'image-bench-corpus/1.0 (generic client)';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function isWhole(path: string, sha256: string): Promise<boolean> {
  const bytes = await readFile(path).catch(() => undefined);
  return (
    bytes !== undefined &&
    createHash('sha256').update(bytes).digest('hex') === sha256
  );
}

/** A host may ask its readers to slow down, with a 429 and how long to wait. */
async function download(url: string): Promise<Buffer> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (response.ok) return Buffer.from(await response.arrayBuffer());
    if (response.status === 404) break;
    await sleep(
      (Number(response.headers.get('retry-after')) || 6 * (attempt + 1)) * 1000,
    );
  }
  throw new Error(`Could not download ${url}`);
}

if (import.meta.main) {
  const files = await readCorpusManifest();
  let fetched = 0;
  for (const entry of files) {
    const path = join(corpusDirectory, entry.file);
    if (await isWhole(path, entry.sha256)) continue;
    const bytes = await download(entry.url);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (sha256 !== entry.sha256) {
      throw new Error(
        `${entry.file} is not the file the manifest names: other bytes are now served at ${entry.url}`,
      );
    }
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
    fetched += 1;
    console.log(`${entry.file}  ${Math.round(bytes.length / 1024)} KB`);
    await sleep(1500);
  }
  console.log(
    `${files.length} files in ${corpusDirectory}, ${fetched} downloaded now`,
  );
}

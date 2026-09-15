import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { dependencySpecifier, repositoryUrl } from './environment';

export const sourcePlaceholder = '__THEI_SOURCE__';

/** Path to the manifest template shipped by the currently installed engine. */
export function templatePath(theiPath: string): string {
  return join(theiPath, 'update', 'instance', 'package.tmpl.json');
}

/**
 * Fills in the engine reference. The template is the engine's own, so a new
 * release can change the instance manifest — peer versions, trusted
 * dependencies, scripts — without the updater knowing anything about it.
 */
export function renderInstanceManifest(
  template: string,
  tag: string,
  repository = repositoryUrl(),
): string {
  const specifier = dependencySpecifier(repository, tag);

  if (!template.includes(sourcePlaceholder)) {
    throw new Error(
      `Instance manifest template is missing ${sourcePlaceholder}.`,
    );
  }

  // JSON.stringify keeps the specifier a valid JSON string value.
  const rendered = template.replaceAll(
    `"${sourcePlaceholder}"`,
    JSON.stringify(specifier),
  );

  // Fail loudly rather than writing a manifest Bun cannot parse.
  JSON.parse(rendered);

  return rendered;
}

export async function writeInstanceManifest(
  projectPath: string,
  contents: string,
): Promise<void> {
  const path = join(projectPath, 'package.json');
  const temp = `${path}.${randomUUID()}.tmp`;

  try {
    await writeFile(temp, contents, 'utf8');
    await rename(temp, path);
  } finally {
    await rm(temp, { force: true });
  }
}

export async function backupInstanceManifest(
  projectPath: string,
): Promise<void> {
  const path = join(projectPath, 'package.json');
  const contents = await readFile(path, 'utf8');
  await writeFile(join(projectPath, 'package.json.prev'), contents, 'utf8');
}

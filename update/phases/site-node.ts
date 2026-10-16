import { readlinkSync } from 'node:fs';
import { basename } from 'node:path';

/**
 * The Node that runs the site: the process that started the phase runner,
 * which is the update engine inside the service. `node` on the service's PATH
 * is the same one on any server the installer set up.
 *
 * The runner itself runs under Bun, whose `process.versions.node` says which
 * Node it imitates, not which one serves the site.
 */
export function siteNode(): string {
  try {
    const parent = readlinkSync(`/proc/${process.ppid}/exe`);
    if (basename(parent).startsWith('node')) return parent;
  } catch {
    // No /proc: not Linux, where the question does not come up this way.
  }
  return 'node';
}

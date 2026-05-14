import { type as osType, release as osRelease } from 'node:os';

export default defineEventHandler(() => {
  const bunVersion = (process.versions as Record<string, string>).bun;
  const runtime = bunVersion
    ? { name: 'Bun', version: `v${bunVersion}` }
    : { name: 'Node.js', version: process.version };

  const osName = osType()
    .replace('Windows_NT', 'Windows')
    .replace('Darwin', 'macOS');

  return {
    theiVersion: THEI_SERVER.version,
    runtime,
    os: `${osName} ${osRelease()}`,
  };
});

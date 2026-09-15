import { describe, expect, it } from 'vitest';
import { cleanLine } from '../../update/exec';

describe('command output cleaning', () => {
  it('strips the colour codes build tools emit', () => {
    expect(cleanLine('[90m  └─ .output/server/index.mjs[39m')).toBe(
      '  └─ .output/server/index.mjs',
    );
    expect(cleanLine('[32m✔[39m Build complete!')).toBe('✔ Build complete!');
  });

  it('leaves plain output alone', () => {
    expect(cleanLine('Resolving dependencies')).toBe('Resolving dependencies');
  });

  it('trims trailing whitespace and carriage returns', () => {
    expect(cleanLine('installed   ')).toBe('installed');
  });

  it('truncates a line that would bloat the state file', () => {
    const line = cleanLine('x'.repeat(1000));
    expect(line).toHaveLength(301);
    expect(line.endsWith('…')).toBe(true);
  });
});

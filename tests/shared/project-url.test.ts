import { describe, expect, it } from 'vitest';
import {
  buildProjectUrl,
  publicIdFromProjectUrlPart,
} from '../../shared/project-url';

describe('project public URL', () => {
  it('uses only the final segment as the public ID', () => {
    expect(buildProjectUrl('hello-world', 'Ab12')).toBe(
      '/projects/hello-world-Ab12/',
    );
    expect(buildProjectUrl('', 'Ab12')).toBe('/projects/Ab12/');
    expect(publicIdFromProjectUrlPart('anything-goes-Ab12')).toBe('Ab12');
  });
});

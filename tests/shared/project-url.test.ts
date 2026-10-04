import { describe, expect, it } from 'vitest';
import {
  buildProjectSectionUrl,
  publicIdFromProjectSectionUrlPart,
} from '../../shared/project-url';

describe('project section URLs', () => {
  it('builds semantic canonical detail URLs', () => {
    expect(
      buildProjectSectionUrl('thei', 'Project1', 'architecture', 'Section1'),
    ).toBe('/projects/thei-Project1/sections/architecture-Section1/');
  });

  it('extracts the opaque suffix independently of the readable slug', () => {
    expect(publicIdFromProjectSectionUrlPart('renamed-part-Section1')).toBe(
      'Section1',
    );
  });
});

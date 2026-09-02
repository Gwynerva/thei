import { describe, expect, it } from 'vitest';
import {
  buildProjectChildUrl,
  publicIdFromProjectChildUrlPart,
} from '../../shared/project-url';

describe('project child URLs', () => {
  it('builds semantic canonical detail URLs', () => {
    expect(
      buildProjectChildUrl(
        'thei',
        'Project1',
        'sections',
        'architecture',
        'Section1',
      ),
    ).toBe('/projects/thei-Project1/sections/architecture-Section1/');
  });

  it('extracts the opaque suffix independently of the readable slug', () => {
    expect(publicIdFromProjectChildUrlPart('renamed-stage-Stage1')).toBe(
      'Stage1',
    );
  });
});

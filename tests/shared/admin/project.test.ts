import { describe, expect, it } from 'vitest';
import {
  validateProjectData,
  type ProjectEditData,
} from '../../../shared/admin/project';
import { ProjectEventAccessLevel } from '../../../shared/access-level';

function baseProject(
  overrides: Partial<ProjectEditData> = {},
): ProjectEditData {
  return {
    title: 'Project',
    summary: 'Summary',
    humanReadableSlug: 'project',
    publicId: 'projectId',
    access: ProjectEventAccessLevel.Public,
    important: false,
    cv: false,
    ...overrides,
  };
}

describe('validateProjectData asset metadata', () => {
  it('requires a valid public ID', () => {
    expect(validateProjectData(baseProject({ publicId: '' }))).toBe(
      'Public ID cannot be empty',
    );
    expect(validateProjectData(baseProject({ publicId: 'not-valid!' }))).toBe(
      'Invalid public ID',
    );
  });

  it('requires a title for other files', () => {
    const result = validateProjectData(
      baseProject({
        otherAssets: [
          {
            assetUuid: 'asset-1',
            title: '   ',
            isPrivate: false,
          },
        ],
      }),
    );

    expect(result).toBe('Other file title cannot be empty');
  });

  it('rejects invalid showcase asset privacy', () => {
    const result = validateProjectData(
      baseProject({
        showcaseAssets: [
          {
            assetUuid: 'asset-1',
            caption: 'Preview',
            isPrivate: 'public' as unknown as boolean,
          },
        ],
      }),
    );

    expect(result).toBe('Invalid asset privacy');
  });

  it('rejects invalid other asset privacy', () => {
    const result = validateProjectData(
      baseProject({
        otherAssets: [
          {
            assetUuid: 'asset-1',
            title: 'Download',
            isPrivate: 'public' as unknown as boolean,
          },
        ],
      }),
    );

    expect(result).toBe('Invalid asset privacy');
  });

  it('trims asset metadata and drops empty captions', () => {
    const result = validateProjectData(
      baseProject({
        showcaseAssets: [
          {
            assetUuid: 'asset-1',
            caption: '  ',
            isPrivate: true,
          },
        ],
        otherAssets: [
          {
            assetUuid: 'asset-2',
            title: '  Download  ',
            caption: '  Read me  ',
            isPrivate: false,
          },
        ],
      }),
    );

    expect(typeof result).not.toBe('string');
    if (typeof result === 'string') return;
    expect(result.showcaseAssets).toEqual([
      { assetUuid: 'asset-1', caption: undefined, isPrivate: true },
    ]);
    expect(result.otherAssets).toEqual([
      {
        assetUuid: 'asset-2',
        title: 'Download',
        caption: 'Read me',
        isPrivate: false,
      },
    ]);
  });

  it('rejects duplicate showcase assets', () => {
    const result = validateProjectData(
      baseProject({
        showcaseAssets: [
          { assetUuid: 'asset-1', isPrivate: false },
          { assetUuid: 'asset-1', isPrivate: true },
        ],
      }),
    );

    expect(result).toBe('Duplicate showcase asset');
  });

  it('rejects duplicate other files', () => {
    const result = validateProjectData(
      baseProject({
        otherAssets: [
          { assetUuid: 'asset-1', title: 'One', isPrivate: false },
          { assetUuid: 'asset-1', title: 'Two', isPrivate: true },
        ],
      }),
    );

    expect(result).toBe('Duplicate other file');
  });
});

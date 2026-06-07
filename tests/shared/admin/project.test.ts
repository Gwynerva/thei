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
    slug: 'project',
    access: ProjectEventAccessLevel.Public,
    important: false,
    cv: false,
    ...overrides,
  };
}

describe('validateProjectData asset metadata', () => {
  it('requires a title for other files', () => {
    const result = validateProjectData(
      baseProject({
        otherAssets: [
          {
            assetUuid: 'asset-1',
            title: '   ',
            access: 'project',
          },
        ],
      }),
    );

    expect(result).toBe('Other file title cannot be empty');
  });

  it('rejects invalid showcase asset access', () => {
    const result = validateProjectData(
      baseProject({
        showcaseAssets: [
          {
            assetUuid: 'asset-1',
            caption: 'Preview',
            access: 'public' as 'project',
          },
        ],
      }),
    );

    expect(result).toBe('Invalid asset access');
  });

  it('rejects invalid other asset access', () => {
    const result = validateProjectData(
      baseProject({
        otherAssets: [
          {
            assetUuid: 'asset-1',
            title: 'Download',
            access: 'public' as 'project',
          },
        ],
      }),
    );

    expect(result).toBe('Invalid asset access');
  });

  it('trims asset metadata and drops empty captions', () => {
    const result = validateProjectData(
      baseProject({
        showcaseAssets: [
          {
            assetUuid: 'asset-1',
            caption: '  ',
            access: 'private',
          },
        ],
        otherAssets: [
          {
            assetUuid: 'asset-2',
            title: '  Download  ',
            caption: '  Read me  ',
            access: 'project',
          },
        ],
      }),
    );

    expect(typeof result).not.toBe('string');
    if (typeof result === 'string') return;
    expect(result.showcaseAssets).toEqual([
      { assetUuid: 'asset-1', caption: undefined, access: 'private' },
    ]);
    expect(result.otherAssets).toEqual([
      {
        assetUuid: 'asset-2',
        title: 'Download',
        caption: 'Read me',
        access: 'project',
      },
    ]);
  });
});

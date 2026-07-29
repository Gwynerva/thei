import { describe, expect, it } from 'vitest';
import {
  countProjectAssetPlacements,
  projectAssetUsageDelta,
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
    showcase: false,
    cv: false,
    ...overrides,
  };
}

describe('validateProjectData asset metadata', () => {
  it('counts project roles and calculates the open-draft usage delta', () => {
    const saved = baseProject({
      iconAssetUuid: 'asset-old',
      showcaseAssets: [{ assetUuid: 'asset-shared', isPrivate: false }],
      otherAssets: [
        {
          assetUuid: 'asset-shared',
          title: 'Shared',
          isPrivate: false,
        },
      ],
    });
    const current = baseProject({
      iconAssetUuid: 'asset-new',
      showcaseAssets: [{ assetUuid: 'asset-shared', isPrivate: false }],
      otherAssets: [
        {
          assetUuid: 'asset-new',
          title: 'New',
          isPrivate: false,
        },
      ],
    });

    expect(countProjectAssetPlacements(saved)).toEqual({
      'asset-old': 1,
      'asset-shared': 2,
    });
    expect(projectAssetUsageDelta(current, saved)).toEqual({
      'asset-new': 2,
      'asset-old': -1,
      'asset-shared': -1,
    });
  });

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

  it('normalizes relations and rejects duplicate projects', () => {
    const valid = validateProjectData(
      baseProject({
        relations: [
          {
            projectUuid: ' project-2 ',
            type: 'related',
            note: { type: 'shared', text: '  Shared history  ' },
          },
        ],
      }),
    );
    expect(typeof valid).not.toBe('string');
    if (typeof valid !== 'string') {
      expect(valid.relations).toEqual([
        {
          projectUuid: 'project-2',
          type: 'related',
          note: { type: 'shared', text: 'Shared history' },
        },
      ]);
    }

    expect(
      validateProjectData(
        baseProject({
          relations: [
            { projectUuid: 'project-2', type: 'related' },
            { projectUuid: 'project-2', type: 'dependent' },
          ],
        }),
      ),
    ).toBe('Duplicate related project');
  });
});

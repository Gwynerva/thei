import { describe, expect, it } from 'vitest';
import {
  countProjectAssetPlacements,
  projectAssetUsageDelta,
  projectTagRecommendationText,
  validateProjectData,
  type ProjectEditData,
} from '../../../shared/admin/project';
import { ProjectEventAccessLevel } from '../../../shared/access-level';
import {
  DEFAULT_PROJECT_ACTION,
  normalizeProjectActionBackgroundRepeat,
  projectActionAssetUuids,
  projectActionAutoAccent,
  projectActionIssues,
  type ProjectActionBackgroundRepeat,
  type ProjectActionBackgroundSize,
} from '../../../shared/project-action';

const BACKGROUND_SIZES: ProjectActionBackgroundSize[] = [
  'natural',
  'contain',
  'cover',
  'stretch',
];
const BACKGROUND_REPEATS: ProjectActionBackgroundRepeat[] = [
  'no-repeat',
  'repeat-x',
  'repeat-y',
  'repeat',
];

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
  it('normalizes an external-link action and counts its visual assets', () => {
    const result = validateProjectData(
      baseProject({
        action: {
          enabled: true,
          text: '  Open project  ',
          accentColor: '#AABBCC',
          isPrivate: false,
          target: 'external-link',
          externalUrl: 'https://example.com',
          iconMode: 'asset',
          iconAssetUuid: 'action-icon',
          backgroundMode: 'asset',
          backgroundAssetUuid: 'action-background',
          backgroundSize: 'contain',
          backgroundRepeat: 'repeat-x',
        },
      }),
    );
    expect(result).not.toBeTypeOf('string');
    expect(typeof result === 'string' ? result : result.action).toMatchObject({
      enabled: true,
      text: 'Open project',
      accentColor: '#777777',
      externalUrl: 'https://example.com/',
    });
    expect(
      countProjectAssetPlacements(
        baseProject({
          action: typeof result === 'string' ? undefined : result.action,
        }),
      ),
    ).toEqual({
      'action-icon': 1,
      'action-background': 1,
    });
  });

  it('validates action text by Unicode characters', () => {
    const action = {
      enabled: true,
      text: '🚀'.repeat(31),
      accentColor: '#123456',
      isPrivate: false,
      target: 'external-link' as const,
      externalUrl: 'https://example.com',
      iconMode: 'fallback' as const,
      backgroundMode: 'accent-gradient' as const,
      backgroundSize: 'natural' as const,
      backgroundRepeat: 'no-repeat' as const,
    };
    expect(validateProjectData(baseProject({ action }))).toBe(
      'Action button text must not exceed 30 characters',
    );
  });

  it('validates and preserves a color only for the manual color mode', () => {
    const hiddenColor = validateProjectData(
      baseProject({
        action: {
          ...DEFAULT_PROJECT_ACTION,
          enabled: true,
          text: 'Open',
          externalUrl: 'https://example.com',
          accentColor: 'invalid',
        },
      }),
    );
    expect(
      typeof hiddenColor === 'string' ? hiddenColor : hiddenColor.action,
    ).toMatchObject({ accentColor: DEFAULT_PROJECT_ACTION.accentColor });

    expect(
      validateProjectData(
        baseProject({
          action: {
            ...DEFAULT_PROJECT_ACTION,
            enabled: true,
            text: 'Open',
            externalUrl: 'https://example.com',
            backgroundMode: 'accent-gradient',
            accentColor: 'invalid',
          },
        }),
      ),
    ).toBe('Invalid action button color');
  });

  it('returns the exact canonical action when the button is disabled', () => {
    const result = validateProjectData(
      baseProject({
        action: {
          enabled: false,
          text: '   ',
          accentColor: '#123456',
          isPrivate: true,
          target: 'file',
          fileAssetUuid: 'file',
          iconMode: 'asset',
          iconAssetUuid: 'icon',
          backgroundMode: 'asset',
          backgroundAssetUuid: 'background',
          backgroundSize: 'natural',
          backgroundRepeat: 'repeat',
        },
      }),
    );
    expect(typeof result === 'string' ? result : result.action).toEqual({
      enabled: false,
      text: '',
      accentColor: '#777777',
      isPrivate: false,
      target: 'external-link',
      iconMode: 'fallback',
      backgroundMode: 'standard-gradient',
      backgroundSize: 'natural',
      backgroundRepeat: 'no-repeat',
    });
    expect(
      typeof result === 'string' ? undefined : result.action?.fileAssetUuid,
    ).toBeUndefined();
  });

  it('requires text for an enabled button', () => {
    expect(
      validateProjectData(
        baseProject({
          action: {
            ...DEFAULT_PROJECT_ACTION,
            enabled: true,
            text: '   ',
            externalUrl: 'https://example.com',
          },
        }),
      ),
    ).toBe('Action button text cannot be empty');
  });

  it('rejects unknown action modes', () => {
    const result = validateProjectData(
      baseProject({
        action: {
          enabled: true,
          text: 'Open',
          accentColor: '#123456',
          isPrivate: false,
          target: 'external-link',
          externalUrl: 'https://example.com',
          iconMode: 'fallback',
          backgroundMode: 'none',
          backgroundSize: 'natural',
          backgroundRepeat: 'no-repeat',
        } as unknown as ProjectEditData['action'],
      }),
    );
    expect(result).toBe('Invalid action button background mode');
  });

  it.each([
    [
      'size',
      { backgroundSize: 'unknown', backgroundRepeat: 'no-repeat' },
      'Invalid action button background size',
    ],
    [
      'repeat',
      { backgroundSize: 'natural', backgroundRepeat: 'unknown' },
      'Invalid action button background repeat',
    ],
  ])('rejects an invalid background %s', (_label, settings, message) => {
    expect(
      validateProjectData(
        baseProject({
          action: {
            enabled: true,
            text: 'Open',
            accentColor: '#123456',
            isPrivate: false,
            target: 'external-link',
            externalUrl: 'https://example.com',
            iconMode: 'fallback',
            backgroundMode: 'asset',
            backgroundAssetUuid: 'background',
            ...settings,
          } as ProjectEditData['action'],
        }),
      ),
    ).toBe(message);
  });

  it.each([
    ['target', { target: 'unknown' }, 'Invalid action button target'],
    ['icon mode', { iconMode: 'unknown' }, 'Invalid action button icon mode'],
    [
      'background mode',
      { backgroundMode: 'unknown' },
      'Invalid action button background mode',
    ],
  ])('rejects an invalid %s', (_label, patch, message) => {
    const result = validateProjectData(
      baseProject({
        action: {
          enabled: true,
          text: 'Open',
          accentColor: '#123456',
          isPrivate: false,
          target: 'external-link',
          externalUrl: 'https://example.com',
          iconMode: 'fallback',
          backgroundMode: 'standard-gradient',
          backgroundSize: 'natural',
          backgroundRepeat: 'no-repeat',
          ...patch,
        } as ProjectEditData['action'],
      }),
    );
    expect(result).toBe(message);
  });

  it.each([
    ['custom icon', { iconMode: 'asset' }, 'Action button icon is missing'],
    [
      'image background',
      { backgroundMode: 'asset' },
      'Action button background is missing',
    ],
  ])('requires a resource for %s', (_label, patch, message) => {
    expect(
      validateProjectData(
        baseProject({
          action: {
            enabled: true,
            text: 'Open',
            accentColor: '#123456',
            isPrivate: false,
            target: 'external-link',
            externalUrl: 'https://example.com',
            iconMode: 'fallback',
            backgroundMode: 'standard-gradient',
            backgroundSize: 'natural',
            backgroundRepeat: 'no-repeat',
            ...patch,
          } as ProjectEditData['action'],
        }),
      ),
    ).toBe(message);
  });

  it('shows the default icon instead of a favicon on a file button', () => {
    const result = validateProjectData(
      baseProject({
        action: {
          ...DEFAULT_PROJECT_ACTION,
          enabled: true,
          text: 'Download',
          target: 'file',
          fileAssetUuid: 'file',
          iconMode: 'favicon',
        },
      }),
    );
    expect(typeof result === 'string' ? result : result.action?.iconMode).toBe(
      'fallback',
    );
  });

  it.each([
    [
      'a file button without a file',
      { fileAssetUuid: undefined },
      'Action button file is missing',
    ],
  ])('rejects %s', (_label, patch, message) => {
    expect(
      validateProjectData(
        baseProject({
          action: {
            enabled: true,
            text: 'Download',
            accentColor: '#123456',
            isPrivate: false,
            target: 'file',
            fileAssetUuid: 'file',
            iconMode: 'fallback',
            backgroundMode: 'standard-gradient',
            backgroundSize: 'natural',
            backgroundRepeat: 'no-repeat',
            ...patch,
          } as ProjectEditData['action'],
        }),
      ),
    ).toBe(message);
  });

  it('normalizes meaningless repeat modes for cover and stretch backgrounds', () => {
    const result = validateProjectData(
      baseProject({
        action: {
          enabled: true,
          text: 'Open',
          accentColor: '#123456',
          isPrivate: false,
          target: 'external-link',
          externalUrl: 'https://example.com',
          iconMode: 'fallback',
          backgroundMode: 'asset',
          backgroundAssetUuid: 'background',
          backgroundSize: 'cover',
          backgroundRepeat: 'repeat',
        },
      }),
    );
    expect(typeof result === 'string' ? result : result.action).toMatchObject({
      backgroundSize: 'cover',
      backgroundRepeat: 'no-repeat',
    });
  });

  it.each(
    BACKGROUND_SIZES.flatMap((size) =>
      BACKGROUND_REPEATS.map((repeat) => [size, repeat] as const),
    ),
  )('normalizes background size %s with repeat %s', (size, repeat) => {
    expect(normalizeProjectActionBackgroundRepeat(size, repeat)).toBe(
      size === 'cover' || size === 'stretch' ? 'no-repeat' : repeat,
    );
  });

  it('takes the auto color from the displayed icon, then the target', () => {
    const icon = { hue: 20, chroma: 0.15 };
    const file = { hue: 140, chroma: 0.15 };
    const favicon = { hue: 260, chroma: 0.15 };
    expect(
      projectActionAutoAccent('external-link', { icon, file, favicon }),
    ).toBe(icon);
    expect(projectActionAutoAccent('file', { icon, file, favicon })).toBe(icon);
    expect(projectActionAutoAccent('file', { file, favicon })).toBe(file);
    expect(projectActionAutoAccent('external-link', { file, favicon })).toBe(
      favicon,
    );
    expect(projectActionAutoAccent('external-link', { file })).toBeUndefined();
  });

  it('keeps inactive settings out of the saved action and usage counts', () => {
    const action = {
      ...DEFAULT_PROJECT_ACTION,
      enabled: true,
      text: 'Open',
      target: 'external-link' as const,
      externalUrl: 'https://example.com',
      fileAssetUuid: 'file',
      iconMode: 'fallback' as const,
      iconAssetUuid: 'icon',
      backgroundMode: 'auto-gradient' as const,
      backgroundAssetUuid: 'background',
      accentColor: '#abcdef',
    };
    expect(projectActionAssetUuids(action)).toEqual([]);
    expect(projectActionAssetUuids({ ...action, enabled: false })).toEqual([]);
    expect(
      projectActionAssetUuids({
        ...action,
        target: 'file',
        iconMode: 'asset',
        backgroundMode: 'asset',
      }),
    ).toEqual(['file', 'icon', 'background']);

    const result = validateProjectData(baseProject({ action }));
    expect(typeof result === 'string' ? result : result.action).toEqual({
      enabled: true,
      text: 'Open',
      accentColor: DEFAULT_PROJECT_ACTION.accentColor,
      isPrivate: false,
      target: 'external-link',
      externalUrl: 'https://example.com/',
      fileAssetUuid: undefined,
      iconMode: 'fallback',
      iconAssetUuid: undefined,
      backgroundMode: 'auto-gradient',
      backgroundAssetUuid: undefined,
      backgroundSize: 'natural',
      backgroundRepeat: 'no-repeat',
    });
  });

  it('lists every unfilled setting of an enabled button', () => {
    expect(
      projectActionIssues({
        ...DEFAULT_PROJECT_ACTION,
        enabled: true,
        target: 'file',
        iconMode: 'asset',
        backgroundMode: 'accent-gradient',
        accentColor: '#12',
      }),
    ).toEqual(['text', 'file', 'icon', 'color']);
    expect(
      projectActionIssues({
        ...DEFAULT_PROJECT_ACTION,
        enabled: true,
        text: 'Open',
        externalUrl: 'ftp://example.com',
        backgroundMode: 'asset',
      }),
    ).toEqual(['url', 'background']);
    expect(projectActionIssues(DEFAULT_PROJECT_ACTION)).toEqual([]);
  });

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

  it('counts one asset usage per content container', () => {
    const repeatedAssetContent = {
      data: {
        blocks: [
          {
            type: 'contentMedia',
            data: { layout: 'centered', asset: { assetUuid: 'asset-shared' } },
          },
          {
            type: 'contentAttachment',
            data: { asset: { assetUuid: 'asset-shared' } },
          },
        ],
      },
    };
    const project = baseProject({
      descriptionContent: repeatedAssetContent,
      stages: [
        {
          title: 'Stage',
          summary: '',
          isPrivate: false,
          periods: [{ startDate: '2026-01-01', endDate: '2026-01-02' }],
          content: repeatedAssetContent,
        },
      ],
      contentSections: [
        {
          title: 'Section',
          summary: '',
          isPrivate: false,
          content: repeatedAssetContent,
        },
      ],
    });

    expect(countProjectAssetPlacements(project)).toEqual({
      'asset-shared': 3,
    });
  });

  it('builds tag recommendation text from stages and project sections', () => {
    const project = baseProject({
      stages: [
        {
          title: 'Discovery',
          summary: 'Interviews',
          isPrivate: false,
          periods: [{ startDate: '2026-01-01', endDate: '2026-01-02' }],
          content: {
            data: {
              blocks: [
                { type: 'paragraph', data: { text: 'Research findings' } },
              ],
            },
          },
        },
      ],
      contentSections: [
        {
          title: 'Design system',
          summary: 'Reusable patterns',
          isPrivate: false,
          content: {
            data: {
              blocks: [
                {
                  type: 'contentAttachment',
                  data: {
                    asset: { assetUuid: 'a-file' },
                    title: 'Token reference',
                  },
                },
              ],
            },
          },
        },
      ],
    });

    expect(projectTagRecommendationText(project)).toContain(
      'Discovery Interviews Research findings',
    );
    expect(projectTagRecommendationText(project)).toContain(
      'Design system Reusable patterns Token reference',
    );
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

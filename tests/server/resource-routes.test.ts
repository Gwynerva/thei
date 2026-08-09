import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');

const newRouteFiles = [
  'app/pages/admin/projects/new/index.vue',
  'app/pages/admin/projects/[projectUuid]/edit.vue',
  'app/pages/admin/tags/new/index.vue',
  'app/pages/admin/tags/[tagUuid]/edit.vue',
  'server/api/admin/assets/index.post.ts',
  'server/api/admin/assets/[assetUuid]/content.get.ts',
  'server/api/admin/assets/[assetUuid]/variants.get.ts',
  'server/api/admin/assets/[assetUuid]/variants.post.ts',
  'server/api/admin/assets/[assetUuid]/touches.post.ts',
  'server/api/admin/uploads/[uploadId].get.ts',
  'server/api/admin/session.post.ts',
  'server/api/admin/session.delete.ts',
  'server/api/generated-icons/[kind]/[seed].get.ts',
  'server/api/installation.post.ts',
];

const removedRouteFiles = [
  'app/pages/admin/projects/add/index.vue',
  'app/pages/admin/projects/edit/[projectUuid].vue',
  'app/pages/admin/tags/add/index.vue',
  'app/pages/admin/tags/edit/[tagUuid].vue',
  'server/api/admin/assets/upload.post.ts',
  'server/api/admin/assets/preview/[filename].get.ts',
  'server/api/admin/assets/variants.post.ts',
  'server/api/admin/assets/transform.post.ts',
  'server/api/admin/assets/touch.post.ts',
  'server/api/admin/assets/upload-progress/[uploadId].get.ts',
  'server/api/admin/projects/search.get.ts',
  'server/api/admin/tags/search.get.ts',
  'server/routes/sign-out.ts',
];

describe('resource routes', () => {
  it('exposes only the new route files', () => {
    for (const file of newRouteFiles) expect(existsSync(resolve(root, file)), file).toBe(true);
    for (const file of removedRouteFiles) expect(existsSync(resolve(root, file)), file).toBe(false);
  });

  it('does not retain old URL literals in application source', () => {
    const oldUrls = [
      '/api/public-admin',
      '/api/media/generated-icon',
      '/api/admin/projects/search',
      '/api/admin/tags/search',
      '/api/admin/assets/upload',
      '/api/admin/assets/variants',
      '/api/admin/assets/transform',
      '/api/admin/assets/touch',
      '/admin/projects/add',
      '/admin/projects/edit',
      '/admin/tags/add',
      '/admin/tags/edit',
      '/sign-out/',
    ];
    const sourceFiles = [
      'app/components/admin/bar/AdminBar.vue',
      'app/modals/upload-settings/use-upload-settings-assets.ts',
      'server/middleware/0.global.ts',
      'shared/api/asset.ts',
    ];
    const source = sourceFiles
      .map((file) => readFileSync(resolve(root, file), 'utf8'))
      .join('\n');
    for (const url of oldUrls) expect(source, url).not.toContain(url);
  });
});

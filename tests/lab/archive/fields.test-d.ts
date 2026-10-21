// The keys of the admin's forms, held against their types without a site:
// every key a form is read back with is one the seeder writes from the
// archive or keeps as the site has it (`fields.ts`, `FORM_KEYS`). A new
// field of a form fails here before any seeding meets it. Run by
// `bun run test:types` and `bun run lab test`.
import { expectTypeOf, test } from 'vitest';
import type { DiaryGetResponse } from '../../../shared/api/diary';
import type { EventGetResponse } from '../../../shared/api/event';
import type { PageGetResponse } from '../../../shared/api/page';
import type { ProjectGetResponse } from '../../../shared/api/project';
import type { ProjectEditData } from '../../../shared/admin/project';
import type { ProfileEditData } from '../../../shared/profile';
import type { TagEditData, TagItem } from '../../../shared/tag';
import type { DerivedFormKey, FormKeyKind, KnownFormKey } from './fields';

/** Keys of a form the seeder does not know: none, or the seeder lags. */
type Unknown<Form, Kind extends FormKeyKind> = Exclude<
  keyof Form,
  KnownFormKey<Kind> | DerivedFormKey
>;

test('a project form holds only keys the seeder knows', () => {
  expectTypeOf<Unknown<ProjectGetResponse, 'project'>>().toEqualTypeOf<never>();
  expectTypeOf<Unknown<ProjectEditData, 'project'>>().toEqualTypeOf<never>();
});

test('an event form holds only keys the seeder knows', () => {
  expectTypeOf<Unknown<EventGetResponse, 'event'>>().toEqualTypeOf<never>();
});

test('a diary form holds only keys the seeder knows', () => {
  expectTypeOf<Unknown<DiaryGetResponse, 'diary'>>().toEqualTypeOf<never>();
});

test('a page form holds only keys the seeder knows', () => {
  expectTypeOf<Unknown<PageGetResponse, 'page'>>().toEqualTypeOf<never>();
});

test('a tag form holds only keys the seeder knows', () => {
  expectTypeOf<Unknown<TagItem, 'tag'>>().toEqualTypeOf<never>();
  expectTypeOf<Unknown<TagEditData, 'tag'>>().toEqualTypeOf<never>();
});

test('the profile form holds only keys the seeder knows', () => {
  expectTypeOf<Unknown<ProfileEditData, 'profile'>>().toEqualTypeOf<never>();
});

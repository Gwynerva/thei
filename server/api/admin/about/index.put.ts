import type { ProfileEditData } from '#layers/thei/shared/profile';
import { EntityEditConflict, formVersion } from '../../../thei/entity-edit';
import { saveProfile } from '../../../thei/profile';

/** Saves the profile, refused when it changed since the form was read. */
export default defineEventHandler(async (event) => {
  const body = await readBody<ProfileEditData>(event);
  try {
    return await saveProfile(body, { expectedUpdatedAt: formVersion(body) });
  } catch (error) {
    if (error instanceof EntityEditConflict)
      throw createError({ statusCode: 409, message: error.message });
    throw error;
  }
});

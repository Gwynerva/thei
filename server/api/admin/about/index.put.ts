import type { ProfileEditData } from '#layers/thei/shared/profile';
import { saveProfile } from '../../../thei/profile';
export default defineEventHandler(async (event) =>
  saveProfile(await readBody<ProfileEditData>(event)),
);

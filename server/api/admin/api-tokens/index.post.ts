import { markReadOnlyRequest } from '../../../thei/read-only-request';
import {
  API_TOKEN_PRESET_NAMES,
  type ApiTokenCreateResponse,
  type ApiTokenPreset,
} from '#layers/thei/shared/api-token';
import { cleanApiTokenLabel, createApiToken } from '../../../thei/api-tokens';

export default defineEventHandler(
  async (event): Promise<ApiTokenCreateResponse> => {
    markReadOnlyRequest(event);
    const body = await readBody<{ label?: unknown; preset?: unknown }>(event);
    const label = cleanApiTokenLabel(body?.label);
    if (!label)
      throw createError({
        statusCode: 400,
        message: THEI_SERVER.phrase.api_token_label_required,
      });
    if (!API_TOKEN_PRESET_NAMES.includes(body?.preset as ApiTokenPreset))
      throw createError({ statusCode: 400, message: 'Invalid preset' });
    return createApiToken(label, body!.preset as ApiTokenPreset);
  },
);

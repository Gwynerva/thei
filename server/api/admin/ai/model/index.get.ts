import type { AiModelSettings } from '#layers/thei/shared/ai-model';
import { modelSettings } from '../../../../thei/ai/model/admin';

export default defineEventHandler((): AiModelSettings => modelSettings());

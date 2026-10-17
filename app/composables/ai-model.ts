import type { AiModelSettings } from '#layers/thei/shared/ai-model';

/**
 * The site's model as the connection has it — whether it is ready, its
 * name, what the month has spent — read once under one key for whatever
 * shows it, and read again under that key once the connection is saved.
 */
export function useAiModel() {
  const requestFetch = useRequestFetch();
  return useAsyncData('ai-model', () =>
    requestFetch<AiModelSettings>('/api/admin/ai/model'),
  );
}

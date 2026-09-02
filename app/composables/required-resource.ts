import type { Ref } from 'vue';

export function createResourceError(error: unknown) {
  const result = createError(error as Error);
  result.fatal = true;
  return result;
}

/** Check the API error before dereferencing a payload, including SSR 404s. */
export function useRequiredResource<T>(resource: {
  data: Ref<T | null | undefined>;
  error: Ref<unknown>;
}) {
  if (resource.error.value) throw createResourceError(resource.error.value);
  if (resource.data.value == null)
    throw createResourceError({
      statusCode: 502,
      statusMessage: 'Empty API response',
    });
  let previous: T = resource.data.value;
  watch(resource.error, (error) => {
    if (error) showError(createResourceError(error));
  });
  return computed(() => {
    if (resource.data.value != null) previous = resource.data.value;
    return previous;
  });
}

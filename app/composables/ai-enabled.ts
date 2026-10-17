/**
 * Whether AI is on for the site. It comes with the admin bar's summary,
 * which every admin page has, so nothing else asks: with AI off, no form,
 * widget or tab sends a single request about it.
 */

interface AdminSummary {
  projectCount: number;
  eventCount: number;
  diaryCount: number;
  aiEnabled: boolean;
  /** What waits for the owner in AI sessions: actions and questions. */
  aiWaiting: number;
}

/** The admin bar's summary, fetched once and shared under its key. */
export function useAdminSummary() {
  return useFetch<AdminSummary>('/api/admin/dashboard-summary', {
    key: 'admin-bar',
  });
}

/** `false` until the summary says otherwise. */
export function useAiEnabled() {
  const { data } = useNuxtData<AdminSummary>('admin-bar');
  return computed(() => data.value?.aiEnabled === true);
}

/** What waits for the owner in AI sessions; nothing with AI off. */
export function useAiWaiting() {
  const { data } = useNuxtData<AdminSummary>('admin-bar');
  return computed(() => (data.value?.aiEnabled ? data.value.aiWaiting : 0));
}

/** What waits for the owner, newly counted: the admin bar shows it at once. */
export function setAiWaiting(waiting: number) {
  const { data } = useNuxtData<AdminSummary>('admin-bar');
  if (data.value && data.value.aiWaiting !== waiting)
    data.value = { ...data.value, aiWaiting: waiting };
}

/** The owner turned AI on or off: every part of the page hears it at once. */
export function setAiEnabled(enabled: boolean) {
  const { data } = useNuxtData<AdminSummary>('admin-bar');
  if (data.value) data.value = { ...data.value, aiEnabled: enabled };
}

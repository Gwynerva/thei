import {
  buildLifeUrl,
  isLifeDay,
  isLifeDayNew,
  laterLifeDate,
  normalizeLifeLastViewedDate,
} from '#layers/thei/shared/life';

export const LIFE_LAST_VIEWED_STORAGE_KEY = 'thei:life:last-viewed-date:v1';
export const LIFE_VIEW_CONFIRMATION_DELAY = 3_000;

type LifeVisitTrackerDependencies = {
  getActiveDate: () => string;
  getNewestDate: () => string;
  getPath: () => string;
  isVisible: () => boolean;
  isFocused: () => boolean;
  read: () => string | null;
  write: (date: string) => void;
  remove: () => void;
  schedule: (
    callback: () => void,
    delay: number,
  ) => ReturnType<typeof setTimeout>;
  cancel: (timer: ReturnType<typeof setTimeout>) => void;
  onSessionCutoff?: (date: string | undefined) => void;
};

export function createLifeVisitTracker(
  dependencies: LifeVisitTrackerDependencies,
) {
  let sessionCutoff: string | undefined;
  let operationalCutoff: string | undefined;
  let ready = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timerDate: string | undefined;

  function clearConfirmation() {
    if (timer !== undefined) dependencies.cancel(timer);
    timer = undefined;
    timerDate = undefined;
  }

  function isEligible(date: string) {
    return (
      ready &&
      isLifeDay(date) &&
      dependencies.isVisible() &&
      dependencies.isFocused() &&
      dependencies.getPath() === buildLifeUrl(date) &&
      (!operationalCutoff || date > operationalCutoff)
    );
  }

  function confirm(date: string) {
    timer = undefined;
    timerDate = undefined;
    if (!isEligible(date) || dependencies.getActiveDate() !== date) return;
    const persisted = normalizeLifeLastViewedDate(
      dependencies.read(),
      dependencies.getNewestDate(),
    );
    const next = laterLifeDate(persisted ?? operationalCutoff, date);
    dependencies.write(next);
    operationalCutoff = next;
  }

  function considerActiveDay() {
    const date = dependencies.getActiveDate();
    if (!isEligible(date)) {
      clearConfirmation();
      return;
    }
    if (timer !== undefined && timerDate === date) return;
    clearConfirmation();
    timerDate = date;
    timer = dependencies.schedule(
      () => confirm(date),
      LIFE_VIEW_CONFIRMATION_DELAY,
    );
  }

  function initialize() {
    const stored = dependencies.read();
    const normalized = normalizeLifeLastViewedDate(
      stored,
      dependencies.getNewestDate(),
    );
    sessionCutoff = normalized;
    operationalCutoff = normalized;
    ready = true;
    dependencies.onSessionCutoff?.(normalized);
    if (stored && normalized !== stored) {
      if (normalized) dependencies.write(normalized);
      else dependencies.remove();
    }
    considerActiveDay();
  }

  return {
    initialize,
    considerActiveDay,
    clearConfirmation,
    isNewDate: (date: string) => ready && isLifeDayNew(date, sessionCutoff),
  };
}

export function useLifeLastVisit(options: {
  activeDate: Readonly<Ref<string>>;
  newestDate: Readonly<Ref<string>>;
}) {
  const sessionCutoff = ref<string>();

  function readStoredDate() {
    try {
      return localStorage.getItem(LIFE_LAST_VIEWED_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  const tracker = createLifeVisitTracker({
    getActiveDate: () => options.activeDate.value,
    getNewestDate: () => options.newestDate.value,
    getPath: () => window.location.pathname,
    isVisible: () => document.visibilityState === 'visible',
    isFocused: () => document.hasFocus(),
    read: readStoredDate,
    write: (date) => {
      try {
        localStorage.setItem(LIFE_LAST_VIEWED_STORAGE_KEY, date);
      } catch {}
    },
    remove: () => {
      try {
        localStorage.removeItem(LIFE_LAST_VIEWED_STORAGE_KEY);
      } catch {}
    },
    schedule: (callback, delay) => setTimeout(callback, delay),
    cancel: (timer) => clearTimeout(timer),
    onSessionCutoff: (date) => {
      sessionCutoff.value = date;
    },
  });

  function handleVisibilityChange() {
    tracker.considerActiveDay();
  }

  onMounted(() => {
    tracker.initialize();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', tracker.considerActiveDay);
    window.addEventListener('blur', tracker.clearConfirmation);
  });

  watch(options.activeDate, tracker.considerActiveDay);

  onBeforeUnmount(() => {
    tracker.clearConfirmation();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('focus', tracker.considerActiveDay);
    window.removeEventListener('blur', tracker.clearConfirmation);
  });

  return {
    sessionCutoff: readonly(sessionCutoff),
    isNewDate: tracker.isNewDate,
    considerActiveDay: tracker.considerActiveDay,
  };
}

import type { EventEditData } from '#layers/thei/shared/event';

export const eventDataInjectionKey = Symbol('eventData') as InjectionKey<
  Ref<EventEditData>
>;

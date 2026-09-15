import type { BootUpdateDetails } from '#layers/thei/server/thei/boot/result';

export default defineNuxtPlugin(() => {
  const event = useRequestEvent();
  const bootUpdate = useState<BootUpdateDetails | undefined>('boot-update');
  bootUpdate.value = event?.context.bootUpdate as BootUpdateDetails | undefined;
});

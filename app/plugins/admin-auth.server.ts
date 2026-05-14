export default defineNuxtPlugin(() => {
  const event = useRequestEvent();
  useState<boolean>('is-admin', () => false).value =
    (event?.context.isAdmin as boolean) ?? false;
});

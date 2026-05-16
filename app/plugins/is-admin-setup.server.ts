export default defineNuxtPlugin(() => {
  const event = useRequestEvent();
  const isAdmin = useState<boolean>('is-admin');
  isAdmin.value = (event?.context.isAdmin as boolean) ?? false;
});

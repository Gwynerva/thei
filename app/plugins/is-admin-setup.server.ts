export default defineNuxtPlugin(() => {
  const event = useRequestEvent();
  const isAdmin = useState<boolean>('is-admin');
  isAdmin.value =
    (event?.context.isAuthenticatedAdmin as boolean | undefined) ?? false;
});

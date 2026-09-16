export default defineNuxtPlugin(() => {
  const event = useRequestEvent();
  const siteOrigin = useState<string>('site-origin');
  siteOrigin.value = (event?.context.siteOrigin as string | undefined) ?? '';
});

export const useLiveNow = () => {
  const liveNow = useState<number>('live-now');
  return readonly(liveNow);
};
